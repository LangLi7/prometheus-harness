package tests_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-attach/internal/attach"
	"github.com/LangLi7/prometheus-harness/services/pmh-attach/internal/wire"
)

// wsClient ist ein UI-Client ueber den echten WebSocket-Draht.
type wsClient struct {
	t    *testing.T
	conn *wire.Conn
}

// attachServer startet den Anhaengepunkt als echten HTTP-Server.
func attachServer(t *testing.T, cfg attach.Config) (*httptest.Server, *attach.Memory, *attach.Hub) {
	t.Helper()
	server, memory, hub := testSetup(t, cfg)
	ts := httptest.NewServer(server)
	t.Cleanup(ts.Close)
	return ts, memory, hub
}

// wsURL baut die WebSocket-Adresse aus der HTTP-Adresse des Testservers.
func wsURL(t *testing.T, ts *httptest.Server, pfad string) string {
	t.Helper()
	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("Adresse unlesbar: %v", err)
	}
	u.Scheme = "ws"
	u.Path = pfad
	return u.String()
}

// dial oeffnet eine WebSocket-Verbindung zum Anhaengepunkt.
func dial(t *testing.T, ts *httptest.Server) *wsClient {
	t.Helper()
	conn, err := wire.Dial(wsURL(t, ts, api.AttachPath), http.Header{"Origin": []string{ts.URL}})
	if err != nil {
		t.Fatalf("Handschlag fehlgeschlagen: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return &wsClient{t: t, conn: conn}
}

// sende schickt einen Rahmen der Clientsicht.
func (c *wsClient) sende(m api.ClientMessage) {
	c.t.Helper()
	text, err := json.Marshal(m)
	if err != nil {
		c.t.Fatalf("Rahmen nicht serialisierbar: %v", err)
	}
	if err := c.conn.WriteMessage(wire.OpText, text); err != nil {
		c.t.Fatalf("Senden fehlgeschlagen: %v", err)
	}
}

// sendeRoh schickt beliebigen Text.
func (c *wsClient) sendeRoh(text string) {
	c.t.Helper()
	if err := c.conn.WriteMessage(wire.OpText, []byte(text)); err != nil {
		c.t.Fatalf("Senden fehlgeschlagen: %v", err)
	}
}

// anhaengen deklariert die Anhaengung und liefert den ready-Rahmen.
func (c *wsClient) anhaengen(view, window string) api.ServerMessage {
	c.t.Helper()
	c.sende(api.ClientMessage{
		Type:     api.FrameAttach,
		Endpoint: view,
		Payload:  &api.AttachPayload{View: view, WindowID: window},
	})
	m := c.empfange(3 * time.Second)
	if m.Type != api.FrameReady {
		c.t.Fatalf("erster Rahmen = %q (%+v), erwartet ready", m.Type, m)
	}
	return m
}

// empfange liest einen Rahmen der Hostsicht.
func (c *wsClient) empfange(frist time.Duration) api.ServerMessage {
	c.t.Helper()
	if err := c.conn.SetReadDeadline(time.Now().Add(frist)); err != nil {
		c.t.Fatalf("Frist nicht setzbar: %v", err)
	}
	opcode, payload, err := c.conn.ReadMessage()
	if err != nil {
		c.t.Fatalf("Empfangen fehlgeschlagen: %v", err)
	}
	if opcode != wire.OpText {
		c.t.Fatalf("Opcode = %d, erwartet Text", opcode)
	}
	var m api.ServerMessage
	if err := json.Unmarshal(payload, &m); err != nil {
		c.t.Fatalf("Rahmen ist kein JSON: %v (%s)", err, string(payload))
	}
	return m
}

// empfangeBis liest Rahmen, bis der Typ passt; andere Rahmen werden uebersprungen.
func (c *wsClient) empfangeBis(typ string, frist time.Duration) api.ServerMessage {
	c.t.Helper()
	ende := time.Now().Add(frist)
	for {
		rest := time.Until(ende)
		if rest <= 0 {
			c.t.Fatalf("kein Rahmen vom Typ %q innerhalb von %s", typ, frist)
		}
		m := c.empfange(rest)
		if m.Type == typ {
			return m
		}
	}
}

// ---- Handschlag und Textrahmen ---------------------------------------------

// TestWebSocketHandshakeAndTextFrameRoundTrip prueft den Handschlag und einen
// Textrahmen in beide Richtungen: der Client schickt attach, der Server
// antwortet mit ready.
func TestWebSocketHandshakeAndTextFrameRoundTrip(t *testing.T) {
	ts, _, _ := attachServer(t, attach.Config{Queue: 8, History: 8})
	c := dial(t, ts)

	c.sende(api.ClientMessage{
		Type:     api.FrameAttach,
		Endpoint: "session",
		Payload:  &api.AttachPayload{View: "session", WindowID: "links"},
	})
	ready := c.empfange(3 * time.Second)
	if ready.Type != api.FrameReady {
		t.Fatalf("Rahmen = %+v, erwartet ready", ready)
	}
	if ready.StreamID != "session" || ready.View != "session" || ready.WindowID != "links" {
		t.Errorf("ready = %+v", ready)
	}
	if ready.Seq != 0 {
		t.Errorf("seq = %d, erwartet 0 (noch kein Ereignis)", ready.Seq)
	}
}

// TestUpgradeRejectedWithoutWebSocketHeaders prueft, dass ein gewoehnlicher
// HTTP-Aufruf auf /v1/attach keinen Handschlag bekommt.
func TestUpgradeRejectedWithoutWebSocketHeaders(t *testing.T) {
	ts, _, _ := attachServer(t, attach.Config{Queue: 8, History: 8})
	resp, err := http.Get(ts.URL + api.AttachPath)
	if err != nil {
		t.Fatalf("Aufruf fehlgeschlagen: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("Status = %d, erwartet 400", resp.StatusCode)
	}
}

// TestFirstFrameMustBeAttach prueft, dass ein anderer erster Rahmen die
// Verbindung mit 1008 beendet.
func TestFirstFrameMustBeAttach(t *testing.T) {
	ts, _, _ := attachServer(t, attach.Config{Queue: 8, History: 8})
	c := dial(t, ts)
	c.sende(api.ClientMessage{Type: api.FrameResync})

	_ = c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, _, err := c.conn.ReadMessage()
	var ce *wire.CloseError
	if !errors.As(err, &ce) {
		t.Fatalf("Fehler = %v, erwartet CloseError", err)
	}
	if ce.Code != api.ClosePolicyViolated {
		t.Errorf("Close-Code = %d, erwartet %d", ce.Code, api.ClosePolicyViolated)
	}
}

// TestSecondAttachOnSameConnectionIsRejected prueft den doppelten Attach: er
// ist der eine Protokollverstoss, der die Verbindung beendet.
func TestSecondAttachOnSameConnectionIsRejected(t *testing.T) {
	ts, _, _ := attachServer(t, attach.Config{Queue: 8, History: 8})
	c := dial(t, ts)
	c.anhaengen("session", "links")
	c.sende(api.ClientMessage{
		Type:     api.FrameAttach,
		Endpoint: "session",
		Payload:  &api.AttachPayload{View: "session", WindowID: "nochmal"},
	})

	_ = c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, _, err := c.conn.ReadMessage()
	var ce *wire.CloseError
	if !errors.As(err, &ce) || ce.Code != api.ClosePolicyViolated {
		t.Fatalf("Fehler = %v, erwartet CloseError 1008", err)
	}
}

// TestAttachWithoutWindowIsRejected prueft eine unvollstaendige Anhaengung.
func TestAttachWithoutWindowIsRejected(t *testing.T) {
	ts, _, _ := attachServer(t, attach.Config{Queue: 8, History: 8})
	c := dial(t, ts)
	// Ohne payload.windowId ist der Rahmen ungueltig.
	c.sendeRoh(`{"type":"attach","endpoint":"session"}`)

	_ = c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, _, err := c.conn.ReadMessage()
	var ce *wire.CloseError
	if !errors.As(err, &ce) || ce.Code != api.ClosePolicyViolated {
		t.Fatalf("Fehler = %v, erwartet CloseError 1008", err)
	}
}

// ---- Fan-out ueber zwei Clients --------------------------------------------

// TestTwoAttachedClientsReceiveRelayedEventWithSequenceNumbers prueft das
// Zielbild: zwei Clients, dieselbe Ansicht, zwei Fenster — beide bekommen
// dasselbe Ereignis ueber den Draht, mit derselben Sequenznummer.
func TestTwoAttachedClientsReceiveRelayedEventWithSequenceNumbers(t *testing.T) {
	ts, memory, hub := attachServer(t, attach.Config{Queue: 16, History: 16})

	links := dial(t, ts)
	rechts := dial(t, ts)
	readyLinks := links.anhaengen("session", "links")
	readyRechts := rechts.anhaengen("session", "rechts")
	if readyLinks.StreamID != readyRechts.StreamID {
		t.Fatalf("verschiedene Stroeme: %q und %q", readyLinks.StreamID, readyRechts.StreamID)
	}
	if hub.Clients() != 2 || hub.Stroeme() != 1 {
		t.Fatalf("clients %d, streams %d — erwartet 2/1", hub.Clients(), hub.Stroeme())
	}

	for i := 0; i < 3; i++ {
		memory.Publish("session", attach.Event("session/message", map[string]any{"i": i}, true))
	}

	for name, c := range map[string]*wsClient{"links": links, "rechts": rechts} {
		for want := uint64(1); want <= 3; want++ {
			m := c.empfangeBis(api.FrameEvent, 3*time.Second)
			if m.Seq != want {
				t.Fatalf("%s: Sequenz = %d, erwartet %d", name, m.Seq, want)
			}
			if m.Event != "session/message" || m.StreamID != "session" {
				t.Errorf("%s: Rahmen = %+v", name, m)
			}
		}
	}
}

// TestInputFrameIsAnsweredVisibly prueft, dass eine nicht zustellbare Eingabe
// sichtbar scheitert statt still zu verschwinden (Regel 3).
func TestInputFrameIsAnsweredVisibly(t *testing.T) {
	ts, _, _ := attachServer(t, attach.Config{Queue: 8, History: 8})
	c := dial(t, ts)
	c.anhaengen("terminal", "rechts")
	c.sende(api.ClientMessage{Type: api.FrameItem, Value: json.RawMessage(`{"taste":"a"}`)})

	_ = c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, _, err := c.conn.ReadMessage()
	var ce *wire.CloseError
	if !errors.As(err, &ce) {
		t.Fatalf("Fehler = %v, erwartet CloseError", err)
	}
	if ce.Code != wire.CloseTooLarge {
		t.Errorf("Close-Code = %d, erwartet %d (Eingabe nicht zustellbar)", ce.Code, wire.CloseTooLarge)
	}
}

// ---- Langsamer Client ------------------------------------------------------

// TestSlowClientDoesNotStallFastClient prueft den Kern der Nebenlaeufigkeit
// ueber den Draht: ein Client, der seine Rahmen nicht abholt, wird getrennt,
// waehrend der zweite Client ALLE Ereignisse rechtzeitig bekommt.
//
// Der langsame Client liest nach dem ready-Rahmen nichts mehr; damit seine
// Warteschlange sicher volllaeuft, ist sie klein (4) und die Verwurfgrenze
// niedrig (5). Der schnelle Client hat eine grosse Warteschlange (200), damit
// der Test die Ueberlaufpolitik misst und nicht die Geschwindigkeit des
// Testcodes. Zwei Hubs mit einem gemeinsamen Upstream: jeder Client hat so
// seine eigene Warteschlangengroesse, wie es im Betrieb die Konfiguration
// vorgibt.
func TestSlowClientDoesNotStallFastClient(t *testing.T) {
	memory := attach.NewMemory(stillerLogger())
	hubSchnell := attach.New(memory, attach.Config{Queue: 200, History: 8}, stillerLogger())
	hubLangsam := attach.New(memory, attach.Config{Queue: 4, History: 4, MaxDrops: 5}, stillerLogger())

	schnellServer := httptest.NewServer(attach.NewServer(hubSchnell,
		attach.ServerConfig{Hub: attach.Config{Queue: 200, History: 8}},
		attach.Build{Version: "9.9.9"}, stillerLogger()))
	t.Cleanup(schnellServer.Close)
	langsamServer := httptest.NewServer(attach.NewServer(hubLangsam,
		attach.ServerConfig{Hub: attach.Config{Queue: 4, History: 4, MaxDrops: 5}},
		attach.Build{Version: "9.9.9"}, stillerLogger()))
	t.Cleanup(langsamServer.Close)

	schnell := dial(t, schnellServer)
	schnell.anhaengen("session", "schnell")
	langsam := dial(t, langsamServer)
	langsam.anhaengen("session", "langsam")
	// Der langsame Client liest ab hier nicht mehr.

	const anzahl = 100
	var gesehen atomic.Int64
	go func() {
		for {
			_ = schnell.conn.SetReadDeadline(time.Now().Add(10 * time.Second))
			if _, _, err := schnell.conn.ReadMessage(); err != nil {
				return
			}
			gesehen.Add(1)
		}
	}()

	start := time.Now()
	for i := 0; i < anzahl; i++ {
		memory.Publish("session", attach.Event("session/message", map[string]any{"i": i}, true))
		if i%10 == 0 {
			// Der schnelle Client muss aufholen koennen; der langsame nicht.
			if err := warteAufZaehler(&gesehen, int64(i), 3*time.Second); err != nil {
				t.Fatalf("der schnelle Client kam nach %d Ereignissen nicht mit: %v", i, err)
			}
		}
	}
	dauer := time.Since(start)
	if dauer > 15*time.Second {
		t.Fatalf("das Verteilen von %d Ereignissen dauerte %s: der langsame Client hat die anderen angehalten",
			anzahl, dauer)
	}

	// Der langsame Client hat kein einziges Ereignis abgeholt: sein Puffer lief
	// voll und er wurde getrennt (sichtbar, mit attach/peer-lagged).
	if err := warteAufClients(hubLangsam, 0, 5*time.Second); err != nil {
		t.Fatalf("der langsame Client wurde nicht getrennt: %v", err)
	}
	// Der schnelle Client hat kein einziges Ereignis verloren.
	if err := warteAufZaehler(&gesehen, anzahl, 5*time.Second); err != nil {
		t.Fatalf("der schnelle Client sah nicht alle Ereignisse: %v", err)
	}
	if hubSchnell.Clients() != 1 {
		t.Errorf("im schnellen Hub sind %d Clients, erwartet 1", hubSchnell.Clients())
	}
}

// warteAufClients wartet, bis der Hub genau n Clients fuehrt.
func warteAufClients(hub *attach.Hub, n int, frist time.Duration) error {
	ende := time.Now().Add(frist)
	for hub.Clients() != n {
		if time.Now().After(ende) {
			return fmt.Errorf("Hub fuehrt %d Clients, erwartet %d", hub.Clients(), n)
		}
		time.Sleep(2 * time.Millisecond)
	}
	return nil
}

// warteAufZaehler wartet, bis der Zaehler mindestens ziel erreicht hat.
func warteAufZaehler(zaehler *atomic.Int64, ziel int64, frist time.Duration) error {
	ende := time.Now().Add(frist)
	for zaehler.Load() < ziel {
		if time.Now().After(ende) {
			return fmt.Errorf("Zaehler steht bei %d, erwartet mindestens %d", zaehler.Load(), ziel)
		}
		time.Sleep(time.Millisecond)
	}
	return nil
}

// ---- Abhaengen und Nachhaengen ---------------------------------------------

// TestDetachedClientStopsReceiving prueft den Lebenslauf: nach detach schliesst
// der Server die Verbindung, und es kommt kein weiteres Ereignis an.
func TestDetachedClientStopsReceiving(t *testing.T) {
	ts, memory, hub := attachServer(t, attach.Config{Queue: 16, History: 16})
	c := dial(t, ts)
	c.anhaengen("graph", "knoten")

	c.sende(api.ClientMessage{Type: api.FrameDetach})
	_ = c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, _, err := c.conn.ReadMessage()
	var ce *wire.CloseError
	if !errors.As(err, &ce) {
		t.Fatalf("Fehler = %v, erwartet CloseError nach detach", err)
	}
	if ce.Code != wire.CloseNormalClosure {
		t.Errorf("Close-Code = %d, erwartet %d", ce.Code, wire.CloseNormalClosure)
	}
	if hub.Clients() != 0 {
		t.Fatalf("nach detach sind %d Clients im Hub", hub.Clients())
	}

	// Ein spaeteres Ereignis erreicht niemanden mehr; der Strom ist leer.
	memory.Publish("graph", attach.Event("graph/delta", map[string]any{"i": 1}, true))
	time.Sleep(50 * time.Millisecond)
	if hub.Clients() != 0 || hub.Stroeme() != 0 {
		t.Errorf("nach detach: clients %d, streams %d — erwartet 0/0", hub.Clients(), hub.Stroeme())
	}
}

// TestResyncAfterForcedGapDeliversFullStateFrame prueft resync ueber den Draht:
// nach einer erzwungenen Luecke liefert der Server den vollen Zustand mit
// gap=true.
func TestResyncAfterForcedGapDeliversFullStateFrame(t *testing.T) {
	ts, memory, _ := attachServer(t, attach.Config{Queue: 64, History: 4})
	c := dial(t, ts)
	ready := c.anhaengen("graph", "knoten")

	// Der Ring fasst 4 Rahmen; 10 Ereignisse lassen ihn ueberlaufen.
	for i := 0; i < 10; i++ {
		memory.Publish("graph", attach.Event("graph/delta", map[string]any{"i": i}, true))
	}
	// Alle 10 kommen an (die Warteschlange fasst 64).
	for want := uint64(1); want <= 10; want++ {
		m := c.empfangeBis(api.FrameEvent, 3*time.Second)
		if m.Seq != want {
			t.Fatalf("Sequenz = %d, erwartet %d", m.Seq, want)
		}
	}
	if ready.StreamID != "graph" {
		t.Fatalf("streamId = %q", ready.StreamID)
	}

	// Nachhaengen: der Client hat bis 3 gesehen und fordert den vollen Zustand.
	c.sende(api.ClientMessage{Type: api.FrameResync, FromSeq: 3})
	snap := c.empfangeBis(api.FrameSnapshot, 3*time.Second)
	if !snap.Gap {
		t.Errorf("gap muss true sein: die Rahmen 4 bis 6 sind nicht mehr im Ring")
	}
	if snap.Seq != 10 {
		t.Errorf("seq = %d, erwartet 10", snap.Seq)
	}
	if snap.FromSeq != 6 {
		t.Errorf("fromSeq = %d, erwartet 6", snap.FromSeq)
	}
	if len(snap.Messages) != 4 {
		t.Fatalf("%d Rahmen im Zustand, erwartet 4", len(snap.Messages))
	}
	if snap.Messages[0].Seq != 7 || snap.Messages[3].Seq != 10 {
		t.Errorf("Zustand reicht von %d bis %d, erwartet 7..10", snap.Messages[0].Seq, snap.Messages[3].Seq)
	}
	if snap.StreamID != "graph" || snap.View != "graph" {
		t.Errorf("snapshot nennt den Strom nicht: %+v", snap)
	}
}

// ---- Fehlender Upstream ----------------------------------------------------

// TestAttachFailsVisiblyWhenUpstreamEndpointFails prueft, dass ein nicht
// erreichbarer Upstream beim Anhaengen einen sichtbaren error-Rahmen erzeugt
// und die Verbindung mit 1011 schliesst (Regel 3).
func TestAttachFailsVisiblyWhenUpstreamEndpointFails(t *testing.T) {
	// Der Endpunkt zeigt auf einen geschlossenen Port: das Oeffnen scheitert.
	geschlossen := httptest.NewServer(http.NotFoundHandler())
	ziel := geschlossen.URL
	geschlossen.Close()

	remote, err := attach.NewRemote(ziel, stillerLogger())
	if err != nil {
		t.Fatalf("Endpunkt nicht baubar: %v", err)
	}
	hub := attach.New(remote, attach.Config{Queue: 8, History: 8}, stillerLogger())
	server := attach.NewServer(hub, attach.ServerConfig{Hub: attach.Config{Queue: 8, History: 8}}, attach.Build{Version: "9.9.9"}, stillerLogger())
	ts := httptest.NewServer(server)
	t.Cleanup(ts.Close)

	c := dial(t, ts)
	c.sende(api.ClientMessage{
		Type:     api.FrameAttach,
		Endpoint: "session",
		Payload:  &api.AttachPayload{View: "session", WindowID: "links"},
	})
	fehler := c.empfangeBis(api.FrameError, 5*time.Second)
	if fehler.Error == nil {
		t.Fatalf("error-Rahmen ohne Fehler: %+v", fehler)
	}
	if fehler.Error.Code != api.CodeServiceUnavailable && fehler.Error.Code != api.CodeInternal {
		t.Errorf("Fehlercode = %q, erwartet %q oder %q",
			fehler.Error.Code, api.CodeServiceUnavailable, api.CodeInternal)
	}
	if !strings.Contains(fehler.Error.Message, "Upstream") {
		t.Errorf("Meldung nennt den Upstream nicht: %q", fehler.Error.Message)
	}

	_ = c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, _, err = c.conn.ReadMessage()
	var ce *wire.CloseError
	if !errors.As(err, &ce) || ce.Code != wire.CloseInternalError {
		t.Errorf("Fehler = %v, erwartet CloseError 1011", err)
	}
}
