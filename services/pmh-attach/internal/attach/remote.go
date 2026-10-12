package attach

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/api"
)

// Remote ist der Endpunkt zum laufenden Harness. Er oeffnet den Strom ueber
// HTTP und liest ihn als NDJSON (eine JSON-Zeile je Ereignis).
//
// Warum NDJSON und nicht der Mux des Core: der Core-Mux traegt logische
// Streams in einem eigenen Rahmenformat (item/end/error) und ist Typert-
// intern. Ein zweiter Dienst, der diesen Rahmen nachbaut, haette genau die
// doppelte Semantik, die docs/decisions/hybrid-then-self-build.md §3.3
// vermeiden will. pmh-attach lehnt sich deshalb an den Core NUR mit den
// Feldnamen an (event, args, value — siehe api.UpstreamEvent) und ueberlaesst
// die Uebersetzung dem Upstream selbst; der Pfad heisst api.EventsPath.
//
// Ist der Upstream nicht erreichbar, schlaegt Open sichtbar fehl: der Client
// bekommt einen error-Rahmen mit gateway/service-unavailable oder
// gateway/internal und die Verbindung wird mit einem Close-Code beendet. Es
// gibt keinen stillen Ausfall (docs/concept.md Regel 3).
type Remote struct {
	base   *url.URL
	client *http.Client
	token  string
	log    *slog.Logger
}

// RemoteOption ändert einen Endpunkt.
type RemoteOption func(*Remote)

// MitToken setzt ein Bearer-Token fuer den Upstream.
func MitToken(token string) RemoteOption {
	return func(r *Remote) { r.token = token }
}

// MitClient ersetzt den HTTP-Client.
func MitClient(c *http.Client) RemoteOption {
	return func(r *Remote) { r.client = c }
}

// NewRemote baut den Endpunkt. Die Adresse wird beim Bauen geprueft, damit ein
// Tippfehler im Flag sofort auffaellt und nicht erst beim ersten Anhaengen.
func NewRemote(rawURL string, logger *slog.Logger, opts ...RemoteOption) (*Remote, error) {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(discard{}, nil))
	}
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return nil, fmt.Errorf("attach: Upstream-Adresse %q ist keine URL: %w", rawURL, err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("attach: Upstream-Adresse %q braucht das Schema http oder https", rawURL)
	}
	if u.Host == "" {
		return nil, fmt.Errorf("attach: Upstream-Adresse %q hat keinen Host", rawURL)
	}
	r := &Remote{
		base: u,
		client: &http.Client{
			// Kein Gesamtzeitlimit: der Strom soll offen bleiben. Die
			// Anlaufzeit begrenzt der Aufrufer ueber den Kontext.
			Timeout: 0,
		},
		log: logger,
	}
	for _, opt := range opts {
		opt(r)
	}
	return r, nil
}

// Name liefert den Anzeigenamen samt Ziel.
func (r *Remote) Name() string { return "remote " + r.base.String() }

// Open verbindet den Strom. Der Aufruf wartet auf den Antwortkopf; ein
// Nicht-200 ist ein sichtbarer Fehler.
func (r *Remote) Open(ctx context.Context, streamID, view, windowID string) (Source, error) {
	target := *r.base
	target.Path = strings.TrimRight(target.Path, "/") + api.EventsPath
	q := target.Query()
	q.Set("streamId", streamID)
	q.Set("view", view)
	q.Set("windowId", windowID)
	target.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("attach: Upstream-Anfrage nicht baubar: %w", err)
	}
	req.Header.Set("Accept", "application/x-ndjson")
	if r.token != "" {
		req.Header.Set("Authorization", "Bearer "+r.token)
	}

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: Upstream %s nicht erreichbar: %v", ErrUpstreamNichtErreichbar, r.base, err)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		_ = resp.Body.Close()
		return nil, fmt.Errorf("%w: Upstream %s antwortet %d %s",
			ErrUpstreamNichtErreichbar, r.base, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	r.log.Info("Upstream-Strom verbunden", "strom", streamID, "view", view, "ziel", target.String())
	return &remoteSource{body: resp.Body, reader: bufio.NewReaderSize(resp.Body, 64*1024), target: target.String()}, nil
}

// ErrUpstreamNichtErreichbar ist der Sentinel eines fehlenden Upstreams.
var ErrUpstreamNichtErreichbar = fmt.Errorf("attach: Upstream fehlt")

type remoteSource struct {
	body   io.ReadCloser
	reader *bufio.Reader
	target string
}

// Next liest die naechste Ereigniszeile. Leere Zeilen und Kommentarzeilen
// (Beginn mit #) werden uebersprungen; eine unlesbare Zeile beendet den Strom
// sichtbar statt still.
func (s *remoteSource) Next(ctx context.Context) (api.UpstreamEvent, error) {
	for {
		if err := ctx.Err(); err != nil {
			return api.UpstreamEvent{}, err
		}
		line, err := s.reader.ReadBytes('\n')
		if len(bytes.TrimSpace(line)) > 0 {
			trimmed := bytes.TrimSpace(line)
			if trimmed[0] != '#' {
				var ev api.UpstreamEvent
				if derr := json.Unmarshal(trimmed, &ev); derr != nil {
					return api.UpstreamEvent{}, fmt.Errorf("attach: Upstream-Zeile ist kein Ereignis: %w", derr)
				}
				if ev.Event == "" && len(ev.Value) == 0 {
					return api.UpstreamEvent{}, fmt.Errorf("attach: Upstream-Zeile ohne event und ohne value")
				}
				return ev, nil
			}
		}
		if err != nil {
			if err == io.EOF {
				return api.UpstreamEvent{}, fmt.Errorf("attach: Upstream-Strom %s wurde beendet", s.target)
			}
			return api.UpstreamEvent{}, fmt.Errorf("attach: Upstream-Strom %s nicht lesbar: %w", s.target, err)
		}
	}
}

// Close schliesst den Antwortkoerper.
func (s *remoteSource) Close() error { return s.body.Close() }

// WarteAufUpstream prueft, ob der Upstream ueberhaupt antwortet, ohne einen
// Strom zu oeffnen. Das ist die Probe, die der Startlauf benutzt, damit ein
// fehlender Upstream schon beim Start sichtbar wird — und nicht erst, wenn
// sich der erste Client anhaengt.
func (r *Remote) WarteAufUpstream(ctx context.Context) error {
	probe := *r.base
	probe.Path = strings.TrimRight(probe.Path, "/") + api.HealthPath
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, probe.String(), nil)
	if err != nil {
		return err
	}
	if r.token != "" {
		req.Header.Set("Authorization", "Bearer "+r.token)
	}
	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %s nicht erreichbar: %v", ErrUpstreamNichtErreichbar, probe.String(), err)
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%w: %s antwortet %d", ErrUpstreamNichtErreichbar, probe.String(), resp.StatusCode)
	}
	return nil
}

// ProbeTimeout ist die Frist der Upstream-Probe beim Start.
const ProbeTimeout = 3 * time.Second
