// Package tests_test prueft den Anhaengepunkt von aussen: ueber HTTP und ueber
// den echten WebSocket-Draht. Das Paket liegt bewusst ausserhalb der
// Dienstpakete, damit die Tests die oeffentliche Flaeche benutzen.
package tests_test

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/internal/attach"
)

// stillerLogger schreibt nichts; die Tests pruefen Verhalten, nicht Ausgaben.
func stillerLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// testSetup baut Hub, Server und eine Attrappe des Upstreams.
func testSetup(t *testing.T, cfg attach.Config) (*attach.Server, *attach.Memory, *attach.Hub) {
	t.Helper()
	memory := attach.NewMemory(stillerLogger())
	hub := attach.New(memory, cfg, stillerLogger())
	server := attach.NewServer(hub,
		attach.ServerConfig{Hub: cfg, PingInterval: 0},
		attach.Build{Version: "9.9.9"}, stillerLogger())
	return server, memory, hub
}

// do schickt eine Anfrage an den Handler und liefert den Recorder.
func do(t *testing.T, h http.Handler, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// decode liest einen JSON-Koerper.
func decode(t *testing.T, body []byte, into any) {
	t.Helper()
	if err := json.Unmarshal(body, into); err != nil {
		t.Fatalf("Antwort ist kein JSON: %v (%s)", err, string(body))
	}
}
