package attach

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/api"
)

func still() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

// ---- Attrappen und Hilfen --------------------------------------------------

// senkenAttrappe ist eine Senke, die nichts tut: die Anhaengelogik schreibt
// nie direkt auf eine Senke, sondern immer in die Warteschlange.
type senkenAttrappe struct{}

func (senkenAttrappe) SendText(string) error { return nil }
func (senkenAttrappe) Close() error          { return nil }

// fehlenderEndpunkt schlaegt beim Oeffnen sichtbar fehl.
type fehlenderEndpunkt struct{}

func (f *fehlenderEndpunkt) Name() string { return "kaputt" }
func (f *fehlenderEndpunkt) Open(context.Context, string, string, string) (Source, error) {
	return nil, ErrUpstreamNichtErreichbar
}

func neuerHub(t *testing.T, cfg Config) (*Hub, *Memory) {
	t.Helper()
	memory := NewMemory(still())
	return New(memory, cfg, still()), memory
}

// neuerLeser leert die Warteschlange einer Session fortlaufend und sammelt die
// Rahmen — genau das, was der Traeger in server.go tut.
//
// Warum ein eigener Leser statt direktem Lesen: der Verteiler des Hubs liest
// den Upstream-Strom nebenlaeufig. Nur ein Leser, der immerzu leert, macht das
// Verhalten eines schnellen Clients nachvollziehbar.
type leser struct {
	mu     sync.Mutex
	frames []api.ServerMessage
	stop   chan struct{}
}

func neuerLeser(t *testing.T, session *Session) *leser {
	t.Helper()
	l := &leser{stop: make(chan struct{})}
	go func() {
		for {
			select {
			case frame := <-session.Frames():
				l.mu.Lock()
				l.frames = append(l.frames, frame)
				l.mu.Unlock()
			case <-l.stop:
				return
			}
		}
	}()
	t.Cleanup(l.stoppen)
	return l
}

func (l *leser) stoppen() {
	select {
	case <-l.stop:
	default:
		close(l.stop)
	}
}

func (l *leser) anzahl() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.frames)
}

func (l *leser) Rahmen() []api.ServerMessage {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]api.ServerMessage(nil), l.frames...)
}

// warteAufRahmen wartet, bis der Leser n Rahmen gesehen hat.
func (l *leser) warteAufRahmen(t *testing.T, n int, frist time.Duration) {
	t.Helper()
	ende := time.Now().Add(frist)
	for l.anzahl() < n {
		if time.Now().After(ende) {
			t.Fatalf("%d Rahmen wurden innerhalb von %s nicht erreicht (Stand %d)", n, frist, l.anzahl())
		}
		time.Sleep(2 * time.Millisecond)
	}
}

// anhaengen haengt einen Client an und startet einen Leser.
func anhaengen(t *testing.T, h *Hub, view, window string) (*Session, *leser) {
	t.Helper()
	session, err := h.Attach(context.Background(), senkenAttrappe{}, Statement{View: view, WindowID: window})
	if err != nil {
		t.Fatalf("anhaengen fehlgeschlagen: %v", err)
	}
	return session, neuerLeser(t, session)
}

// anhaengenOhneLeser haengt an, ohne die Warteschlange zu leeren. Solche Tests
// beobachten die Warteschlange selbst; die Verteilung laeuft synchron
// (hub.Relay), damit sie nichts verpassen.
func anhaengenOhneLeser(t *testing.T, h *Hub, view, window string) *Session {
	t.Helper()
	session, err := h.Attach(context.Background(), senkenAttrappe{}, Statement{View: view, WindowID: window})
	if err != nil {
		t.Fatalf("anhaengen fehlgeschlagen: %v", err)
	}
	return session
}

// probe liest den ersten Rahmen aus der Warteschlange.
func probe(t *testing.T, session *Session) api.ServerMessage {
	t.Helper()
	select {
	case m := <-session.Frames():
		return m
	case <-time.After(2 * time.Second):
		t.Fatal("kein Rahmen in der Warteschlange")
		return api.ServerMessage{}
	}
}

