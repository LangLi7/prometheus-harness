package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-supervisor/internal/supervisor"
)

// fakeProvider ist eine Attrappe des Supervisors.
type fakeProvider struct {
	status  supervisor.Status
	restart map[string]bool
}

func (f *fakeProvider) Status() supervisor.Status { return f.status }
func (f *fakeProvider) Names() []string {
	out := make([]string, 0, len(f.status.Processes))
	for _, p := range f.status.Processes {
		out = append(out, p.Name)
	}
	return out
}

func (f *fakeProvider) Restart(name string) error {
	for _, p := range f.status.Processes {
		if p.Name == name {
			f.restart[name] = true
			return nil
		}
	}
	return supervisor.ErrUnknownProcess
}

func testServer() *Server {
	return New(&fakeProvider{
		status: supervisor.Status{
			Started:  true,
			PID:      4242,
			UptimeS:  12.5,
			Degraded: true,
			Processes: []supervisor.ProcessStatus{
				{Name: "store", State: supervisor.StateRunning, PID: 100, Restarts: 1},
				{Name: "cache", State: supervisor.StateFailed, Optional: true, ExitCode: 3, LastError: "start fehlgeschlagen"},
			},
		},
		restart: map[string]bool{},
	}, Build{Version: "9.9.9", Commit: "abc123", Built: "2026-01-01"}, nil)
}

func do(t *testing.T, s *Server, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	return rec
}

func TestHealthzIsJSONAndAlwaysOK(t *testing.T) {
	rec := do(t, testServer(), http.MethodGet, "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("Status = %d, erwartet 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type = %q", ct)
	}
	var body Health
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("Antwort ist kein JSON: %v (%s)", err, rec.Body.String())
	}
	if !body.OK {
		t.Error("ok muss true sein, solange der Supervisor antwortet")
	}
	if !body.Degraded {
		t.Error("degraded muss den Zustand melden")
	}
}

func TestVersion(t *testing.T) {
	rec := do(t, testServer(), http.MethodGet, "/version")
	if rec.Code != http.StatusOK {
		t.Fatalf("Status = %d, erwartet 200", rec.Code)
	}
	var body Version
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("Antwort ist kein JSON: %v", err)
	}
	if body.Name != "pmh-supervisor" || body.Version != "9.9.9" || body.Commit != "abc123" {
		t.Errorf("Version = %+v", body)
	}
	if body.Go == "" || body.OS == "" || body.Arch == "" {
		t.Errorf("Laufzeitangaben fehlen: %+v", body)
	}
}

func TestStatusListsEveryProcess(t *testing.T) {
	rec := do(t, testServer(), http.MethodGet, "/status")
	if rec.Code != http.StatusOK {
		t.Fatalf("Status = %d, erwartet 200", rec.Code)
	}
	var body Status
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("Antwort ist kein JSON: %v", err)
	}
	if len(body.Processes) != 2 {
		t.Fatalf("%d Prozesse, erwartet 2", len(body.Processes))
	}
	if body.OK {
		t.Error("ok muss false sein, wenn ein Pflichtdienst ausgefallen ist")
	}
	if body.Processes[0].Name != "store" || body.Processes[1].Name != "cache" {
		t.Errorf("Reihenfolge = %v", body.Processes)
	}
}

func TestStatusSingleProcess(t *testing.T) {
	rec := do(t, testServer(), http.MethodGet, "/status/store")
	if rec.Code != http.StatusOK {
		t.Fatalf("Status = %d, erwartet 200", rec.Code)
	}
	var body supervisor.ProcessStatus
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("Antwort ist kein JSON: %v", err)
	}
	if body.Name != "store" || body.State != supervisor.StateRunning {
		t.Errorf("Prozess = %+v", body)
	}

	rec = do(t, testServer(), http.MethodGet, "/status/gibtsnicht")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("Status = %d, erwartet 404", rec.Code)
	}
	var errBody ErrorBody
	if err := json.Unmarshal(rec.Body.Bytes(), &errBody); err != nil {
		t.Fatalf("Fehlerantwort ist kein JSON: %v", err)
	}
	if errBody.Error.Code != CodeUnknownProcess {
		t.Errorf("Fehlercode = %q, erwartet %q", errBody.Error.Code, CodeUnknownProcess)
	}
}

func TestRestartEndpoint(t *testing.T) {
	s := testServer()
	rec := do(t, s, http.MethodPost, "/processes/store/restart")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("Status = %d, erwartet 202 (%s)", rec.Code, rec.Body.String())
	}
	if !s.provider.(*fakeProvider).restart["store"] {
		t.Error("Restart wurde nicht aufgerufen")
	}
	rec = do(t, s, http.MethodPost, "/processes/gibtsnicht/restart")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("Status = %d, erwartet 404", rec.Code)
	}
	rec = do(t, s, http.MethodPost, "/processes/store")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("Status = %d, erwartet 404", rec.Code)
	}
}

func TestMethodNotAllowed(t *testing.T) {
	rec := do(t, testServer(), http.MethodPost, "/healthz")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("Status = %d, erwartet 405", rec.Code)
	}
	if allow := rec.Header().Get("Allow"); allow != http.MethodGet {
		t.Errorf("Allow = %q, erwartet GET", allow)
	}
	var body ErrorBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("Fehlerantwort ist kein JSON: %v", err)
	}
	if body.Error.Code != CodeMethod {
		t.Errorf("Fehlercode = %q", body.Error.Code)
	}
}

func TestRootListsEndpoints(t *testing.T) {
	rec := do(t, testServer(), http.MethodGet, "/")
	if rec.Code != http.StatusOK {
		t.Fatalf("Status = %d, erwartet 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "/healthz") {
		t.Errorf("Wurzelantwort nennt /healthz nicht: %s", rec.Body.String())
	}
	rec = do(t, testServer(), http.MethodGet, "/unbekannt")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("Status = %d, erwartet 404", rec.Code)
	}
}
