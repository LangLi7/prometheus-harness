package attach

import (
	"encoding/json"
	"sync"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/api"
)

// Message ist ein Rahmen, wie ihn die Anhaengelogik weiterreicht. Die
// Sequenznummer und der Stromname werden beim Verteilen gesetzt (Relay); der
// Aufrufer laesst sie leer.
type Message struct {
	// Event ist der Name des weitergeleiteten Ereignisses (Core-Rahmen
	// emit traegt ihn woertlich als "event").
	Event string `json:"event,omitempty"`
	// Args sind die Argumente des Ereignisses (Core-Rahmen emit: "args").
	Args json.RawMessage `json:"args,omitempty"`
	// Payload ist der Wert eines item-Rahmens.
	Payload json.RawMessage `json:"value,omitempty"`
	// Droppable erlaubt die Verwerfung bei Ueberlauf. Ereignisse des
	// Upstreams duerfen das; Zustands- und Abschlussrahmen nicht.
	Droppable bool `json:"droppable,omitempty"`
	// End schliesst den Strom.
	End bool `json:"end,omitempty"`
	// Ready kennzeichnet den ersten Rahmen einer Generation.
	Ready bool `json:"ready,omitempty"`
	// View und WindowID gehoeren nur zum ready-Rahmen.
	View     string `json:"view,omitempty"`
	WindowID string `json:"windowId,omitempty"`

	// StreamID und Sequence setzt der Hub.
	StreamID string `json:"streamId,omitempty"`
	Sequence uint64 `json:"seq,omitempty"`
}

// frame baut den Rahmen der Hostsicht.
func (m Message) frame() api.ServerMessage {
	switch {
	case m.Ready:
		return api.ServerMessage{
			Type:      api.FrameReady,
			StreamID:  m.StreamID,
			Seq:       m.Sequence,
			View:      m.View,
			WindowID:  m.WindowID,
			Droppable: false,
		}
	case m.End:
		return api.ServerMessage{Type: api.FrameEnd, StreamID: m.StreamID, Seq: m.Sequence}
	case m.Event != "":
		return api.ServerMessage{
			Type:      api.FrameEvent,
			StreamID:  m.StreamID,
			Seq:       m.Sequence,
			Event:     m.Event,
			Args:      m.Args,
			Droppable: m.Droppable,
		}
	default:
		return api.ServerMessage{
			Type:      api.FrameItem,
			StreamID:  m.StreamID,
			Seq:       m.Sequence,
			Value:     m.Payload,
			Droppable: m.Droppable,
		}
	}
}

// EventFrame liefert die Form, in der der Rahmen im vollen Zustand erscheint.
func (m Message) EventFrame() api.EventFrame {
	return api.EventFrame{
		StreamID:  m.StreamID,
		Seq:       m.Sequence,
		Event:     m.Event,
		Args:      m.Args,
		Value:     m.Payload,
		Droppable: m.Droppable,
	}
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

// Session ist eine angeschlossene Sicht: eine Senke, eine deklarierte
// Anhaengung und eine gepufferte Warteschlange.
//
// Die Warteschlange ist die Stelle, an der ein langsamer Client die anderen
// nicht anhalten darf. Deshalb schreibt niemand direkt auf die Senke: der Hub
// legt Rahmen in die Warteschlange, ein eigener Schreiber gibt sie aus. Ist
// die Warteschlange voll, gilt die dokumentierte Politik:
//
//   - Ein als droppable markierter Rahmen darf verworfen werden; verworfen
//     wird der AELTESTE droppable Rahmen (drop-oldest), damit die neuesten
//     Ereignisse erhalten bleiben.
//   - Ist kein droppable Rahmen zu finden, wird der Client sofort getrennt.
//   - Auch drop-oldest ist begrenzt: nach Config.MaxDrops Verwuerfen wird der
//     Client getrennt, damit dauerhafter Verlust nicht still bleibt.
//
// In beiden Faellen bekommt der Client vorher einen error-Rahmen mit
// attach/peer-lagged, damit die Trennung sichtbar ist und er einen resync
// anfordern kann.
type Session struct {
	id       string
	view     string
	windowID string
	streamID string
	queue    int
	maxDrops uint64

	mu       sync.Mutex
	outbox   chan api.ServerMessage
	history  []Message
	seq      uint64
	dropped  uint64
	closed   bool
	finished chan struct{}
}

// neueSession legt die Warteschlange an; der Hub traegt sie danach ein.
func (h *Hub) neueSession(sink Sink, s Statement) *Session {
	h.mu.Lock()
	h.nextID++
	id := "c" + itoa(h.nextID)
	h.mu.Unlock()
	return &Session{
		id:       id,
		view:     s.View,
		windowID: s.WindowID,
		streamID: s.StreamID(),
		queue:    h.config.Queue,
		maxDrops: uint64(h.config.MaxDrops),
		outbox:   make(chan api.ServerMessage, h.config.Queue),
		finished: make(chan struct{}),
		history:  make([]Message, 0, h.config.History),
	}
}

// ID liefert die Kennung der Session.
func (s *Session) ID() string { return s.id }

// View liefert die deklarierte Ansicht.
func (s *Session) View() string { return s.view }

// WindowID liefert das deklarierte Fenster.
func (s *Session) WindowID() string { return s.windowID }

// StreamID liefert den Strom, an dem die Session haengt.
func (s *Session) StreamID() string { return s.streamID }

// Statement liefert die Anhaengung als Wert.
func (s *Session) Statement() Statement {
	return Statement{View: s.view, WindowID: s.windowID}
}

// Frames ist die Warteschlange, aus der der Traeger liest.
func (s *Session) Frames() <-chan api.ServerMessage { return s.outbox }

// Sequence liefert die zuletzt von dieser Session gesehene Sequenznummer.
func (s *Session) Sequence() uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.seq
}

