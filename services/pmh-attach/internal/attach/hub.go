// Package attach ist die Anhaengelogik von pmh-attach: eine explizite
// Anhaengung (Ansicht plus Fenster), ein Hub, der einen Upstream-Strom auf
// viele Clients verteilt, und eine je Client gepufferte Warteschlange mit
// dokumentierter Ueberlaufpolitik.
//
// Die Begriffe sind bewusst getrennt:
//
//	Endpoint — die Gegenseite, aus der ein Strom kommt (Attrappe oder Harness)
//	Stream   — ein logischer Strom, adressiert ueber Ansicht plus Fenster
//	Session  — ein angeschlossener Client mit eigener Warteschlange
//	Statement— die Beschreibung, was ein Client anhaengen will
//
// Der Kern des Entwurfs ist die Trennung von Senke (Sink, transportfern) und
// Traeger (WebSocket, in internal/httpapi): die Anhaengelogik kennt kein
// WebSocket, und der Draht kennt kein Anhaengen.
package attach

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/api"
)

// ---------------------------------------------------------------------------
// Vorgaben
// ---------------------------------------------------------------------------

const (
	// DefaultQueue ist die Laenge der Warteschlange je Client.
	DefaultQueue = 64
	// DefaultHistory ist die Anzahl der Rahmen, die je Strom fuer ein
	// resync vorgehalten werden.
	DefaultHistory = 64
	// DefaultMaxDrops ist die Anzahl droppable Rahmen, die ein Client
	// verlieren darf, bevor er getrennt wird. 0 hebt die Grenze auf.
	DefaultMaxDrops = 64
	// DefaultReadTimeout ist die Frist, in der ein angeschlossener Client
	// seinen ersten Befehl schicken muss.
	DefaultReadTimeout = 30 * time.Second
)

// Config sind die Laufzeitgrenzen des Hubs.
type Config struct {
	// Queue ist die Laenge der Warteschlange je Client. 0 bedeutet: die
	// Senke darf blockieren (nur fuer Tests sinnvoll).
	Queue int
	// History ist die Anzahl der Rahmen, die je Strom vorgehalten werden,
	// damit ein resync sie nachliefern kann statt nur den Zustand zu melden.
	History int
	// MaxDrops ist die Anzahl droppable Rahmen, die ein Client verlieren
	// darf, bevor er getrennt wird. 0 hebt die Grenze auf.
	MaxDrops int
	// ReadTimeout ist die Frist fuer den ersten Befehl eines Clients.
	ReadTimeout time.Duration
}

// Effective liefert die Grenzen mit Vorgabewerten.
func (c Config) Effective() Config {
	if c.Queue < 0 {
		c.Queue = 0
	}
	if c.History < 0 {
		c.History = 0
	}
	if c.MaxDrops < 0 {
		c.MaxDrops = 0
	}
	if c.ReadTimeout <= 0 {
		c.ReadTimeout = DefaultReadTimeout
	}
	return c
}

// ---------------------------------------------------------------------------
// Schnittstellen
// ---------------------------------------------------------------------------

// Source ist ein laufender Upstream-Strom. Next blockiert bis zum naechsten
// Ereignis; ein Fehler beendet den Strom sichtbar.
type Source interface {
	Next(ctx context.Context) (api.UpstreamEvent, error)
	Close() error
}

// Endpoint ist die Gegenseite des Anhaengepunkts. Ein Endpunkt, der einen
// Strom oeffnen oder halten kann, ist der einzige Weg, auf dem Ereignisse in
// den Hub gelangen. Schlaegt Open fehl, ist das ein sichtbarer Fehler und
// kein stiller Ausfall (docs/concept.md Regel 3).
type Endpoint interface {
	Name() string
	Open(ctx context.Context, streamID, view, windowID string) (Source, error)
}

// Sink ist ein Client, wie ihn die Anhaengelogik sieht: eine geordnete Folge
// von Textnachrichten, die geschlossen werden kann. Die Umsetzung sitzt in
// internal/httpapi und ist eine WebSocket-Verbindung.
type Sink interface {
	// SendText schreibt genau eine Textnachricht.
	SendText(text string) error
	// Close schliesst die Senke. Der Aufruf muss idempotent sein.
	Close() error
}

// ---------------------------------------------------------------------------
// Anhaengung
// ---------------------------------------------------------------------------

