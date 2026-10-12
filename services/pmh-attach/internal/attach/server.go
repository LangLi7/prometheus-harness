package attach

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-attach/internal/wire"
)

// ---------------------------------------------------------------------------
// Adresse
// ---------------------------------------------------------------------------

// WildcardHosts sind die Adressen, die jede Schnittstelle binden. Der Harness
// selbst lehnt sie ab ("binding every interface would expose remote code
// execution to the network", packages/host/webserver/src/index.ts); pmh-attach
// uebernimmt dieselbe Haltung und verlangt dafuer --allow-wildcard.
var WildcardHosts = map[string]bool{
	"0.0.0.0":         true,
	"::":              true,
	"0:0:0:0:0:0:0:0": true,
	"":                true,
}

// IstWildcard meldet, ob die Adresse jede Schnittstelle bindet.
func IstWildcard(host string) bool {
	h := strings.TrimSpace(host)
	if strings.HasPrefix(h, "[") && strings.HasSuffix(h, "]") {
		h = h[1 : len(h)-1]
	}
	return WildcardHosts[strings.ToLower(h)]
}

// ErrUngueltigeAdresse ist der Sammelfehler einer abgelehnten Bind-Adresse.
var ErrUngueltigeAdresse = errors.New("attach: Bind-Adresse nicht zulaessig")

// Adresse prueft Host und Port und liefert die Bind-Adresse.
//
// Ein Wildcard-Bind ist ohne allowWildcard ein Fehler, kein stiller Start von
// aussen erreichbar: dieselbe Haltung wie der Upstream-Host. Port 0 ist
// erlaubt und laesst das Betriebssystem einen freien Port waehlen.
func Adresse(host string, port int, allowWildcard bool) (string, error) {
	h := strings.TrimSpace(host)
	if h == "" {
		return "", fmt.Errorf("%w: --host fehlt", ErrUngueltigeAdresse)
	}
	if IstWildcard(h) && !allowWildcard {
		return "", fmt.Errorf("%w: %q bindet jede Schnittstelle; das gibt es nur mit --allow-wildcard",
			ErrUngueltigeAdresse, h)
	}
	if port < 0 || port > 65535 {
		return "", fmt.Errorf("%w: Port %d liegt ausserhalb von 0..65535", ErrUngueltigeAdresse, port)
	}
	if h != "localhost" && net.ParseIP(strings.Trim(h, "[]")) == nil {
		if _, err := net.LookupHost(h); err != nil {
			return "", fmt.Errorf("%w: Host %q ist weder eine IP noch aufloesbar: %v", ErrUngueltigeAdresse, h, err)
		}
	}
	return net.JoinHostPort(h, strconv.Itoa(port)), nil
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

// Build sind die Build-Angaben fuer /healthz und /version.
type Build struct {
	Version string
	Commit  string
	Built   string
}

// ServerConfig sind die Laufzeitgrenzen des Servers.
type ServerConfig struct {
	// Hub sind die Grenzen des Anhaenge-Hubs.
	Hub Config
	// PingInterval ist der Abstand der Herzschlag-Pings; 0 schaltet sie ab.
	PingInterval time.Duration
	// MaxMissedPings ist die Anzahl unbeantworteter Pings bis zum Ende.
	MaxMissedPings int
}

// Server traegt den Hub auf HTTP und WebSocket.
type Server struct {
	hub   *Hub
	log   *slog.Logger
	build Build
	mux   *http.ServeMux

	started        time.Time
	pingInterval   time.Duration
	readTimeout    time.Duration
	maxMissedPings int

	mu       sync.Mutex
	sessions map[*wire.Conn]*Session
}

// NewServer baut den Handler.
func NewServer(hub *Hub, cfg ServerConfig, build Build, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(discard{}, nil))
	}
	if build.Version == "" {
		build.Version = "0.0.0-dev"
	}
	if cfg.MaxMissedPings <= 0 {
		cfg.MaxMissedPings = 2
	}
	if cfg.Hub.ReadTimeout <= 0 {
		cfg.Hub.ReadTimeout = DefaultReadTimeout
	}
	s := &Server{
		hub:            hub,
		log:            logger,
		build:          build,
		started:        time.Now(),
		pingInterval:   cfg.PingInterval,
		readTimeout:    cfg.Hub.ReadTimeout,
		maxMissedPings: cfg.MaxMissedPings,
		sessions:       make(map[*wire.Conn]*Session),
	}
	mux := http.NewServeMux()
	mux.HandleFunc(api.HealthPath, s.handleHealth)
	mux.HandleFunc("/version", s.handleVersion)
	mux.HandleFunc("/status", s.handleStatus)
	mux.HandleFunc(api.AttachPath, s.handleAttach)
	mux.HandleFunc("/", s.handleRoot)
	s.mux = mux
	return s
}