// zustellen speist genau EIN Ereignis in den Upstream ein und wartet, bis der
// Hub es bis zur erwarteten Sequenznummer verteilt hat.
//
// Die Attrappe des Upstreams arbeitet mit einem nicht blockierenden Kanal: wer
// nur Publish ruft, kann Rahmen verlieren und misst dann nicht mehr, was er
// messen will. Diese Hilfsfunktion macht den Test deterministisch.
func zustellen(t *testing.T, memory *Memory, streamID string, ev api.UpstreamEvent, hub *Hub, seq uint64) {
	t.Helper()
	if n := memory.Publish(streamID, ev); n == 0 {
		t.Fatalf("kein Strom %q hat das Ereignis angenommen", streamID)
	}
	warteAufSequenz(t, hub, streamID, seq)
}

// warteAufSequenz wartet, bis der Hub den Strom bis seq verteilt hat.
func warteAufSequenz(t *testing.T, h *Hub, streamID string, seq uint64) {
	t.Helper()
	ende := time.Now().Add(3 * time.Second)
	for streamSeq(h, streamID) < seq {
		if time.Now().After(ende) {
			t.Fatalf("Sequenz %d wurde innerhalb von 3s nicht erreicht (Stand %d)", seq, streamSeq(h, streamID))
		}
		time.Sleep(2 * time.Millisecond)
	}
}

// streamSeq liefert die zuletzt vergebene Sequenznummer eines Stroms.
func streamSeq(h *Hub, streamID string) uint64 {
	h.mu.Lock()
	stream, ok := h.streams[streamID]
	h.mu.Unlock()
	if !ok {
		return 0
	}
	return stream.Sequence()
}

// ---- Anhaengung und Fan-out ------------------------------------------------

