package tests

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-research/internal/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-research/internal/kette"
	"github.com/LangLi7/prometheus-harness/services/pmh-research/internal/mcp"
)

// apiFuerTest baut die HTTP-Oberflaeche mit einem echten SearXNG-Ersatz und
// ohne private Ziele — genau die Vorgabe, die auch im Betrieb gilt.
func apiFuerTest(t *testing.T, searxBasis string) http.Handler {
	t.Helper()
	klient := &http.Client{}
	k := &kette.Kette{
		SucheAnbieter: []kette.SucheAnbieter{&kette.SearXNG{Basis: searxBasis, Klient: klient}},
		HoleAnbieter:  []kette.HoleAnbieter{&kette.Browser{Klient: klient, ErlaubtPrivat: false}},
	}
	dienst := &api.Dienst{
		Kette:    k,
		MaxBytes: 1 << 20,
		Auskunft: api.Auskunft{SearXNG: true, Browser: true, MaxBytes: 1 << 20},
	}
	return dienst.Handler()
}

func kontextMitFake(t *testing.T) *mcp.Kontext {
	t.Helper()
	server := fakeSearXNG(t, http.StatusOK, searxJSON)
	return &mcp.Kontext{
		Kette: &kette.Kette{SucheAnbieter: []kette.SucheAnbieter{
			&kette.SearXNG{Basis: server.URL, Klient: server.Client()},
		}},
		MaxBytes: 1 << 20,
	}
}

func antworte(t *testing.T, roh string, kontext *mcp.Kontext) (map[string]any, bool) {
	t.Helper()
	antwort, ok := mcp.Behandle(context.Background(), []byte(roh), kontext)
	if !ok {
		return nil, false
	}
	var geparst map[string]any
	if fehler := json.Unmarshal(antwort, &geparst); fehler != nil {
		t.Fatalf("Antwort ist kein JSON: %v (%s)", fehler, string(antwort))
	}
	return geparst, true
}

func TestMcpInitializeNenntFassungUndFaehigkeiten(t *testing.T) {
	antwort, ok := antworte(t, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`, kontextMitFake(t))
	if !ok {
		t.Fatal("initialize muss antworten")
	}
	ergebnis, vorhanden := antwort["result"].(map[string]any)
	if !vorhanden {
		t.Fatalf("kein result: %v", antwort)
	}
	if ergebnis["protocolVersion"] != mcp.Fassung {
		t.Fatalf("protocolVersion: erwartet %q, bekommen %v", mcp.Fassung, ergebnis["protocolVersion"])
	}
	if _, vorhanden := ergebnis["capabilities"]; !vorhanden {
		t.Fatalf("capabilities fehlen: %v", ergebnis)
	}
	serverInfo, _ := ergebnis["serverInfo"].(map[string]any)
	if serverInfo["name"] != "pmh-research" {
		t.Fatalf("serverInfo.name: %v", serverInfo)
	}
}

func TestMcpToolsListNenntBeideWerkzeuge(t *testing.T) {
	antwort, _ := antworte(t, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`, kontextMitFake(t))
	ergebnis := antwort["result"].(map[string]any)
	werkzeuge, _ := ergebnis["tools"].([]any)
	if len(werkzeuge) != 2 {
		t.Fatalf("erwartet 2 Werkzeuge, bekommen %d", len(werkzeuge))
	}
	namen := []string{}
	for _, eintrag := range werkzeuge {
		werkzeug := eintrag.(map[string]any)
		namen = append(namen, werkzeug["name"].(string))
		if werkzeug["description"] == "" {
			t.Fatalf("ein Werkzeug ohne Beschreibung ist fuer ein Modell nicht benutzbar: %v", werkzeug["name"])
		}
		if _, vorhanden := werkzeug["inputSchema"]; !vorhanden {
			t.Fatalf("inputSchema fehlt bei %v", werkzeug["name"])
		}
	}
	if strings.Join(namen, ",") != "research_search,research_fetch" {
		t.Fatalf("unerwartete Werkzeugliste: %v", namen)
	}
}

