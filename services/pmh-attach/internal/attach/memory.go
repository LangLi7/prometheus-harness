package attach

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/api"
)

// Memory ist ein Endpunkt im eigenen Prozess: der Standard, wenn kein
// --upstream gesetzt ist. Er beweist, dass Anhaengen, Fan-out und Sequenz
// ohne jeden Harness funktionieren — und er ist das Werkzeug der Tests.
//
// Ein Ereignis wird ueber Publish eingeliefert; jede offene Quelle sieht es.
type Memory struct {
	mu      sync.Mutex
	sources map[string][]*memorySource
	nextID  uint64
	log     *slog.Logger
}

// NewMemory baut den Endpunkt im eigenen Prozess.
func NewMemory(logger *slog.Logger) *Memory {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(discard{}, nil))
	}
	return &Memory{sources: make(map[string][]*memorySource), log: logger}
}

// Name liefert den Anzeigenamen des Endpunkts.
func (m *Memory) Name() string { return "memory" }

// Open liefert eine neue Quelle fuer den Strom.
func (m *Memory) Open(_ context.Context, streamID, view, windowID string) (Source, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.nextID++
	src := &memorySource{
		id:     fmt.Sprintf("s%d", m.nextID),
		stream: streamID,
		events: make(chan api.UpstreamEvent, 1024),
		closed: make(chan struct{}),
	}
	m.sources[streamID] = append(m.sources[streamID], src)
	m.log.Debug("Quelle geoeffnet", "strom", streamID, "view", view, "fenster", windowID, "quelle", src.id)
	return src, nil
}

// Publish liefert ein Ereignis an alle Quellen eines Stroms. Der Aufruf
// blockiert nicht: eine volle Quelle verliert das Ereignis und der Verwurf
// wird gezaehlt (die Quelle ist eine Attrappe, kein Client).
func (m *Memory) Publish(streamID string, ev api.UpstreamEvent) int {
	m.mu.Lock()
	sources := append([]*memorySource(nil), m.sources[streamID]...)
	m.mu.Unlock()
	n := 0
	for _, src := range sources {
		if src.push(ev) {
			n++
		}
	}
	return n
}

// Stroeme liefert die Anzahl bekannter Stroeme.
func (m *Memory) Stroeme() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sources)
}

// Quellen liefert die Anzahl offener Quellen eines Stroms.
func (m *Memory) Quellen(streamID string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sources[streamID])
}

// schliessen nimmt eine Quelle aus der Liste.
func (m *Memory) schliessen(src *memorySource) {
	m.mu.Lock()
	defer m.mu.Unlock()
	list := m.sources[src.stream]
	for i, candidate := range list {
		if candidate == src {
			m.sources[src.stream] = append(list[:i], list[i+1:]...)
			break
		}
	}
	if len(m.sources[src.stream]) == 0 {
		delete(m.sources, src.stream)
	}
}

type memorySource struct {
	id     string
	stream string
	events chan api.UpstreamEvent
	closed chan struct{}
	once   sync.Once
}

func (s *memorySource) push(ev api.UpstreamEvent) bool {
	select {
	case s.events <- ev:
		return true
	case <-s.closed:
		return false
	default:
		return false
	}
}

// Next liefert das naechste Ereignis oder das Ende des Endpunkts.
func (s *memorySource) Next(ctx context.Context) (api.UpstreamEvent, error) {
	select {
	case ev := <-s.events:
		return ev, nil
	case <-s.closed:
		return api.UpstreamEvent{}, fmt.Errorf("attach: Quelle %s wurde geschlossen", s.id)
	case <-ctx.Done():
		return api.UpstreamEvent{}, ctx.Err()
	}
}

// Close schliesst die Quelle. Der Aufruf ist idempotent.
func (s *memorySource) Close() error {
	s.once.Do(func() { close(s.closed) })
	return nil
}

// Event baut ein Ereignis mit Argumenten — die Kurzform fuer Tests und fuer
// eine spaetere lokale Sicht.
func Event(name string, args any, droppable bool) api.UpstreamEvent {
	raw, err := json.Marshal(args)
	if err != nil {
		raw = json.RawMessage(`null`)
	}
	return api.UpstreamEvent{Event: name, Args: raw, Droppable: droppable}
}
