package attach

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/api"
)

func still() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

// ---- Attrappen -------------------------------------------------------------

// festeSenke sammelt Rahmen im Speicher.
type festeSenke struct {
	mu     sync.Mutex
	frames []api.ServerMessage
	raus   chan api.ServerMessage
}

func neueSenke() *festeSenke { return &festeSenke{raus: make(chan api.ServerMessage, 4096)} }

func (s *festeSenke) SendText(text string) error {
	var m api.ServerMessage
	if err := json.Unmarshal([]byte(text), &m); err != nil {
		return err
	}
	s.mu.Lock()
	s.frames = append(s.frames, m)
	s.mu.Unlock()
	select {
	case s.raus <- m:
	default:
	}
	return nil
}

func (s *festeSenke) Close() error { return nil }

func (s *festeSenke) naechster(t *testing.T, frist time.Duration) api.ServerMessage {
	t.Helper()
	select {
	case m := <-s.raus:
		return m
	case <-time.After(frist):
		t.Fatalf("kein Rahmen innerhalb von %s", frist)
		return api.ServerMessage{}
	}
}

// letzterRahmen liefert den zuletzt angekommenen Rahmen.
func (s *festeSenke) letzterRahmen() api.ServerMessage {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.frames) == 0 {
		return api.ServerMessage{}
	}
	return s.frames[len(s.frames)-1]
}

func (s *festeSenke) anzahl() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.frames)
}

// fehlenderEndpunkt schlaegt beim Oeffnen sichtbar fehl.
type fehlenderEndpunkt struct{}

func (f *fehlenderEndpunkt) Name() string { return "kaputt" }
func (f *fehlenderEndpunkt) Open(context.Context, string, string, string) (Source, error) {
	return nil, ErrUpstreamNichtErreichbar
}

// ---- Hilfen ---------------------------------------------------------------

func neuerHub(t *testing.T, cfg Config) (*Hub, *Memory) {
	t.Helper()
	memory := NewMemory(still())
	return New(memory, cfg, still()), memory
}

func anhaengen(t *testing.T, h *Hub, view, window string) (*Session, *festeSenke) {
	t.Helper()
	senke := neueSenke()
	session, err := h.Attach(context.Background(), senke, Statement{View: view, WindowID: window})
	if err != nil {
		t.Fatalf("anhaengen fehlgeschlagen: %v", err)
	}
	return session, senke
}

// ---- Anhaengung und Fan-out ------------------------------------------------

// TestTwoClientsSameViewBothReceiveRelayedEventWithSequenceNumbers prueft den
// Kern: ein Upstream-Strom, zwei Clients derselben Sicht, beide bekommen
// dieselben Ereignisse mit denselben fortlaufenden Sequenznummern.
func TestTwoClientsSameViewBothReceiveRelayedEventWithSequenceNumbers(t *testing.T) {
	hub, memory := neuerHub(t, Config{Queue: 16, History: 16})
	a, senkeA := anhaengen(t, hub, "session", "links")
	b, senkeB := anhaengen(t, hub, "session", "rechts")

	if a.StreamID() != b.StreamID() {
		t.Fatalf("verschiedene Stroeme: %q und %q", a.StreamID(), b.StreamID())
	}
	if hub.Stroeme() != 1 {
		t.Fatalf("Stroeme = %d, erwartet 1", hub.Stroeme())
	}

	for _, senke := range []*festeSenke{senkeA, senkeB} {
		ready := senke.naechster(t, time.Second)
		if ready.Type != api.FrameReady {
			t.Fatalf("erster Rahmen = %q, erwartet ready", ready.Type)
		}
		if ready.StreamID != "session" || ready.View != "session" {
			t.Errorf("ready = %+v", ready)
		}
	}

	if n := memory.Publish("session", Event("session/message", map[string]any{"text": "hallo"}, true)); n != 1 {
		t.Fatalf("Quellen erreicht = %d, erwartet 1", n)
	}
	memory.Publish("session", Event("session/message", map[string]any{"text": "zwei"}, true))
	memory.Publish("session", Event("session/message", map[string]any{"text": "drei"}, true))

	for _, senke := range []*festeSenke{senkeA, senkeB} {
		for _, want := range []uint64{1, 2, 3} {
			m := senke.naechster(t, time.Second)
			if m.Type != api.FrameEvent {
				t.Fatalf("Rahmen = %q, erwartet event", m.Type)
			}
			if m.Seq != want {
				t.Fatalf("Sequenz = %d, erwartet %d", m.Seq, want)
			}
			if m.StreamID != "session" {
				t.Errorf("streamId = %q", m.StreamID)
			}
			if m.Event != "session/message" {
				t.Errorf("event = %q", m.Event)
			}
			if !m.Droppable {
				t.Errorf("event muss als droppable markiert sein")
			}
		}
	}
}