// Statement beschreibt, was ein Client anhaengen will: eine deklarierte Sicht
// und ein Fenster (Panel). Beides zusammen waehlt den Strom.
type Statement struct {
	View     string
	WindowID string
}

// String liefert die Anzeigeform der Anhaengung.
func (s Statement) String() string { return s.View + "/" + s.WindowID }

// StreamID ist der Name des Stroms, den die Anhaengung waehlt. Die Sicht
// bestimmt ihn: mehrere Fenster derselben Ansicht teilen denselben Upstream-
// Strom, verschiedene Ansichten nicht.
func (s Statement) StreamID() string { return s.View }

// Belegt meldet, ob die Anhaengung die Grenzen des Vertrags einhaelt.
func (s Statement) Belegt() error {
	if strings.TrimSpace(s.View) == "" {
		return ErrViewMissing
	}
	if len(s.View) > api.MaxViewLen {
		return fmt.Errorf("%w: Ansicht laenger als %d Zeichen", ErrUngueltigeAnhaengung, api.MaxViewLen)
	}
	if strings.TrimSpace(s.WindowID) == "" {
		return ErrWindowMissing
	}
	if len(s.WindowID) > api.MaxWindowIDLen {
		return fmt.Errorf("%w: Fensterkennung laenger als %d Zeichen", ErrUngueltigeAnhaengung, api.MaxWindowIDLen)
	}
	return nil
}

// Fehler der Anhaengelogik.
var (
	// ErrViewMissing meldet eine Anhaengung ohne Ansicht.
	ErrViewMissing = fmt.Errorf("%w: Ansicht fehlt", ErrUngueltigeAnhaengung)
	// ErrWindowMissing meldet eine Anhaengung ohne Fenster.
	ErrWindowMissing = fmt.Errorf("%w: Fenster fehlt", ErrUngueltigeAnhaengung)
	// ErrUngueltigeAnhaengung ist der Sammelfehler einer abgelehnten Anhaengung.
	ErrUngueltigeAnhaengung = fmt.Errorf("attach: Anhaengung nicht zulaessig")
	// ErrNichtAngeschlossen meldet einen Befehl ohne gueltige Anhaengung.
	ErrNichtAngeschlossen = fmt.Errorf("attach: Verbindung ist nicht angeschlossen")
	// ErrBereitsAngeschlossen meldet ein zweites attach auf derselben Verbindung.
	ErrBereitsAngeschlossen = fmt.Errorf("attach: Verbindung haengt bereits")
	// ErrUeberlauf meldet einen Client, dessen Warteschlange nicht mehr zu
	// raeumen war.
	ErrUeberlauf = fmt.Errorf("attach: Warteschlange des Clients ueberlaufen")
)

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

// Hub haelt alle Stroeme, alle Anhaengungen und den Endpunkt.
type Hub struct {
	endpoint Endpoint
	config   Config
	log      *slog.Logger

	mu      sync.Mutex
	streams map[string]*Stream
	clients map[string]*Session
	nextID  uint64

	// done wird von Shutdown geschlossen; die Verteilergoroutinen enden
	// daraufhin ohne Fehlermeldung.
	done chan struct{}
	once sync.Once
}

// New baut den Hub.
func New(endpoint Endpoint, cfg Config, logger *slog.Logger) *Hub {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(discard{}, nil))
	}
	return &Hub{
		endpoint: endpoint,
		config:   cfg.Effective(),
		log:      logger,
		streams:  make(map[string]*Stream),
		clients:  make(map[string]*Session),
		done:     make(chan struct{}),
	}
}

type discard struct{}

func (discard) Write(p []byte) (int, error) { return len(p), nil }

// Endpoint liefert die Gegenseite, fuer Anzeige und Protokoll.
func (h *Hub) Endpoint() Endpoint { return h.endpoint }

// Config liefert die wirksamen Grenzen.
func (h *Hub) Config() Config { return h.config }

// Stroeme liefert die Anzahl offener Stroeme.
func (h *Hub) Stroeme() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.streams)
}

// Clients liefert die Anzahl angeschlossener Clients.
func (h *Hub) Clients() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