// Dropped liefert die Anzahl der Rahmen, die fuer diese Session verworfen
// wurden. Ein Wert groesser 0 ist der Beleg fuer eine Luecke.
func (s *Session) Dropped() uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.dropped
}

// FramesLen liefert die aktuelle Fuellung der Warteschlange (fuer Tests und
// den Status-Endpunkt).
func (s *Session) FramesLen() int { return len(s.outbox) }

// Closed meldet, ob die Session beendet ist.
func (s *Session) Closed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed
}

// Finished wird geschlossen, sobald die Session beendet ist.
func (s *Session) Finished() <-chan struct{} { return s.finished }

// Enqueue legt einen Rahmen in die Warteschlange. Die Funktion blockiert
// niemals:
//
//  1. Ist Platz, geht der Rahmen direkt hinein.
//  2. Ist die Warteschlange voll, wird der AELTESTE als droppable markierte
//     Rahmen verworfen (drop-oldest) und der neue Rahmen nimmt dessen Platz.
//  3. Findet sich kein droppable Rahmen, meldet der Aufruf false und der
//     Aufrufer trennt den Client (nicht droppbare Rahmen gehen nie verloren).
//  4. Eine bereits beendete Session nimmt gar nichts mehr an; der Aufruf
//     meldet true, damit das geordnete Ende nicht als Ueberlauf erscheint.
//
// Der Weg ueber den vollen Puffer haelt die Sperre ueber das Leeren und das
// Zuruecklegen. Nur so kann kein zweiter Schreiber den freigewordenen Platz
// wegnehmen: ginge dabei ein Rahmen verloren, waere das ein stiller Verlust,
// und genau den darf es hier nicht geben. Der Platz reicht immer, denn
// geleerte Rahmen minus den verworfenen plus den neuen ergeben genau die
// Puffertiefe.
func (s *Session) Enqueue(m Message) bool {
	f := m.frame()

	// Schneller Weg: es ist Platz. Der Puffer ist nebenlaeufig sicher.
	select {
	case s.outbox <- f:
		s.mu.Lock()
		if !s.closed {
			s.seq = m.Sequence
			s.merken(m)
		}
		s.mu.Unlock()
		return true
	default:
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		// Eine beendete Session nimmt nichts mehr an; das ist kein Fehler.
		// Wichtig: es wird auch nichts mehr in den Puffer gelegt — sonst
		// bekaeme eine abgehaengte Sicht nach dem detach noch Rahmen.
		return true
	}

	// Warteschlange voll. Jetzt wird geleert, der aelteste droppable Rahmen
	// bestimmt und der neue Rahmen HINTEN angehaengt: nur so bleibt die
	// Warteschlange in Sequenzreihenfolge und drop-oldest verwirft wirklich
	// das Aelteste. Wuerde der neue Rahmen in den freigewordenen Platz vorne
	// gelegt, stuenden die verbliebenen Rahmen hinter ihm — die Reihenfolge
	// waere gebrochen und der Verlust traefe die juengsten statt der aeltesten.
	behalten := s.leeren()
	ueberlauf := len(behalten) >= cap(s.outbox)

	// Verworfen werden darf nur, was sich selbst als droppable markiert hat:
	// der ready-Rahmen traegt nie ein droppable und ist der erste Rahmen der
	// Generation — er weicht nie. Ein Rahmen ohne dieses Merkmal darf ebenfalls
	// nie verloren gehen.
	verworfen := -1
	if ueberlauf && m.Droppable {
		for i, candidate := range behalten {
			if candidate.Droppable {
				verworfen = i
				break
			}
		}
	}
	if ueberlauf && verworfen < 0 {
		// Nichts Droppables: Inhalt unveraendert zuruecklegen, kein Verlust.
		// Der Aufrufer trennt den Client und meldet den Grund sichtbar.
		s.zurueck(behalten)
		return false
	}
	if verworfen >= 0 {
		behalten = append(behalten[:verworfen], behalten[verworfen+1:]...)
		s.dropped++

		// Auch drop-oldest darf nicht endlos laufen: ein Client, der dauerhaft
		// nicht mitkommt, wird getrennt, damit der Datenverlust sichtbar bleibt.
		if s.maxDrops > 0 && s.dropped >= s.maxDrops {
			s.zurueck(behalten)
			return false
		}
	}

	// Den neuen Rahmen hinten anhaengen und den uebrigen Inhalt davor
	// zuruecklegen. Nach dem Leeren und einem Verwerfen ist genau ein Platz
	// frei; gelingt das Zuruecklegen trotzdem nicht, wird der Client getrennt,
	// statt einen Rahmen still zu verlieren.
	behalten = append(behalten, f)
	if !s.zurueck(behalten) {
		return false
	}
	s.seq = m.Sequence
	s.merken(m)
	return true
}

