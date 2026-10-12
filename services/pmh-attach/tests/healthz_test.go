package tests_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/internal/attach"
)

// TestHealthzReturns200WithExpectedJSON prueft die Lebendigkeitsantwort: 200,
// JSON, status ok und service pmh-attach. Der Dienst laeuft dabei OHNE
// Harness — der Upstream ist die Attrappe im eigenen Prozess.
func TestHealthzReturns200WithExpectedJSON(t *testing.T) {
	server, _, _ := testSetup(t, attach.Config{Queue: 8, History: 8})

	rec := do(t, server, http.MethodGet, "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("Status = %d, erwartet 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type = %q", ct)
	}
	var body attach.Health
	decode(t, rec.Body.Bytes(), &body)
	if body.Status != "ok" {
		t.Errorf("status = %q, erwartet ok", body.Status)
	}
	if body.Service != "pmh-attach" {
		t.Errorf("service = %q, erwartet pmh-attach", body.Service)
	}
	if body.Version != "9.9.9" {
		t.Errorf("version = %q", body.Version)
	}
	if !strings.Contains(body.Upstream, "memory") {
		t.Errorf("upstream = %q, erwartet die Attrappe", body.Upstream)
	}
	if body.Clients != 0 || body.Streams != 0 {
		t.Errorf("ohne Clients erwartet 0/0, bekam %d/%d", body.Clients, body.Streams)
	}
	// Der rohe Koerper muss die geforderten Felder woertlich tragen.
	raw := rec.Body.String()
	for _, want := range []string{`"status":"ok"`, `"service":"pmh-attach"`} {
		if !strings.Contains(raw, want) {
			t.Errorf("Koerper enthaelt %s nicht: %s", want, raw)
		}
	}
}

// TestHealthzRejectsNonGET prueft die Methodengrenze.
func TestHealthzRejectsNonGET(t *testing.T) {
	server, _, _ := testSetup(t, attach.Config{Queue: 8, History: 8})
	rec := do(t, server, http.MethodPost, "/healthz")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("Status = %d, erwartet 405", rec.Code)
	}
	if allow := rec.Header().Get("Allow"); allow != "GET" {
		t.Errorf("Allow = %q", allow)
	}
}

// TestStatusAndVersionAreJSON prueft die beiden Nebenendpunkte.
func TestStatusAndVersionAreJSON(t *testing.T) {
	server, _, _ := testSetup(t, attach.Config{Queue: 8, History: 8})

	rec := do(t, server, http.MethodGet, "/status")
	if rec.Code != http.StatusOK {
		t.Fatalf("/status = %d", rec.Code)
	}
	var status map[string]any
	decode(t, rec.Body.Bytes(), &status)
	if status["service"] != "pmh-attach" {
		t.Errorf("service = %v", status["service"])
	}
	if status["queue"] != float64(8) {
		t.Errorf("queue = %v, erwartet 8", status["queue"])
	}

	rec = do(t, server, http.MethodGet, "/version")
	if rec.Code != http.StatusOK {
		t.Fatalf("/version = %d", rec.Code)
	}
	var version map[string]any
	decode(t, rec.Body.Bytes(), &version)
	if version["name"] != "pmh-attach" || version["version"] != "9.9.9" {
		t.Errorf("version = %v", version)
	}
	if version["go"] == "" {
		t.Error("go-Version fehlt")
	}

	rec = do(t, server, http.MethodGet, "/")
	if rec.Code != http.StatusOK {
		t.Fatalf("/ = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "/healthz") {
		t.Errorf("/ nennt /healthz nicht: %s", rec.Body.String())
	}

	rec = do(t, server, http.MethodGet, "/gibtsnicht")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unbekannter Pfad = %d, erwartet 404", rec.Code)
	}
	var errBody struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	decode(t, rec.Body.Bytes(), &errBody)
	if errBody.Error.Code != "not_found" {
		t.Errorf("Fehlercode = %q", errBody.Error.Code)
	}
}

// TestHealthzJSONIsSmall prueft, dass die Lebendigkeitsantwort klein bleibt.
func TestHealthzJSONIsSmall(t *testing.T) {
	server, _, _ := testSetup(t, attach.Config{Queue: 8, History: 8})
	rec := do(t, server, http.MethodGet, "/healthz")
	if rec.Body.Len() > 512 {
		t.Fatalf("Körper ist %d Bytes; /healthz soll klein bleiben", rec.Body.Len())
	}
	var probe map[string]json.RawMessage
	decode(t, rec.Body.Bytes(), &probe)
	for _, feld := range []string{"status", "service", "version", "upstream", "clients", "streams"} {
		if _, ok := probe[feld]; !ok {
			t.Errorf("Feld %q fehlt", feld)
		}
	}
}