// TestDifferentViewsUseDifferentStreams prueft, dass die Sicht den Strom
// waehlt: zwei Ansichten teilen sich keinen Upstream-Strom.
func TestDifferentViewsUseDifferentStreams(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 8, History: 8})
	a, _ := anhaengen(t, hub, "session", "links")
	b, _ := anhaengen(t, hub, "terminal", "links")
	c, _ := anhaengen(t, hub, "files", "baum")

	if a.StreamID() == b.StreamID() || b.StreamID() == c.StreamID() {
		t.Fatalf("Stroeme nicht getrennt: %q %q %q", a.StreamID(), b.StreamID(), c.StreamID())
	}
	if hub.Stroeme() != 3 {
		t.Fatalf("Stroeme = %d, erwartet 3", hub.Stroeme())
	}
}

// TestAttachRejectsIncompleteAttachment prueft die Grenzen der Anhaengung.
func TestAttachRejectsIncompleteAttachment(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 8, History: 8})
	faelle := []Statement{
		{View: "", WindowID: "x"},
		{View: "session", WindowID: ""},
		{View: strings.Repeat("z", api.MaxViewLen+1), WindowID: "x"},
		{View: "session", WindowID: strings.Repeat("z", api.MaxWindowIDLen+1)},
	}
	for _, s := range faelle {
		if _, err := hub.Attach(context.Background(), neueSenke(), s); err == nil {
			t.Errorf("Anhaengung %+v wurde angenommen", s)
		} else if !errors.Is(err, ErrUngueltigeAnhaengung) {
			t.Errorf("Fehler = %v, erwartet ErrUngueltigeAnhaengung", err)
		}
	}
	if hub.Stroeme() != 0 {
		t.Errorf("keine Anhaengung darf einen Strom oeffnen, Stroeme = %d", hub.Stroeme())
	}
}

// TestAttachFailsVisiblyWhenUpstreamIsMissing prueft Regel 3: ein fehlender
// Upstream ist ein sichtbarer Fehler, kein stiller Ausfall.
func TestAttachFailsVisiblyWhenUpstreamIsMissing(t *testing.T) {
	hub := New(&fehlenderEndpunkt{}, Config{Queue: 4, History: 4}, still())
	session, err := hub.Attach(context.Background(), neueSenke(), Statement{View: "session", WindowID: "x"})
	if err == nil {
		t.Fatalf("Attach haette scheitern muessen, bekam Session %v", session)
	}
	if !errors.Is(err, ErrUpstreamNichtErreichbar) {
		t.Fatalf("Fehler = %v, erwartet ErrUpstreamNichtErreichbar", err)
	}
	if hub.Clients() != 0 {
		t.Errorf("ein gescheiterter Attach darf keinen Client hinterlassen")
	}
}

// ---- Sequenz und Luecke ----------------------------------------------------