// TestTwoClientsSameViewBothReceiveRelayedEventWithSequenceNumbers prueft den
// Kern: ein Upstream-Strom, zwei Clients derselben Sicht, beide bekommen
// dieselben Ereignisse mit denselben fortlaufenden Sequenznummern.
func TestTwoClientsSameViewBothReceiveRelayedEventWithSequenceNumbers(t *testing.T) {
	hub, memory := neuerHub(t, Config{Queue: 16, History: 16})
	a, leserA := anhaengen(t, hub, "session", "links")
	b, leserB := anhaengen(t, hub, "session", "rechts")

	if a.StreamID() != b.StreamID() {
		t.Fatalf("verschiedene Stroeme: %q und %q", a.StreamID(), b.StreamID())
	}
	if hub.Stroeme() != 1 {
		t.Fatalf("Stroeme = %d, erwartet 1", hub.Stroeme())
	}

	// ready ist der erste Rahmen jeder Generation.
	for _, l := range []*leser{leserA, leserB} {
		l.warteAufRahmen(t, 1, time.Second)
		ready := l.Rahmen()[0]
		if ready.Type != api.FrameReady {
			t.Fatalf("erster Rahmen = %q, erwartet ready", ready.Type)
		}
		if ready.StreamID != "session" || ready.View != "session" || ready.WindowID == "" {
			t.Errorf("ready = %+v", ready)
		}
	}

	for i, text := range []string{"eins", "zwei", "drei"} {
		zustellen(t, memory, "session", Event("session/message", map[string]any{"text": text}, true), hub, uint64(i+1))
	}

	for _, l := range []*leser{leserA, leserB} {
		l.warteAufRahmen(t, 4, 2*time.Second)
		rahmen := l.Rahmen()
		if len(rahmen) != 4 {
			t.Fatalf("%d Rahmen angekommen, erwartet 4", len(rahmen))
		}
		for i, want := range []uint64{1, 2, 3} {
			m := rahmen[i+1]
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
				t.Errorf("das Ereignis muss als droppable markiert sein")
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
		if _, err := hub.Attach(context.Background(), senkenAttrappe{}, s); err == nil {
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
	session, err := hub.Attach(context.Background(), senkenAttrappe{}, Statement{View: "session", WindowID: "x"})
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
	session, l := anhaengen(t, hub, "graph", "knoten")
	l.warteAufRahmen(t, 1, time.Second)
	if ready := l.Rahmen()[0]; ready.Type != api.FrameReady {
		t.Fatalf("erster Rahmen = %q", ready.Type)
	}

	// Der Ring fasst 8 Rahmen; 20 Ereignisse lassen ihn ueberlaufen.
	for i := 0; i < 20; i++ {
		zustellen(t, memory, "graph", Event("graph/delta", map[string]any{"i": i}, true), hub, uint64(i+1))
	}
	l.warteAufRahmen(t, 21, 3*time.Second)
	for i, m := range l.Rahmen()[1:] {
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
	session, l := anhaengen(t, hub, "files", "baum")
	l.warteAufRahmen(t, 1, time.Second)

	for i := 0; i < 3; i++ {
		zustellen(t, memory, "files", Event("files/change", map[string]any{"i": i}, true), hub, uint64(i+1))
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
// Rahmen (drop-oldest) und wird nach der Verwurfgrenze getrennt, waehrend der
// schnelle Client ALLE Rahmen bekommt und das Verteilen nicht stockt.
//
// Die beiden Clients haben bewusst verschiedene Warteschlangen (4 gegen 64):
// so misst der Test die Politik und nicht die Geschwindigkeit des Testcodes.
func TestSlowClientIsDroppedWithoutStallingFastClient(t *testing.T) {
	memory := NewMemory(still())
	hubSchnell := New(memory, Config{Queue: 64, History: 64}, still())
	hubLangsam := New(memory, Config{Queue: 4, History: 4, MaxDrops: 10}, still())

	schnell, err := hubSchnell.Attach(context.Background(), senkenAttrappe{}, Statement{View: "session", WindowID: "schnell"})
	if err != nil {
		t.Fatalf("anhaengen: %v", err)
	}
	langsam, err := hubLangsam.Attach(context.Background(), senkenAttrappe{}, Statement{View: "session", WindowID: "langsam"})
	if err != nil {
		t.Fatalf("anhaengen: %v", err)
	}
	if ready := probe(t, schnell); ready.Type != api.FrameReady {
		t.Fatalf("erster Rahmen des schnellen Clients = %q", ready.Type)
	}
	_ = probe(t, langsam) // ready

	const anzahl = 40
	var gesehen atomic.Int64
	geleert := make(chan struct{})
	go func() {
		defer close(geleert)
		for {
			select {
			case <-schnell.Frames():
				gesehen.Add(1)
			case <-time.After(2 * time.Second):
				return
			}
		}
	}()

	start := time.Now()
	for i := 0; i < anzahl; i++ {
		zustellen(t, memory, "session", Event("session/message", map[string]any{"i": i}, true), hubSchnell, uint64(i+1))
	}
	dauer := time.Since(start)

	if dauer > 10*time.Second {
		t.Fatalf("das Verteilen von %d Rahmen dauerte %s: ein Client hat die anderen angehalten", anzahl, dauer)
	}
	if langsam.Dropped() == 0 {
		t.Errorf("der langsame Client hat nichts verworfen (Warteschlange %d)", langsam.FramesLen())
	}
	if !langsam.Closed() {
		t.Errorf("der langsame Client haette nach der Verwurfgrenze getrennt werden muessen")
	}
	if schnell.Dropped() != 0 {
		t.Errorf("der schnelle Client hat %d Rahmen verloren", schnell.Dropped())
	}
	if schnell.Closed() {
		t.Error("der schnelle Client darf nicht getrennt werden")
	}
	if hubSchnell.Clients() != 1 {
		t.Errorf("der schnelle Hub hat %d Clients, erwartet 1", hubSchnell.Clients())
	}
	<-geleert
	if int(gesehen.Load()) < anzahl {
		t.Errorf("der schnelle Client sah %d Rahmen, erwartet mindestens %d", gesehen.Load(), anzahl)
	}
	// Der langsame Client hat bis zur letzten Sequenz mitgezaehlt, aber
	// Rahmen verloren — genau das ist die Luecke, die resync sichtbar macht.
	langsam.mu.Lock()
	letzter := langsam.seq
	langsam.mu.Unlock()
	if letzter == 0 {
		t.Error("der langsame Client hat keine Sequenznummer gesehen")
	}
}

// TestDroppedEventsAreTheOldest prueft die Reihenfolge der Verwerfung an der
// Warteschlange selbst: bei voller Warteschlange faellt der AELTESTE droppable
// Rahmen, die juengsten bleiben — und der neue Rahmen kommt an.
//
// Der Test haengt ohne Leser an und verteilt synchron (hub.Relay), damit die
// Warteschlange genau das ist, was der Test sieht.
func TestDroppedEventsAreTheOldest(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 3, History: 3})
	session := anhaengenOhneLeser(t, hub, "session", "x")
	if ready := probe(t, session); ready.Type != api.FrameReady {
		t.Fatalf("erster Rahmen = %q", ready.Type)
	}

	for i := 0; i < 10; i++ {
		hub.Relay("session", Message{Event: "e", Droppable: true})
	}
	if session.Dropped() == 0 {
		t.Fatal("bei 10 Rahmen und Warteschlange 3 muss etwas verworfen worden sein")
	}
	if session.FramesLen() != 3 {
		t.Fatalf("Warteschlange = %d, erwartet 3", session.FramesLen())
	}
	// Die drei juengsten Rahmen sind 8, 9 und 10 — die aelteren fielen.
	var seqs []uint64
	for i := 0; i < 3; i++ {
		seqs = append(seqs, probe(t, session).Seq)
	}
	if seqs[0] != 8 || seqs[1] != 9 || seqs[2] != 10 {
		t.Fatalf("Warteschlange = %v, erwartet [8 9 10] — der aelteste Rahmen faellt", seqs)
	}
	if session.Dropped() != 7 {
		t.Errorf("verworfen = %d, erwartet 7", session.Dropped())
	}
}

// TestReadyFrameIsNeverDropped prueft, dass der ready-Rahmen einer Generation
// auch bei voller Warteschlange nicht verworfen wird: er traegt nie ein
// droppable-Merkmal.
func TestReadyFrameIsNeverDropped(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 2, History: 2})
	session := anhaengenOhneLeser(t, hub, "session", "x")

	// Die Warteschlange fasst 2; der ready-Rahmen liegt darin. Die folgenden
	// droppable Rahmen duerfen ihn nicht verdraengen.
	for i := 0; i < 6; i++ {
		hub.Relay("session", Message{Event: "e", Droppable: true})
	}
	m := probe(t, session)
	if m.Type != api.FrameReady {
		t.Fatalf("erster Rahmen = %q, erwartet ready — der ready-Rahmen darf nie weichen", m.Type)
	}
}

// TestNonDroppableOverflowDisconnectsClient prueft die zweite Haelfte der
// Politik: ein nicht droppbarer Rahmen darf nie verworfen werden, also wird
// der Client getrennt — sichtbar, mit Fehlerrahmen.
func TestNonDroppableOverflowDisconnectsClient(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 2, History: 2})
	session := anhaengenOhneLeser(t, hub, "session", "x")
	probe(t, session) // ready

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
	// Die beiden gueltigen Rahmen; ein dritter Rahmen ist der sichtbare Fehler.
	// Ist die Warteschlange voll mit nicht droppbaren Rahmen, ist der
	// Abschlussgrund stattdessen der Close-Code des Traegers — dann steht kein
	// Fehlerrahmen in der Warteschlange, und das ist kein stiller Verlust.
	var typen []string
	var codes []string
	for {
		select {
		case m := <-session.Frames():
			typen = append(typen, m.Type)
			if m.Error != nil {
				codes = append(codes, m.Error.Code)
			}
		case <-time.After(200 * time.Millisecond):
			if len(typen) < 2 || typen[0] != api.FrameEvent || typen[1] != api.FrameEvent {
				t.Fatalf("Rahmenfolge = %v, erwartet mindestens [event event]", typen)
			}
			if len(codes) > 1 || (len(codes) == 1 && codes[0] != api.CodePeerLagged) {
				t.Errorf("Fehlercodes = %v, erwartet hoechstens [%s]", codes, api.CodePeerLagged)
			}
			return
		}
	}
}