// Attach haengt einen Client an. Der Aufruf liefert die Session, die der
// Aufrufer lesen und schliessen muss.
//
// Ablauf: Anhaengung pruefen, Strom oeffnen (falls neu), Session anlegen und
// in den Strom eintragen, ready-Rahmen senden. Der ready-Rahmen ist der
// erste Rahmen jeder Verbindung; er etabliert die Generation und traegt
// streamId, view, windowId und die aktuelle Sequenznummer.
func (h *Hub) Attach(ctx context.Context, sink Sink, s Statement) (*Session, error) {
	if err := s.Belegt(); err != nil {
		return nil, err
	}
	stream, err := h.strom(ctx, s)
	if err != nil {
		return nil, err
	}
	session := h.neueSession(sink, s)

	h.mu.Lock()
	h.clients[session.id] = session
	stream.Add(session)
	h.mu.Unlock()

	ready := Message{
		Ready:    true,
		StreamID: stream.id,
		Sequence: stream.Sequence(),
		View:     s.View,
		WindowID: s.WindowID,
	}
	// Der ready-Rahmen geht als eigener Typ in die Warteschlange; er ist der
	// erste Rahmen der Generation und darf nie verworfen werden.
	if !session.Enqueue(ready) {
		h.Remove(session)
		return nil, ErrUeberlauf
	}
	h.log.Info("Client angehaengt",
		"client", session.id, "view", s.View, "fenster", s.WindowID,
		"strom", stream.id, "upstream", h.endpoint.Name(),
		"clients", h.Clients())
	return session, nil
}

// strom liefert den Strom der Anhaengung und oeffnet ihn beim ersten Mal.
// Die Sperre wird nicht ueber Open gehalten, damit ein langsamer Endpunkt
// andere Clients nicht anhaelt; ein zweiter Aufruf fuer dieselbe Ansicht
// findet den Strom dann bereits vor.
func (h *Hub) strom(ctx context.Context, s Statement) (*Stream, error) {
	id := s.StreamID()
	h.mu.Lock()
	if existing, ok := h.streams[id]; ok {
		h.mu.Unlock()
		return existing, nil
	}
	h.mu.Unlock()

	openCtx, cancel := context.WithTimeout(ctx, DefaultReadTimeout)
	source, err := h.endpoint.Open(openCtx, id, s.View, s.WindowID)
	cancel()
	if err != nil {
		return nil, err
	}

	stream := &Stream{
		id:       id,
		view:     s.View,
		windowID: s.WindowID,
		history:  h.config.History,
	}

	h.mu.Lock()
	if existing, ok := h.streams[id]; ok {
		h.mu.Unlock()
		_ = source.Close()
		return existing, nil
	}
	h.streams[id] = stream
	h.mu.Unlock()

	h.log.Info("Upstream-Strom geoeffnet", "strom", id, "view", s.View, "upstream", h.endpoint.Name())
	go h.verteilen(id, source)
	return stream, nil
}

// verteilen liest den Upstream-Strom und legt jedes Ereignis in den Hub.
// Endet der Strom, wird das sichtbar gemeldet — nie still.
func (h *Hub) verteilen(streamID string, source Source) {
	defer func() { _ = source.Close() }()
	for {
		ev, err := source.Next(context.Background())
		if err != nil {
			select {
			case <-h.done:
				// Geordnetes Ende.
			default:
				h.log.Warn("Upstream-Strom beendet", "strom", streamID, "fehler", err)
				h.Relay(streamID, Message{
					Event:     "attach/upstream-gone",
					Payload:   mustJSON(map[string]any{"streamId": streamID, "message": err.Error()}),
					Droppable: false,
				})
				h.Relay(streamID, Message{End: true})
			}
			return
		}
		h.Relay(streamID, Message{
			Event:     ev.Event,
			Args:      ev.Args,
			Payload:   ev.Value,
			Droppable: ev.Droppable,
		})
	}
}