// TestResyncAfterForcedGapYieldsFullStateFrame prueft die Lueckenerkennung:
// der Client fordert nach einer Luecke den vollen Zustand an und bekommt ihn
// mit gap=true und den noch vorhandenen Rahmen.
func TestResyncAfterForcedGapYieldsFullStateFrame(t *testing.T) {
	hub, memory := neuerHub(t, Config{Queue: 32, History: 8})
	session, senke := anhaengen(t, hub, "graph", "knoten")
	if ready := senke.naechster(t, time.Second); ready.Type != api.FrameReady {
		t.Fatalf("erster Rahmen = %q", ready.Type)
	}

	// Der Ring fasst 8 Rahmen; 20 Ereignisse lassen ihn ueberlaufen.
	for i := 0; i < 20; i++ {
		memory.Publish("graph", Event("graph/delta", map[string]any{"i": i}, true))
	}
	for i := 0; i < 20; i++ {
		m := senke.naechster(t, time.Second)
		if m.Seq != uint64(i+1) {
			t.Fatalf("Sequenz = %d, erwartet %d", m.Seq, i+1)
		}
	}

	// Der Client hat bis 10 gesehen und fordert den vollen Zustand an.
	frame := hub.Resync(session, 10)
	if frame.Type != api.FrameSnapshot {
		t.Fatalf("Rahmen = %q, erwartet snapshot", frame.Type)
	}
	if !frame.Gap {
		t.Errorf("gap muss true sein: die Rahmen 11 und 12 sind nicht mehr im Ring")
	}
	if frame.FromSeq != 12 {
		t.Errorf("fromSeq = %d, erwartet 12", frame.FromSeq)
	}
	if frame.Seq != 20 {
		t.Errorf("seq = %d, erwartet 20", frame.Seq)
	}
	if len(frame.Messages) != 8 {
		t.Fatalf("Rahmen im Zustand = %d, erwartet 8", len(frame.Messages))
	}
	if frame.Messages[0].Seq != 13 || frame.Messages[7].Seq != 20 {
		t.Errorf("Zustand reicht von %d bis %d, erwartet 13..20",
			frame.Messages[0].Seq, frame.Messages[7].Seq)
	}
	if frame.StreamID != "graph" || frame.View != "graph" {
		t.Errorf("snapshot nennt den Strom nicht: %+v", frame)
	}
}

// TestResyncWithoutGapReportsNoGap prueft den Fall ohne Luecke.
func TestResyncWithoutGapReportsNoGap(t *testing.T) {
	hub, memory := neuerHub(t, Config{Queue: 16, History: 16})
	session, senke := anhaengen(t, hub, "files", "baum")
	senke.naechster(t, time.Second)

	for i := 0; i < 3; i++ {
		memory.Publish("files", Event("files/change", map[string]any{"i": i}, true))
	}
	frame := hub.Resync(session, 2)
	if frame.Gap {
		t.Errorf("ohne Ringueberlauf darf gap nicht true sein: %+v", frame)
	}
	if len(frame.Messages) != 1 || frame.Messages[0].Seq != 3 {
		t.Errorf("Zustand = %+v, erwartet genau Rahmen 3", frame.Messages)
	}
}

// TestSequenceIsMonotonicAndPerStream prueft die Sequenzregel: fortlaufend je
// Strom, beginnend bei 1, ohne Doppelung.
func TestSequenceIsMonotonicAndPerStream(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 8, History: 8})
	a, _ := anhaengen(t, hub, "session", "a")
	b, _ := anhaengen(t, hub, "terminal", "b")

	var letzte uint64
	for i := 0; i < 5; i++ {
		seq := hub.Relay(a.StreamID(), Message{Event: "e", Droppable: true})
		if seq != letzte+1 {
			t.Fatalf("Sequenz %d nach %d", seq, letzte)
		}
		letzte = seq
	}
	if erste := hub.Relay(b.StreamID(), Message{Event: "e", Droppable: true}); erste != 1 {
		t.Fatalf("der zweite Strom beginnt bei %d, erwartet 1", erste)
	}
}

// ---- Langsamer Client ------------------------------------------------------