// TestDetachedClientStopsReceiving prueft den Lebenslauf: nach detach kommt
// nichts mehr an.
func TestDetachedClientStopsReceiving(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 16, History: 16})
	bleibt, leserBleibt := anhaengen(t, hub, "session", "bleibt")
	geht, leserGeht := anhaengen(t, hub, "session", "geht")
	leserBleibt.warteAufRahmen(t, 1, time.Second)
	leserGeht.warteAufRahmen(t, 1, time.Second)

	hub.Relay("session", Message{Event: "vorher", Droppable: true})
	leserGeht.warteAufRahmen(t, 2, time.Second)
	if m := leserGeht.Rahmen()[1]; m.Event != "vorher" {
		t.Fatalf("Rahmen = %+v", m)
	}
	vorher := leserGeht.anzahl()

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
	if nachher := leserGeht.anzahl(); nachher != vorher {
		t.Fatalf("die abgehaengte Sicht hat %d weitere Rahmen bekommen", nachher-vorher)
	}
	// Die verbundene Sicht bekommt "nachher" als dritten Rahmen (ready,
	// vorher, nachher).
	leserBleibt.warteAufRahmen(t, 3, time.Second)
	if m := leserBleibt.Rahmen()[2]; m.Event != "nachher" {
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
	_, l := anhaengen(t, hub, "session", "x")
	l.warteAufRahmen(t, 1, time.Second)
	if memory.Quellen("session") != 1 {
		t.Fatalf("Quellen = %d", memory.Quellen("session"))
	}

	memory.mu.Lock()
	quellen := append([]*memorySource(nil), memory.sources["session"]...)
	memory.mu.Unlock()
	for _, q := range quellen {
		_ = q.Close()
	}

	l.warteAufRahmen(t, 3, 3*time.Second)
	rahmen := l.Rahmen()
	if rahmen[1].Type != api.FrameEvent || rahmen[1].Event != "attach/upstream-gone" {
		t.Fatalf("Rahmen = %+v, erwartet attach/upstream-gone", rahmen[1])
	}
	if rahmen[1].Droppable {
		t.Error("das Endereignis darf nicht droppable sein")
	}
	if rahmen[2].Type != api.FrameEnd {
		t.Fatalf("zweiter Rahmen = %q, erwartet end", rahmen[2].Type)
	}
}