// leeren holt alles aus dem Puffer. Der Aufrufer haelt die Sperre.
func (s *Session) leeren() []api.ServerMessage {
	behalten := make([]api.ServerMessage, 0, cap(s.outbox))
	for {
		select {
		case candidate := <-s.outbox:
			behalten = append(behalten, candidate)
		default:
			return behalten
		}
	}
}

// zurueck legt Rahmen in ihrer Reihenfolge zurueck. Der Aufrufer haelt die
// Sperre und hat soeben geleert, der Platz steht also zur Verfuegung. Gelingt
// das trotzdem nicht, meldet der Aufruf false und der Client wird getrennt —
// ein stiller Verlust waere schlimmer als eine sichtbare Trennung.
func (s *Session) zurueck(frames []api.ServerMessage) bool {
	for _, candidate := range frames {
		select {
		case s.outbox <- candidate:
		default:
			return false
		}
	}
	return true
}

// Fail beendet die Session sichtbar: sie bekommt einen error-Rahmen und danach
// wird sie geschlossen.
//
// Der error-Rahmen ist der Abschluss der Generation und die einzige Stelle, an
// der ein Client den Grund der Trennung erfaehrt. Er darf deshalb nicht daran
// scheitern, dass die Warteschlange voll ist. Der Puffer wird also geleert und
// so weit gekuerzt, dass der error-Rahmen hineinpasst. Gewichen wird in dieser
// Reihenfolge:
//
//  1. der aelteste als droppable markierte Rahmen — derselbe Verlust, den die
//     Ueberlaufpolitik ohnehin erlaubt,
//  2. danach der ready-Rahmen: die Generation, die er eroeffnet, endet gerade,
//     also bedeutet er nichts mehr, waehrend die Erklaerung der Trennung alles
//     bedeutet.
//
// Dass Fail den ready-Rahmen opfern darf, waehrend Enqueue ihn nie anfasst, ist
// kein Widerspruch: Enqueue schuetzt die laufende Generation, Fail beendet sie.
// Nach dem Ende bedeutet ein ready-Rahmen nichts mehr, die Erklaerung der
// Trennung dagegen alles. Reicht der Platz danach immer noch nicht — etwa weil
// die Warteschlange nur aus nicht droppbaren Rahmen besteht —, bleibt der
// Close-Code des Traegers die Meldung: lieber kein Rahmen als ein stiller
// Verlust. Nutzinhalt wird nie still verworfen.
func (s *Session) Fail(f *api.Failure) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	rahmen := api.ServerMessage{Type: api.FrameError, StreamID: s.streamID, Seq: s.seq, Error: f}
	select {
	case s.outbox <- rahmen:
	default:
		// Voll: leeren, einen Rahmen opfern und den Fehler HINTEN anhaengen —
		// dieselbe Reihenfolge wie in Enqueue, damit genau ein Platz entsteht
		// und der Grund der Trennung ankommt.
		behalten := s.leeren()
		verworfen := -1
		for i, candidate := range behalten {
			if candidate.Droppable {
				verworfen = i
				break
			}
		}
		if verworfen < 0 {
			for i, candidate := range behalten {
				if candidate.Type == api.FrameReady {
					verworfen = i
					break
				}
			}
		}
		if verworfen >= 0 {
			behalten = append(behalten[:verworfen], behalten[verworfen+1:]...)
			s.dropped++
			behalten = append(behalten, rahmen)
		}
		s.zurueck(behalten)
	}
	s.mu.Unlock()
	s.delivered()
}

// delivered schliesst die Session genau einmal und weckt den Traeger.
func (s *Session) delivered() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	close(s.finished)
	s.mu.Unlock()
}

// merken legt einen Rahmen in den Ringpuffer der Session. Der Ring dient dem
// resync: er liefert einer wiederverbundenen Sicht die letzten Rahmen. Er ist
// bewusst NICHT die Warteschlange — er darf ueberlaufen, ohne den Client zu
// treffen.
func (s *Session) merken(m Message) {
	if cap(s.history) == 0 {
		return
	}
	s.history = append(s.history, m)
	if len(s.history) > cap(s.history) {
		s.history = s.history[len(s.history)-cap(s.history):]
	}
}

// itoa ist eine kleine Zahl-zu-Text-Umsetzung fuer Kennungen.
func itoa(n uint64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
