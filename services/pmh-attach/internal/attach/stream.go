package attach

import (
	"sync"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/api"
)

// Stream ist ein logischer Upstream-Strom. Er traegt:
//
//   - die monoton wachsende Sequenznummer (Lueckenerkennung),
//   - die angeschlossenen Sessions (Fan-out 1 auf N),
//   - einen Ringpuffer der letzten Rahmen (Nachlieferung beim resync).
//
// Die Sequenznummer wird beim Verteilen vergeben, nicht vom Upstream: sie
// zaehlt, was der Hub tatsaechlich weitergereicht hat. Genau deshalb erkennt
// ein Client eine Luecke — jeder Rahmen traegt die Nummer, die er in der
// Reihenfolge des Stroms hat.
type Stream struct {
	id       string
	view     string
	windowID string
	history  int

	mu      sync.Mutex
	seq     uint64
	clients []*Session
	ring    []Message
}

// ID liefert den Namen des Stroms.
func (st *Stream) ID() string { return st.id }

// View liefert die Ansicht, die den Strom gewaehlt hat.
func (st *Stream) View() string { return st.view }

// Sequence liefert die zuletzt vergebene Sequenznummer.
func (st *Stream) Sequence() uint64 {
	st.mu.Lock()
	defer st.mu.Unlock()
	return st.seq
}

// Clients liefert die Anzahl angeschlossener Sessions.
func (st *Stream) Clients() int {
	st.mu.Lock()
	defer st.mu.Unlock()
	return len(st.clients)
}

// Add traegt eine Session ein. Der Aufrufer haelt die Hub-Sperre.
func (st *Stream) Add(s *Session) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.clients = append(st.clients, s)
}

// Remove nimmt eine Session heraus. Der Aufruf ist idempotent.
func (st *Stream) Remove(id string) {
	st.mu.Lock()
	defer st.mu.Unlock()
	for i, s := range st.clients {
		if s.id == id {
			st.clients = append(st.clients[:i], st.clients[i+1:]...)
			return
		}
	}
}

// merken legt einen Rahmen in den Ringpuffer. Der Aufrufer haelt die Sperre.
func (st *Stream) merken(m Message) {
	if st.history == 0 {
		return
	}
	st.ring = append(st.ring, m)
	if len(st.ring) > st.history {
		st.ring = st.ring[len(st.ring)-st.history:]
	}
}

// Snapshot liefert den vollen Zustand ab fromSeq.
//
// Rueckgabe: die nachlieferbaren Rahmen, die aktuelle Sequenznummer, die
// Sequenznummer, ab der die Rahmen gelten, und ob eine Luecke bleibt. Eine
// Luecke bleibt genau dann, wenn der Ring selbst schon ueberlaufen ist —
// also der aelteste gemerkte Rahmen spaeter liegt als fromSeq+1 (oder
// fromSeq hinter dem Ring liegt, weil der Strom weiterlief).
func (st *Stream) Snapshot(fromSeq uint64) (frames []api.EventFrame, seq, von uint64, luecke bool) {
	st.mu.Lock()
	defer st.mu.Unlock()
	seq = st.seq

	if len(st.ring) == 0 {
		// Kein Ring: der Client bekommt nur den aktuellen Stand.
		return []api.EventFrame{}, seq, seq, fromSeq < seq
	}
	aeltester := st.ring[0].Sequence
	von = fromSeq
	if von+1 < aeltester {
		// Die Rahmen zwischen fromSeq und dem aeltesten gemerkten fehlen.
		luecke = true
		von = aeltester - 1
	}
	frames = make([]api.EventFrame, 0, len(st.ring))
	for _, m := range st.ring {
		if m.Sequence > von {
			frames = append(frames, m.EventFrame())
		}
	}
	return frames, seq, von, luecke
}