// ServeHTTP macht den Server zu einem http.Handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

// Hub liefert den Anhaenge-Hub (fuer Status und Tests).
func (s *Server) Hub() *Hub { return s.hub }

// ---------------------------------------------------------------------------
// /healthz
// ---------------------------------------------------------------------------

// Health ist die Antwort auf GET /healthz. Sie ist auch dann 200, wenn kein
// Upstream erreichbar ist: der Dienst selbst lebt, und der Zustand des
// Upstreams steht sichtbar im Feld upstream.
type Health struct {
	Status   string  `json:"status"`
	Service  string  `json:"service"`
	Version  string  `json:"version"`
	UptimeS  float64 `json:"uptime_s"`
	Upstream string  `json:"upstream"`
	Clients  int     `json:"clients"`
	Streams  int     `json:"streams"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if !methodOK(w, r, http.MethodGet) {
		return
	}
	writeJSON(w, http.StatusOK, Health{
		Status:   "ok",
		Service:  "pmh-attach",
		Version:  s.build.Version,
		UptimeS:  time.Since(s.started).Seconds(),
		Upstream: s.hub.Endpoint().Name(),
		Clients:  s.hub.Clients(),
		Streams:  s.hub.Stroeme(),
	})
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	if !methodOK(w, r, http.MethodGet) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"name":     "pmh-attach",
		"version":  s.build.Version,
		"commit":   s.build.Commit,
		"built":    s.build.Built,
		"go":       runtime.Version(),
		"upstream": s.hub.Endpoint().Name(),
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if !methodOK(w, r, http.MethodGet) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"service":   "pmh-attach",
		"upstream":  s.hub.Endpoint().Name(),
		"clients":   s.hub.Clients(),
		"streams":   s.hub.Stroeme(),
		"queue":     s.hub.Config().Queue,
		"history":   s.hub.Config().History,
		"verbunden": s.verbundene(),
	})
}

func (s *Server) verbundene() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.sessions)
}

func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		writeError(w, http.StatusNotFound, "not_found", "unbekannter Pfad "+r.URL.Path)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"name":      "pmh-attach",
		"endpoints": []string{api.HealthPath, "/version", "/status", api.AttachPath + " (WebSocket)"},
		"protokoll": "siehe README.md, Abschnitt Protokoll",
	})
}

// ---------------------------------------------------------------------------
// /v1/attach — WebSocket
// ---------------------------------------------------------------------------

// handleAttach fuehrt den WebSocket-Handschlag aus und bedient genau eine
// Anhaengung je Verbindung.
//
// Ablauf:
//  1. Handschlag (wire.Accept).
//  2. Erster Rahmen muss attach sein; alles andere wird mit 1008 beendet.
//  3. Attach im Hub: Strom oeffnen, ready senden. Ein Fehler wird als
//     error-Rahmen sichtbar gemacht und die Verbindung geschlossen.
//  4. Zwei Schleifen: Lesen (Befehle des Clients) und Schreiben (Rahmen aus
//     der Warteschlange). Die Schreibschleife ist die Stelle, an der ein
//     langsamer Client die anderen nicht anhalten kann.
func (s *Server) handleAttach(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Methode "+r.Method+" nicht erlaubt")
		return
	}
	conn, err := wire.Accept(w, r)
	if err != nil {
		s.log.Warn("Handschlag abgelehnt", "fehler", err, "von", r.RemoteAddr)
		return
	}
	if err := s.bedienen(r.Context(), conn); err != nil && !errors.Is(err, io.EOF) {
		s.log.Info("Verbindung beendet", "von", r.RemoteAddr, "fehler", err)
	}
}

// bedienen haelt eine Verbindung, bis sie endet.
func (s *Server) bedienen(ctx context.Context, conn *wire.Conn) error {
	defer func() { _ = conn.Close() }()

	// Der erste Rahmen muss die Anhaengung deklarieren.
	_ = conn.SetReadDeadline(time.Now().Add(s.readTimeout))
	opcode, payload, err := conn.ReadMessage()
	if err != nil {
		if ce := new(wire.CloseError); errors.As(err, &ce) {
			return nil
		}
		return err
	}
	if opcode != wire.OpText {
		_ = conn.SendClose(wire.CloseTextRequired, "Textnachrichten verlangt")
		return fmt.Errorf("attach: erster Rahmen war kein Text")
	}
	msg, err := api.ParseClientMessage(string(payload))
	if err != nil || msg.Type != api.FrameAttach {
		_ = conn.SendClose(api.ClosePolicyViolated, "erst attach, dann Befehle")
		return fmt.Errorf("attach: erster Rahmen war kein attach: %v", err)
	}
	statement := Statement{View: msg.Endpoint, WindowID: msg.Payload.WindowID}

	session, err := s.hub.Attach(ctx, &sink{conn: conn}, statement)
	if err != nil {
		s.sendeFehler(conn, s.failure(err, statement))
		return err
	}

	s.mu.Lock()
	s.sessions[conn] = session
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.sessions, conn)
		s.mu.Unlock()
		s.hub.Remove(session)
	}()

	s.log.Info("Sicht angehaengt", "client", session.ID(), "view", statement.View,
		"fenster", statement.WindowID, "von", conn.RemoteAddr())

	var pongs atomic.Int32
	conn.OnPong = func() { pongs.Store(0) }

	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		s.schreiben(conn, session, &pongs)
	}()

	s.lesen(ctx, conn, session)

	// Die Session beenden, damit die Schreibschleife endet und noch gepufferte
	// Rahmen (etwa der error-Rahmen) ankommen.
	s.hub.Remove(session)
	select {
	case <-writerDone:
	case <-time.After(2 * time.Second):
		s.log.Warn("Schreiber der Sicht reagiert nicht", "client", session.ID())
		_ = conn.Close()
	}
	return nil
}

// failure uebersetzt einen Attach-Fehler in einen Fehlerrahmen.
func (s *Server) failure(err error, statement Statement) *api.Failure {
	switch {
	case errors.Is(err, ErrUpstreamNichtErreichbar):
		return api.NewFailure(api.CodeServiceUnavailable,
			"attach: Upstream nicht erreichbar: "+err.Error(),
			map[string]any{"upstream": s.hub.Endpoint().Name()})
	case errors.Is(err, ErrUngueltigeAnhaengung):
		return api.NewFailure(api.CodeBadRequest, err.Error(),
			map[string]any{"view": statement.View, "windowId": statement.WindowID})
	default:
		return api.NewFailure(api.CodeInternal,
			"attach: Anhaengen nicht moeglich: "+err.Error(),
			map[string]any{"view": statement.View, "windowId": statement.WindowID})
	}
}

// schreiben gibt die Warteschlange der Session aus. Genau hier zahlt sich die
// Trennung aus: die Warteschlange ist gepuffert, der Hub wartet nie auf die
// Leitung.
func (s *Server) schreiben(conn *wire.Conn, session *Session, pongs *atomic.Int32) {
	var ticker *time.Ticker
	if s.pingInterval > 0 {
		ticker = time.NewTicker(s.pingInterval)
		defer ticker.Stop()
	}
	for {
		select {
		case frame, ok := <-session.Frames():
			if ok && !s.ausgeben(conn, session, frame) {
				return
			}
		case <-session.Finished():
			// Die Session ist beendet; der Rest der Warteschlange wird noch
			// ausgegeben, damit ein error-Rahmen ankommt.
			s.restAusgeben(conn, session)
			_ = conn.SendClose(wire.CloseGoingAway, "Sicht abgehaengt")
			return
		case <-tickerC(ticker):
			if int(pongs.Add(1)) > s.maxMissedPings {
				s.log.Warn("Client antwortet nicht auf Ping", "client", session.ID())
				session.Fail(api.NewFailure(api.CodeCancelled,
					"attach: Client hat den Herzschlag nicht beantwortet",
					map[string]any{"streamId": session.StreamID()}))
				s.restAusgeben(conn, session)
				_ = conn.SendClose(wire.CloseGoingAway, "Herzschlag ausgeblieben")
				return
			}
			if err := conn.SendPing("pmh-attach"); err != nil {
				return
			}
		}
	}
}

// tickerC liefert den Kanal eines Zeitgebers oder einen nie ausloesenden Kanal,
// wenn der Herzschlag abgeschaltet ist.
func tickerC(t *time.Ticker) <-chan time.Time {
	if t == nil {
		return make(chan time.Time)
	}
	return t.C
}

// ausgeben schreibt einen Rahmen. Meldet false, wenn die Verbindung als
// beendet gilt.
func (s *Server) ausgeben(conn *wire.Conn, session *Session, frame api.ServerMessage) bool {
	text, err := json.Marshal(frame)
	if err != nil {
		s.log.Error("Rahmen nicht serialisierbar", "client", session.ID(), "fehler", err)
		_ = conn.SendClose(wire.CloseInternalError, "Rahmen nicht serialisierbar")
		return false
	}
	if err := conn.WriteMessage(wire.OpText, text); err != nil {
		s.log.Info("Schreiben fehlgeschlagen", "client", session.ID(), "fehler", err)
		return false
	}
	if frame.Type == api.FrameEnd {
		_ = conn.SendClose(wire.CloseNormalClosure, "Strom beendet")
		return false
	}
	return true
}

// restAusgeben schreibt die noch gepufferten Rahmen.
func (s *Server) restAusgeben(conn *wire.Conn, session *Session) {
	for {
		select {
		case frame := <-session.Frames():
			if !s.ausgeben(conn, session, frame) {
				return
			}
		default:
			return
		}
	}
}

// lesen bedient die Befehle des Clients.
func (s *Server) lesen(ctx context.Context, conn *wire.Conn, session *Session) {
	for {
		_ = conn.SetReadDeadline(time.Now().Add(s.readTimeout))
		opcode, payload, err := conn.ReadMessage()
		if err != nil {
			if ce := new(wire.CloseError); errors.As(err, &ce) {
				s.log.Debug("Client hat geschlossen", "client", session.ID(), "code", ce.Code)
				return
			}
			s.log.Debug("Lesen beendet", "client", session.ID(), "fehler", err)
			return
		}
		if opcode != wire.OpText {
			_ = conn.SendClose(wire.CloseTextRequired, "Textnachrichten verlangt")
			return
		}
		select {
		case <-ctx.Done():
			return
		default:
		}

		msg, err := api.ParseClientMessage(string(payload))
		if err != nil {
			s.log.Warn("Rahmen des Clients ungueltig", "client", session.ID(), "fehler", err)
			_ = conn.SendClose(api.ClosePolicyViolated, "ungueltiger Rahmen")
			return
		}
		if err := s.befehl(conn, session, msg); err != nil {
			return
		}
	}
}

// befehl fuehrt einen Rahmen der Clientsicht aus. Ein Rueckgabefehler beendet
// die Verbindung.
func (s *Server) befehl(conn *wire.Conn, session *Session, msg api.ClientMessage) error {
	switch msg.Type {
	case api.FrameAttach:
		// Zweites attach auf derselben Verbindung: genau der eine
		// Protokollverstoss, der im Core (stream-server.ts, duplizierte
		// streamId) die Verbindung beendet.
		_ = conn.SendClose(api.ClosePolicyViolated, "Verbindung haengt bereits")
		return ErrBereitsAngeschlossen

	case api.FrameCancel, api.FrameDetach:
		s.hub.Remove(session)
		_ = conn.SendClose(wire.CloseNormalClosure, "abgehaengt")
		return ErrNichtAngeschlossen

	case api.FrameItem:
		// Eingabe des Clients an den Upstream. Ohne Uplink-Kanal ist die
		// Eingabe nicht zustellbar — und das wird gesagt, nicht verschwiegen
		// (docs/concept.md Regel 3).
		_ = conn.SendClose(wire.CloseTooLarge, "Eingabe nicht zustellbar")
		return fmt.Errorf("attach: Eingabe nicht zustellbar (Strom %s)", session.StreamID())

	case api.FrameResync:
		frame := s.hub.Resync(session, msg.FromSeq)
		text, err := json.Marshal(frame)
		if err != nil {
			return err
		}
		if err := conn.WriteMessage(wire.OpText, text); err != nil {
			return err
		}
		s.log.Info("Voller Zustand geliefert", "client", session.ID(),
			"ab", msg.FromSeq, "bis", frame.Seq, "luecke", frame.Gap, "rahmen", len(frame.Messages))
		return nil

	case api.FrameEnd:
		// Halbschluss: der Core beendet damit den Uplink. pmh-attach fuehrt
		// keinen Uplink; der Rahmen wird angenommen.
		return nil

	default:
		_ = conn.SendClose(api.ClosePolicyViolated, "unbekannter Rahmen")
		return fmt.Errorf("attach: unbekannter Rahmen %q", msg.Type)
	}
}

// sendeFehler schickt einen error-Rahmen und schliesst danach.
func (s *Server) sendeFehler(conn *wire.Conn, f *api.Failure) {
	text, err := json.Marshal(api.ServerMessage{Type: api.FrameError, Error: f})
	if err == nil {
		_ = conn.WriteMessage(wire.OpText, text)
	}
	_ = conn.SendClose(wire.CloseInternalError, f.Code)
}

// sink ist die Senke einer Verbindung. Close ist idempotent, weil sowohl die
// Session als auch der Handler schliessen koennen.
type sink struct {
	conn *wire.Conn
	once sync.Once
}

func (s *sink) SendText(text string) error { return s.conn.WriteMessage(wire.OpText, []byte(text)) }

func (s *sink) Close() error {
	var err error
	s.once.Do(func() { err = s.conn.Close() })
	return err
}

// ---------------------------------------------------------------------------
// HTTP-Hilfen
// ---------------------------------------------------------------------------

func methodOK(w http.ResponseWriter, r *http.Request, want string) bool {
	if r.Method == want {
		return true
	}
	w.Header().Set("Allow", want)
	writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Methode "+r.Method+" nicht erlaubt")
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
	writeJSON(w, code, map[string]any{"error": map[string]any{"code": errCode, "message": msg}})
}

// Serve bindet addr und bedient bis ctx endet.
func Serve(ctx context.Context, addr string, handler http.Handler, log *slog.Logger) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	return ServeListener(ctx, ln, handler, log)
}

// ServeListener bedient auf einem bereits gebundenen Listener. Der getrennte
// Weg ist noetig, damit der Aufrufer die tatsaechliche Adresse kennt (Port 0).
func ServeListener(ctx context.Context, ln net.Listener, handler http.Handler, log *slog.Logger) error {
	srv := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		log.Info("Anhaengepunkt bereit", "adresse", "http://"+ln.Addr().String())
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
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
		return fmt.Errorf("attach: HTTP-Server beenden: %w", err)
	}
	return <-errCh
}