// TestSlowClientIsDroppedWithoutStallingFastClient ist der Kerntest der
// Ueberlaufpolitik: ein Client, der nicht liest, verliert altere droppable
// Rahmen (drop-oldest), der schnelle Client bekommt ALLE Rahmen ohne Stocken.
func TestSlowClientIsDroppedWithoutStallingFastClient(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 4, History: 4})

	schnell := neueSenke()
	schnellSession, err := hub.Attach(context.Background(), schnell, Statement{View: "session", WindowID: "schnell"})
	if err != nil {
		t.Fatalf("anhaengen: %v", err)
	}
	langsam := neueSenke()
	langsamSession, err := hub.Attach(context.Background(), langsam, Statement{View: "session", WindowID: "langsam"})
	if err != nil {
		t.Fatalf("anhaengen: %v", err)
	}

	const anzahl = 40
	fertig := make(chan struct{})
	go func() {
		defer close(fertig)
		for i := 0; i < anzahl; i++ {
			select {
			case <-schnell.raus:
			case <-time.After(5 * time.Second):
				return
			}
		}
	}()

	start := time.Now()
	for i := 0; i < anzahl; i++ {
		hub.Relay("session", Message{
			Event:     "session/message",
			Args:      json.RawMessage(`{"i":` + itoa(uint64(i)) + `}`),
			Droppable: true,
		})
	}
	dauer := time.Since(start)
	<-fertig

	if dauer > 2*time.Second {
		t.Fatalf("das Verteilen von %d Rahmen dauerte %s: ein Client hat die anderen angehalten", anzahl, dauer)
	}
	if langsamSession.Dropped() == 0 {
		t.Errorf("der langsame Client hat nichts verworfen (Warteschlange %d)", langsamSession.FramesLen())
	}
	if schnellSession.Dropped() != 0 {
		t.Errorf("der schnelle Client hat %d Rahmen verloren", schnellSession.Dropped())
	}
	if !langsamSession.Closed() {
		t.Errorf("der langsame Client haette getrennt werden muessen")
	}
	if letzter := schnell.letzterRahmen(); letzter.Seq != anzahl {
		t.Errorf("der schnelle Client sah zuletzt %d, erwartet %d", letzter.Seq, anzahl)
	}
	if letzterLangsam := langsam.letzterRahmen(); letzterLangsam.Error == nil {
		t.Errorf("der langsame Client hat keinen Fehlerrahmen bekommen: %+v", letzterLangsam)
	} else if letzterLangsam.Error.Code != api.CodePeerLagged {
		t.Errorf("Fehlercode = %q, erwartet %q", letzterLangsam.Error.Code, api.CodePeerLagged)
	}
}

// TestNonDroppableOverflowDisconnectsClient prueft die zweite Haelfte der
// Politik: ein nicht droppbarer Rahmen darf nie verworfen werden, also wird
// der Client getrennt.
func TestNonDroppableOverflowDisconnectsClient(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 2, History: 2})
	session, senke := anhaengen(t, hub, "session", "x")
	senke.naechster(t, time.Second) // ready

	// Zwei nicht droppbare Rahmen fuellen die Warteschlange.
	hub.Relay("session", Message{Event: "zustand", Droppable: false})
	hub.Relay("session", Message{Event: "zustand", Droppable: false})
	// Der dritte laesst sich nicht mehr unterbringen.
	hub.Relay("session", Message{Event: "zustand", Droppable: false})

	if !session.Closed() {
		t.Fatalf("die Session haette getrennt werden muessen")
	}
	if hub.Clients() != 0 {
		t.Errorf("der Client steht noch im Hub")
	}
	if session.Dropped() != 0 {
		t.Errorf("nicht droppbare Rahmen duerfen nicht verworfen werden, verworfen = %d", session.Dropped())
	}
	var sahFehler bool
	for i := 0; i < 3; i++ {
		m := senke.naechster(t, time.Second)
		if m.Error != nil && m.Error.Code == api.CodePeerLagged {
			sahFehler = true
		}
	}
	if !sahFehler {
		t.Error("der getrennte Client hat keinen Fehlerrahmen gesehen")
	}
}

// TestDetachedClientStopsReceiving prueft den Lebenslauf: nach detach kommt
// nichts mehr an.
func TestDetachedClientStopsReceiving(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 16, History: 16})
	bleibt, senkeBleibt := anhaengen(t, hub, "session", "bleibt")
	geht, senkeGeht := anhaengen(t, hub, "session", "geht")
	senkeBleibt.naechster(t, time.Second)
	senkeGeht.naechster(t, time.Second)

	hub.Relay("session", Message{Event: "vorher", Droppable: true})
	if m := senkeGeht.naechster(t, time.Second); m.Event != "vorher" {
		t.Fatalf("Rahmen = %+v", m)
	}
	vorher := senkeGeht.anzahl()

	if !hub.Detach(geht.ID()) {
		t.Fatal("detach hat nichts gefunden")
	}
	if !geht.Closed() {
		t.Error("die abgehaengte Session muss beendet sein")
	}
	if hub.Clients() != 1 {
		t.Errorf("Clients = %d, erwartet 1", hub.Clients())
	}

	hub.Relay("session", Message{Event: "nachher", Droppable: true})
	time.Sleep(50 * time.Millisecond)
	if nachher := senkeGeht.anzahl(); nachher != vorher {
		t.Fatalf("die abgehaengte Sicht hat %d weitere Rahmen bekommen", nachher-vorher)
	}
	if m := senkeBleibt.naechster(t, time.Second); m.Event != "nachher" {
		t.Fatalf("die verbundene Sicht hat %+v bekommen", m)
	}
	_ = bleibt
}