// Relay verteilt eine Nachricht an alle Clients des Stroms und vergibt dabei
// die Sequenznummer. Clients, deren Warteschlange den Rahmen nicht mehr
// aufnehmen kann, werden getrennt — aber erst nach der Sperre, damit das
// Fan-out nie auf einer Senke wartet.
func (h *Hub) Relay(streamID string, m Message) uint64 {
	var verworfen []*Session
	var seq uint64

	h.mu.Lock()
	stream, ok := h.streams[streamID]
	if !ok {
		h.mu.Unlock()
		return 0
	}
	stream.mu.Lock()
	stream.seq++
	seq = stream.seq
	m.Sequence = seq
	m.StreamID = streamID
	stream.merken(m)
	sessions := append([]*Session(nil), stream.clients...)
	stream.mu.Unlock()

	for _, session := range sessions {
		if !session.Enqueue(m) {
			stream.Remove(session.id)
			delete(h.clients, session.id)
			verworfen = append(verworfen, session)
		}
	}
	h.mu.Unlock()

	for _, session := range verworfen {
		h.log.Warn("Client getrennt: Warteschlange ueberlaufen",
			"client", session.id, "view", session.view, "strom", streamID, "seq", seq)
		session.Fail(api.NewFailure(api.CodePeerLagged,
			"attach: Client kam nicht mit, Rahmen wurden verworfen; bitte resync anfordern",
			map[string]any{"streamId": streamID, "seq": seq}))
	}
	return seq
}

// Remove nimmt eine Session aus Hub und Strom. Der Aufruf ist idempotent.
//
// Bleibt kein Client am Strom, wird auch der Upstream-Strom geschlossen: ein
// Ereignisstrom ohne Empfaenger ist ein Leck, und ein spaeteres Anhaengen
// oeffnet bewusst einen frischen Strom (der Ring waere ohnehin veraltet).
func (h *Hub) Remove(s *Session) {
	var leer string
	h.mu.Lock()
	if _, ok := h.clients[s.id]; !ok {
		h.mu.Unlock()
		return
	}
	delete(h.clients, s.id)
	if stream, ok := h.streams[s.streamID]; ok {
		stream.Remove(s.id)
		if stream.Clients() == 0 {
			delete(h.streams, s.streamID)
			leer = s.streamID
		}
	}
	h.mu.Unlock()
	s.delivered()
	h.log.Info("Client abgehaengt", "client", s.id, "view", s.view, "strom", s.streamID)
	if leer != "" {
		h.log.Info("Upstream-Strom geschlossen: kein Client mehr", "strom", leer)
	}
}

// Detach entfernt eine Session anhand ihrer Kennung.
func (h *Hub) Detach(id string) bool {
	h.mu.Lock()
	session, ok := h.clients[id]
	h.mu.Unlock()
	if !ok {
		return false
	}
	h.Remove(session)
	return true
}

// Resync liefert den vollen Zustand eines Stroms ab fromSeq. Ist fromSeq 0,
// liefert der Aufruf alles, was der Ring noch kennt.
func (h *Hub) Resync(s *Session, fromSeq uint64) api.ServerMessage {
	h.mu.Lock()
	stream, ok := h.streams[s.streamID]
	var (
		recs  []api.EventFrame
		seq   uint64
		von   uint64
		fehlt bool
	)
	if ok {
		recs, seq, von, fehlt = stream.Snapshot(fromSeq)
	}
	h.mu.Unlock()

	msg := api.ServerMessage{
		Type:     api.FrameSnapshot,
		StreamID: s.streamID,
		View:     s.view,
		WindowID: s.windowID,
		Seq:      seq,
		FromSeq:  von,
		Gap:      fehlt,
		Messages: recs,
	}
	if !ok {
		msg.Type = api.FrameError
		msg.Error = api.NewFailure(api.CodeUpstreamGone,
			"attach: Strom ist nicht mehr offen", map[string]any{"streamId": s.streamID})
	}
	return msg
}

// Shutdown beendet alle Sessions und schliesst alle Stroeme. Der Aufruf ist
// idempotent.
func (h *Hub) Shutdown() {
	h.once.Do(func() { close(h.done) })

	h.mu.Lock()
	sessions := make([]*Session, 0, len(h.clients))
	for _, s := range h.clients {
		sessions = append(sessions, s)
	}
	h.clients = make(map[string]*Session)
	for id, stream := range h.streams {
		stream.clients = nil
		delete(h.streams, id)
	}
	h.mu.Unlock()

	for _, s := range sessions {
		s.Fail(api.NewFailure(api.CodeCancelled,
			"attach: Dienst wird beendet", map[string]any{"streamId": s.streamID}))
	}
	if n := len(sessions); n > 0 {
		h.log.Info("Alle Clients abgehaengt", "clients", n)
	}
}

// mustJSON serialisiert eine Nutzlast; ein Fehler ist ein Programmierfehler,
// kein Laufzeitfall.
func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return b
}