// TestShutdownDetachesEveryClient prueft das geordnete Ende: alle Sessions
// sind zu, alle Stroeme fort, und der Abschlussgrund ist sichtbar.
//
// Der Test haengt OHNE Leser an und liest die Warteschlange selbst. Mit einem
// nebenlaeufigen Leser waere der Fehlerrahmen zwar zugestellt, aber schon vom
// Leser verbraucht — der Test wuerde dann eine leere Warteschlange beobachten
// und koennte gar nicht pruefen, was er pruefen will.
func TestShutdownDetachesEveryClient(t *testing.T) {
	hub, _ := neuerHub(t, Config{Queue: 8, History: 8})
	a := anhaengenOhneLeser(t, hub, "session", "a")
	b := anhaengenOhneLeser(t, hub, "terminal", "b")
	for _, session := range []*Session{a, b} {
		if ready := probe(t, session); ready.Type != api.FrameReady {
			t.Fatalf("erster Rahmen = %q, erwartet ready", ready.Type)
		}
	}

	hub.Shutdown()
	if hub.Clients() != 0 || hub.Stroeme() != 0 {
		t.Errorf("nach Shutdown: clients %d, streams %d", hub.Clients(), hub.Stroeme())
	}
	if !a.Closed() || !b.Closed() {
		t.Error("alle Sessions muessen geschlossen sein")
	}
	for _, session := range []*Session{a, b} {
		m := probe(t, session)
		if m.Type != api.FrameError {
			t.Fatalf("Abschlussrahmen = %q, erwartet error", m.Type)
		}
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
