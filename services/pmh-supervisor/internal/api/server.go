package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"runtime"
	"strings"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-supervisor/internal/supervisor"
)

// Provider ist alles, was die API vom Supervisor braucht. Der Supervisor
// erfuellt sie; Tests koennen sie durch eine Attrappe ersetzen.
type Provider interface {
	Status() supervisor.Status
	Restart(name string) error
	Names() []string
}

// Build sind die Build-Angaben fuer GET /version.
type Build struct {
	Version string
	Commit  string
	Built   string
}

// Server ist der HTTP-Handler des Supervisors.
type Server struct {
	provider Provider
	build    Build
	log      *slog.Logger
	mux      *http.ServeMux
}

// New baut den Handler. logger darf nil sein.
func New(provider Provider, build Build, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(discardWriter{}, nil))
	}
	if build.Version == "" {
		build.Version = "0.0.0-dev"
	}
	s := &Server{provider: provider, build: build, log: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealth)
	mux.HandleFunc("/version", s.handleVersion)
	mux.HandleFunc("/status", s.handleStatus)
	mux.HandleFunc("/status/", s.handleStatusOne)
	mux.HandleFunc("/processes/", s.handleProcess)
	mux.HandleFunc("/", s.handleRoot)
	s.mux = mux
	return s
}

// ServeHTTP macht den Server zu einem http.Handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

type discardWriter struct{}

func (discardWriter) Write(p []byte) (int, error) { return len(p), nil }

func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		writeError(w, http.StatusNotFound, CodeNotFound, "unbekannter Pfad "+r.URL.Path)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"name":      "pmh-supervisor",
		"endpoints": []string{"/healthz", "/version", "/status", "/status/{name}", "/processes/{name}/restart"},
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if !methodOK(w, r, http.MethodGet) {
		return
	}
	st := s.provider.Status()
	writeJSON(w, http.StatusOK, Health{
		OK:       true,
		Degraded: st.Degraded,
		Shutdown: st.Shutdown,
		UptimeS:  st.UptimeS,
	})
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	if !methodOK(w, r, http.MethodGet) {
		return
	}
	writeJSON(w, http.StatusOK, Version{
		Name:    "pmh-supervisor",
		Version: s.build.Version,
		Commit:  s.build.Commit,
		Built:   s.build.Built,
		Go:      runtime.Version(),
		OS:      runtime.GOOS,
		Arch:    runtime.GOARCH,
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if !methodOK(w, r, http.MethodGet) {
		return
	}
	writeJSON(w, http.StatusOK, s.snapshot())
}

func (s *Server) snapshot() Status {
	st := s.provider.Status()
	if st.Processes == nil {
		st.Processes = []supervisor.ProcessStatus{}
	}
	return Status{
		OK:        !st.Degraded,
		Degraded:  st.Degraded,
		Started:   st.Started,
		Shutdown:  st.Shutdown,
		PID:       st.PID,
		StartedAt: st.StartedAt,
		UptimeS:   st.UptimeS,
		Processes: st.Processes,
	}
}

func (s *Server) handleStatusOne(w http.ResponseWriter, r *http.Request) {
	if !methodOK(w, r, http.MethodGet) {
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/status/")
	if name == "" {
		writeError(w, http.StatusNotFound, CodeNotFound, "Dienstname fehlt")
		return
	}
	for _, p := range s.snapshot().Processes {
		if p.Name == name {
			writeJSON(w, http.StatusOK, p)
			return
		}
	}
	writeError(w, http.StatusNotFound, CodeUnknownProcess, fmt.Sprintf("unbekannter Dienst %q", name))
}

// handleProcess bedient POST /processes/{name}/restart.
func (s *Server) handleProcess(w http.ResponseWriter, r *http.Request) {
	if !methodOK(w, r, http.MethodPost) {
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/processes/")
	name, action, found := strings.Cut(rest, "/")
	if !found || name == "" || action != "restart" {
		writeError(w, http.StatusNotFound, CodeNotFound,
			"unbekannter Pfad "+r.URL.Path+"; erwartet /processes/{name}/restart")
		return
	}
	err := s.provider.Restart(name)
	switch {
	case err == nil:
		writeJSON(w, http.StatusAccepted, map[string]any{"restarted": name})
	case errors.Is(err, supervisor.ErrUnknownProcess):
		writeError(w, http.StatusNotFound, CodeUnknownProcess, fmt.Sprintf("unbekannter Dienst %q", name))
	default:
		writeError(w, http.StatusConflict, CodeInternal, err.Error())
	}
}

func methodOK(w http.ResponseWriter, r *http.Request, want string) bool {
	if r.Method == want {
		return true
	}
	w.Header().Set("Allow", want)
	writeError(w, http.StatusMethodNotAllowed, CodeMethod, "Methode "+r.Method+" nicht erlaubt")
	return false
}

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}

func writeError(w http.ResponseWriter, code int, errCode, msg string) {
	writeJSON(w, code, ErrorBody{Error: ErrorDetail{Code: errCode, Message: msg}})
}

// Serve startet den HTTP-Server auf addr und beendet ihn, wenn ctx endet.
// Der Server bindet nur die uebergebene Adresse; die Vorgabe ist 127.0.0.1
// (siehe cmd/pmh-supervisor).
func Serve(ctx context.Context, addr string, handler http.Handler, log *slog.Logger) error {
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		log.Info("Status-Endpunkt bereit", "adresse", "http://"+addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
			return
		}
		errCh <- nil
	}()
	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("HTTP-Server beenden: %w", err)
	}
	return <-errCh
}