func TestMcpToolsCallSearchLiefertInhaltUndHerkunft(t *testing.T) {
	antwort, _ := antworte(t,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"research_search","arguments":{"query":"anfrage","limit":5}}}`,
		kontextMitFake(t),
	)
	ergebnis := antwort["result"].(map[string]any)
	inhalte, _ := ergebnis["content"].([]any)
	if len(inhalte) != 1 {
		t.Fatalf("erwartet 1 Inhaltsteil, bekommen %d", len(inhalte))
	}
	teil := inhalte[0].(map[string]any)
	if teil["type"] != "text" {
		t.Fatalf("Inhaltstyp: %v", teil["type"])
	}
	text := teil["text"].(string)
	if !strings.Contains(text, "searxng") {
		t.Fatalf("die Herkunft gehoert in den Inhalt: %s", text)
	}
	if _, gesetzt := ergebnis["isError"]; gesetzt {
		t.Fatalf("ein gelungener Aufruf setzt kein isError: %v", ergebnis)
	}
}

func TestMcpToolsCallOhneAnbieterSetztIsError(t *testing.T) {
	leer := &mcp.Kontext{Kette: &kette.Kette{SucheAnbieter: []kette.SucheAnbieter{}}, MaxBytes: 1 << 20}
	antwort, _ := antworte(t,
		`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"research_search","arguments":{"query":"x"}}}`,
		leer,
	)
	ergebnis := antwort["result"].(map[string]any)
	if ergebnis["isError"] != true {
		t.Fatalf("ohne Anbieter muss isError gesetzt sein — sonst liest ein Modell es als 'nichts gefunden': %v", ergebnis)
	}
}

func TestMcpUnbekannteMethodeUndUnbekanntesWerkzeug(t *testing.T) {
	antwort, _ := antworte(t, `{"jsonrpc":"2.0","id":5,"method":"gibtsnicht"}`, kontextMitFake(t))
	fehler := antwort["error"].(map[string]any)
	if int(fehler["code"].(float64)) != mcp.CodeMethodeUnbekannt {
		t.Fatalf("erwartet %d, bekommen %v", mcp.CodeMethodeUnbekannt, fehler["code"])
	}

	antwort, _ = antworte(t,
		`{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"unbekannt","arguments":{}}}`,
		kontextMitFake(t),
	)
	fehler = antwort["error"].(map[string]any)
	if int(fehler["code"].(float64)) != mcp.CodeUngueltigeParams {
		t.Fatalf("erwartet %d, bekommen %v", mcp.CodeUngueltigeParams, fehler["code"])
	}
}

func TestMcpFehlendeParameterSindEinFehler(t *testing.T) {
	antwort, _ := antworte(t,
		`{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"research_search","arguments":{}}}`,
		kontextMitFake(t),
	)
	fehler := antwort["error"].(map[string]any)
	if int(fehler["code"].(float64)) != mcp.CodeUngueltigeParams {
		t.Fatalf("leere query muss abgelehnt werden: %v", fehler)
	}
}

func TestMcpMeldungOhneIdBekommtKeineAntwort(t *testing.T) {
	_, ok := antworte(t, `{"jsonrpc":"2.0","method":"notifications/initialized"}`, kontextMitFake(t))
	if ok {
		t.Fatal("eine Meldung ohne id darf keine Antwort erzeugen — sonst verliert ein Klient die Zuordnung")
	}
}

func TestMcpKaputtesJSONIstEinFehlerMitId(t *testing.T) {
	antwort, ok := antworte(t, `{kaputt`, kontextMitFake(t))
	if !ok {
		t.Fatal("auch eine kaputte Anfrage wird beantwortet")
	}
	fehler := antwort["error"].(map[string]any)
	if int(fehler["code"].(float64)) != mcp.CodeUngueltigeAnfrage {
		t.Fatalf("erwartet %d, bekommen %v", mcp.CodeUngueltigeAnfrage, fehler["code"])
	}
}

// ---------------------------------------------------------------------------
// Die HTTP-Oberflaeche
// ---------------------------------------------------------------------------

func TestApiWege(t *testing.T) {
	searx := fakeSearXNG(t, http.StatusOK, searxJSON)

	dienst := apiFuerTest(t, searx.URL)
	server := httptest.NewServer(dienst)
	t.Cleanup(server.Close)

	// health
	antwort, fehler := http.Get(server.URL + "/api/pmh/research/health")
	if fehler != nil {
		t.Fatalf("health nicht erreichbar: %v", fehler)
	}
	if antwort.StatusCode != http.StatusOK {
		t.Fatalf("health: erwartet 200, bekommen %d", antwort.StatusCode)
	}
	_ = antwort.Body.Close()

	// search
	koerper := strings.NewReader(`{"query":"anfrage","limit":3}`)
	antwort, fehler = http.Post(server.URL+"/api/pmh/research/search", "application/json", koerper)
	if fehler != nil {
		t.Fatalf("search nicht erreichbar: %v", fehler)
	}
	if antwort.StatusCode != http.StatusOK {
		t.Fatalf("search: erwartet 200, bekommen %d", antwort.StatusCode)
	}
	var bericht kette.Suchbericht
	if fehler := json.NewDecoder(antwort.Body).Decode(&bericht); fehler != nil {
		t.Fatalf("search-Antwort ist kein JSON: %v", fehler)
	}
	_ = antwort.Body.Close()
	if bericht.Herkunft != "searxng" || len(bericht.Treffer) == 0 {
		t.Fatalf("search: unerwarteter Bericht %+v", bericht)
	}

	// search ohne query → 400
	antwort, _ = http.Post(server.URL+"/api/pmh/research/search", "application/json", strings.NewReader(`{}`))
	if antwort.StatusCode != http.StatusBadRequest {
		t.Fatalf("ohne query: erwartet 400, bekommen %d", antwort.StatusCode)
	}
	_ = antwort.Body.Close()

	// fetch auf ein privates Ziel → 502 mit Grund
	antwort, _ = http.Post(server.URL+"/api/pmh/research/fetch", "application/json",
		strings.NewReader(`{"url":"http://127.0.0.1:1/x"}`))
	if antwort.StatusCode != http.StatusBadGateway {
		t.Fatalf("privates Ziel: erwartet 502, bekommen %d", antwort.StatusCode)
	}
	_ = antwort.Body.Close()

	// /mcp als Meldung → 202 ohne Koerper
	antwort, _ = http.Post(server.URL+"/mcp", "application/json",
		strings.NewReader(`{"jsonrpc":"2.0","method":"notifications/initialized"}`))
	if antwort.StatusCode != http.StatusAccepted {
		t.Fatalf("Meldung ueber HTTP: erwartet 202, bekommen %d", antwort.StatusCode)
	}
	_ = antwort.Body.Close()

	// /mcp als Anfrage → 200 mit JSON
	antwort, _ = http.Post(server.URL+"/mcp", "application/json",
		strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	if antwort.StatusCode != http.StatusOK {
		t.Fatalf("tools/list ueber HTTP: erwartet 200, bekommen %d", antwort.StatusCode)
	}
	var rpc map[string]any
	if fehler := json.NewDecoder(antwort.Body).Decode(&rpc); fehler != nil {
		t.Fatalf("MCP-Antwort ist kein JSON: %v", fehler)
	}
	_ = antwort.Body.Close()
	if _, vorhanden := rpc["result"]; !vorhanden {
		t.Fatalf("MCP-Antwort ohne result: %v", rpc)
	}
}
