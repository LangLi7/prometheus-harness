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
//   - Ist kein droppable Rahmen zu finden, wird der Client getrennt. Er
//     bekommt vorher einen error-Rahmen mit attach/peer-lagged, damit die
//     Trennung sichtbar ist und der Client einen resync anfordern kann.
type Session struct {
	id       string
	view     string
	windowID string
	streamID string
	queue    int

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
// niemals: ist die Warteschlange voll, wird der aelteste droppable Rahmen
// verworfen. Laeuft dabei nichts Droppables auf, meldet der Aufruf false und
// der Aufrufer trennt den Client.
func (s *Session) Enqueue(m Message) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		// Eine beendete Session nimmt nichts mehr an; das ist kein Fehler.
		return true
	}
	s.merken(m)

	select {
	case s.outbox <- m.frame():
		s.seq = m.Sequence
		return true
	default:
	}

	// Warteschlange voll: die vorhandenen Rahmen zwischenspeichern, den
	// aeltesten droppable verwerfen, den Rest unveraendert zuruecklegen.
	tiefe := len(s.outbox)
	behalten := make([]api.ServerMessage, 0, tiefe)
	for i := 0; i < tiefe; i++ {
		select {
		case candidate := <-s.outbox:
			behalten = append(behalten, candidate)
		default:
			i = tiefe
		}
	}

	verworfen := false
	for i, candidate := range behalten {
		if !verworfen && candidate.Droppable {
			behalten = append(behalten[:i], behalten[i+1:]...)
			s.dropped++
			verworfen = true
			break
		}
	}
	if !verworfen {
		// Nichts Droppables: alles zuruecklegen und den Client trennen.
		for _, candidate := range behalten {
			select {
			case s.outbox <- candidate:
			default:
			}
		}
		return false
	}

	for _, candidate := range behalten {
		select {
		case s.outbox <- candidate:
		default:
		}
	}
	select {
	case s.outbox <- m.frame():
		s.seq = m.Sequence
		return true
	default:
		return false
	}
}

// Fail beendet die Session sichtbar: sie bekommt einen error-Rahmen (falls
// noch Platz ist) und danach wird sie geschlossen.
func (s *Session) Fail(f *api.Failure) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	select {
	case s.outbox <- api.ServerMessage{Type: api.FrameError, StreamID: s.streamID, Seq: s.seq, Error: f}:
	default:
		// Kein Platz: der Client erfaehrt es ueber den Close-Code.
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

// zuletztSeit liefert die gemerkten Rahmen ab fromSeq.
func (s *Session) zuletztSeit(fromSeq uint64) []Message {
	out := make([]Message, 0, len(s.history))
	for _, m := range s.history {
		if m.Sequence > fromSeq {
			out = append(out, m)
		}
	}
	return out
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