// TestDetachIsIdempotent prueft den doppelten Aufruf.
func TestDetachIsIdempotent(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 8, History: 8})
	session, _ := anhaengen(t, hub, "session", "x")
	if !hub.Detach(session.ID()) {
		t.Fatal("erstes detach")
	}
	if hub.Detach(session.ID()) {
		t.Error("zweites detach hat wieder etwas gefunden")
	}
	hub.Remove(session)
}

// ---- Lebenslauf des Hubs ---------------------------------------------------

// TestSecondStreamReusesExistingUpstream prueft, dass zwei Fenster derselben
// Sicht genau EINEN Upstream-Strom oeffnen.
func TestSecondStreamReusesExistingUpstream(t *testing.T) {
	hub, memory := neuerHub(t, Config{Queue: 8, History: 8})
	anhaengen(t, hub, "terminal", "links")
	anhaengen(t, hub, "terminal", "rechts")
	anhaengen(t, hub, "terminal", "oben")

	if n := memory.Quellen("terminal"); n != 1 {
		t.Fatalf("Quellen = %d, erwartet 1", n)
	}
	if hub.Stroeme() != 1 {
		t.Fatalf("Stroeme = %d, erwartet 1", hub.Stroeme())
	}
}

// TestUpstreamEndBecomesVisible prueft, dass ein endender Upstream sichtbar
// gemeldet wird: erst ein Ereignis, dann der Abschlussrahmen.
func TestUpstreamEndBecomesVisible(t *testing.T) {
	memory := NewMemory(still())
	hub := New(memory, Config{Queue: 16, History: 16}, still())
	_, senke := anhaengen(t, hub, "session", "x")
	senke.naechster(t, time.Second)
	if memory.Quellen("session") != 1 {
		t.Fatalf("Quellen = %d", memory.Quellen("session"))
	}

	// Die Quelle des Stroms schliessen: der Verteiler meldet das sichtbar.
	memory.mu.Lock()
	quellen := append([]*memorySource(nil), memory.sources["session"]...)
	memory.mu.Unlock()
	for _, q := range quellen {
		_ = q.Close()
	}

	m := senke.naechster(t, 2*time.Second)
	if m.Type != api.FrameEvent || m.Event != "attach/upstream-gone" {
		t.Fatalf("Rahmen = %+v, erwartet attach/upstream-gone", m)
	}
	if m.Droppable {
		t.Error("das Endereignis darf nicht droppable sein")
	}
	if m2 := senke.naechster(t, 2*time.Second); m2.Type != api.FrameEnd {
		t.Fatalf("zweiter Rahmen = %q, erwartet end", m2.Type)
	}
}

// TestShutdownDetachesEveryClient prueft das geordnete Ende.
func TestShutdownDetachesEveryClient(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 8, History: 8})
	a, senkeA := anhaengen(t, hub, "session", "a")
	b, senkeB := anhaengen(t, hub, "terminal", "b")
	senkeA.naechster(t, time.Second)
	senkeB.naechster(t, time.Second)

	hub.Shutdown()
	if hub.Clients() != 0 || hub.Stroeme() != 0 {
		t.Errorf("nach Shutdown: clients %d, streams %d", hub.Clients(), hub.Stroeme())
	}
	if !a.Closed() || !b.Closed() {
		t.Error("alle Sessions muessen geschlossen sein")
	}
	for _, senke := range []*festeSenke{senkeA, senkeB} {
		m := senke.naechster(t, time.Second)
		if m.Error == nil || m.Error.Code != api.CodeCancelled {
			t.Errorf("Abschlussrahmen = %+v, erwartet gateway/cancelled", m)
		}
	}
	hub.Shutdown()
}

// TestResyncUnknownStreamIsVisible prueft resync nach dem Ende des Stroms.
func TestResyncUnknownStreamIsVisible(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 8, History: 8})
	session, _ := anhaengen(t, hub, "session", "x")
	hub.Shutdown()
	frame := hub.Resync(session, 0)
	if frame.Type != api.FrameError || frame.Error == nil {
		t.Fatalf("Rahmen = %+v, erwartet error", frame)
	}
	if frame.Error.Code != api.CodeUpstreamGone {
		t.Errorf("Fehlercode = %q", frame.Error.Code)
	}
}
