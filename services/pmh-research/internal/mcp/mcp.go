// Package mcp legt die Recherche als MCP-Werkzeuge vor — JSON-RPC 2.0.
//
// # Warum dasselbe Paket beide Oberflaechen speist
//
// Der Dienst bietet seine Faehigkeit zweimal an: als HTTP-Wege (fuer den Host)
// und als MCP-Werkzeuge (fuer Agenten und fremde Klienten). Beide rufen
// **dieselbe** `kette` auf. Zwei Umsetzungen waeren zwei Wahrheiten — die
// zweite wuerde irgendwann anders antworten als die erste, und niemand wuesste,
// welche gilt.
//
// # Was hier NICHT geschieht
//
// Kein Werkzeug wird „automatisch" aus Go-Funktionen abgeleitet. Die Beschreibung
// ist der Vertrag, den ein Modell liest; sie wird von Hand geschrieben und
// gepflegt. Eine abgeleitete Beschreibung waere eine Beschreibung des Codes und
// nicht der Absicht.
package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/LangLi7/prometheus-harness/services/pmh-research/internal/kette"
)

// Fassung ist die MCP-Protokollfassung, die dieser Dienst spricht.
const Fassung = "2024-11-05"

// Werkzeug ist ein MCP-Werkzeug: Name, Beschreibung, Eingabeschema.
type Werkzeug struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

// Kontext ist alles, was ein Werkzeug braucht.
type Kontext struct {
	Kette    *kette.Kette
	MaxBytes int64
}

// Werkzeuge liefert die Werkzeugliste.
func Werkzeuge() []Werkzeug {
	return []Werkzeug{
		{
			Name: "research_search",
			Description: "Metasuche ueber die eingerichteten Anbieter (SearXNG, dann Firecrawl). " +
				"Liefert Treffer mit Titel, URL, Auszug UND der Herkunft je Treffer. " +
				"Der Bericht nennt ausserdem jeden versuchten Anbieter mit Dauer und Fehler — " +
				"'keine Treffer' ist damit eine Aussage ueber alle Anbieter.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{"type": "string", "description": "Die Suchanfrage."},
					"limit": map[string]any{"type": "integer", "minimum": 1, "maximum": 50, "description": "Hoechstzahl der Treffer (Vorgabe 8)."},
				},
				"required":             []string{"query"},
				"additionalProperties": false,
			},
		},
		{
			Name: "research_fetch",
			Description: "Ruft eine Seite ab und liefert ihren Text. Erst Firecrawl (Extraktion), " +
				"dann ein nackter Abruf als Rueckfall. Private und lokale Ziele werden abgelehnt, " +
				"solange sie nicht ausdruecklich erlaubt sind.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"url": map[string]any{"type": "string", "description": "Die abzurufende Adresse (http oder https)."},
				},
				"required":             []string{"url"},
				"additionalProperties": false,
			},
		},
	}
}

// rpcAnfrage ist eine JSON-RPC-2.0-Anfrage.
type rpcAnfrage struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcFehler struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

type rpcAntwort struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcFehler      `json:"error,omitempty"`
}

// Fehlercodes nach JSON-RPC 2.0. Sie werden nicht erfunden: ein Klient
// verzweigt darauf.
const (
	CodeUngueltigeAnfrage = -32600
	CodeMethodeUnbekannt  = -32601
	CodeUngueltigeParams  = -32602
	CodeInternerFehler    = -32603
)

// Behandle verarbeitet **eine** JSON-RPC-Nachricht und liefert die Antwort.
//
// `false` heisst: es war eine Meldung ohne `id` (eine Notification) — darauf
// wird **nicht** geantwortet. Wer darauf antwortet, bricht die Regel, und ein
// Klient, der mehrere Nachrichten schickt, verliert die Zuordnung.
func Behandle(ctx context.Context, roh []byte, k *Kontext) ([]byte, bool) {
	var anfrage rpcAnfrage
	if fehler := json.Unmarshal(roh, &anfrage); fehler != nil {
		return verpacke(rpcAntwort{JSONRPC: "2.0", Error: &rpcFehler{
			Code: CodeUngueltigeAnfrage, Message: "kein gueltiges JSON: " + fehler.Error(),
		}}), true
	}
	if anfrage.JSONRPC != "2.0" {
		return verpacke(rpcAntwort{JSONRPC: "2.0", ID: anfrage.ID, Error: &rpcFehler{
			Code: CodeUngueltigeAnfrage, Message: `"jsonrpc" muss "2.0" sein`,
		}}), true
	}
	istMeldung := len(anfrage.ID) == 0

	var ergebnis any
	var rpcFehl *rpcFehler

	switch anfrage.Method {
	case "initialize":
		ergebnis = map[string]any{
			"protocolVersion": Fassung,
			"serverInfo": map[string]any{
				"name":    "pmh-research",
				"version": "0.1.0",
			},
			"capabilities": map[string]any{
				"tools": map[string]any{"listChanged": false},
			},
		}
	case "ping":
		ergebnis = map[string]any{}
	case "tools/list":
		ergebnis = map[string]any{"tools": Werkzeuge()}
	case "tools/call":
		ergebnis, rpcFehl = rufeWerkzeug(ctx, anfrage.Params, k)
	case "notifications/initialized", "notifications/cancelled":
		// Meldungen ohne Antwort. Sie werden angenommen und nicht beantwortet.
		istMeldung = true
	default:
		rpcFehl = &rpcFehler{Code: CodeMethodeUnbekannt, Message: "unbekannte Methode: " + anfrage.Method}
	}

	if istMeldung {
		return nil, false
	}
	if rpcFehl != nil {
		return verpacke(rpcAntwort{JSONRPC: "2.0", ID: anfrage.ID, Error: rpcFehl}), true
	}
	return verpacke(rpcAntwort{JSONRPC: "2.0", ID: anfrage.ID, Result: ergebnis}), true
}

type aufruf struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

func rufeWerkzeug(ctx context.Context, params json.RawMessage, k *Kontext) (any, *rpcFehler) {
	var eingabe aufruf
	if fehler := json.Unmarshal(params, &eingabe); fehler != nil {
		return nil, &rpcFehler{Code: CodeUngueltigeParams, Message: "params.name/arguments fehlen: " + fehler.Error()}
	}
	if k == nil || k.Kette == nil {
		return nil, &rpcFehler{Code: CodeInternerFehler, Message: "keine Kette eingerichtet"}
	}

	switch eingabe.Name {
	case "research_search":
		var argumente struct {
			Query string `json:"query"`
			Limit int    `json:"limit"`
		}
		if fehler := json.Unmarshal(eingabe.Arguments, &argumente); fehler != nil {
			return nil, &rpcFehler{Code: CodeUngueltigeParams, Message: fehler.Error()}
		}
		if argumente.Query == "" {
			return nil, &rpcFehler{Code: CodeUngueltigeParams, Message: "\"query\" fehlt"}
		}
		grenze := argumente.Limit
		if grenze <= 0 {
			grenze = 8
		}
		bericht, fehler := k.Kette.Suche(ctx, argumente.Query, grenze)
		// Ein Fehlschlag ist **kein** JSON-RPC-Fehler: die Werkzeugausfuehrung hat
		// stattgefunden und ihr Ergebnis ist „nichts gefunden, und hier ist warum".
		// Das gehoert in den Inhalt, damit das Modell es lesen kann.
		return alsInhalt(bericht, fehler), nil

	case "research_fetch":
		var argumente struct {
			URL string `json:"url"`
		}
		if fehler := json.Unmarshal(eingabe.Arguments, &argumente); fehler != nil {
			return nil, &rpcFehler{Code: CodeUngueltigeParams, Message: fehler.Error()}
		}
		if argumente.URL == "" {
			return nil, &rpcFehler{Code: CodeUngueltigeParams, Message: "\"url\" fehlt"}
		}
		bericht, fehler := k.Kette.Hole(ctx, argumente.URL, k.MaxBytes)
		return alsInhalt(bericht, fehler), nil

	default:
		return nil, &rpcFehler{Code: CodeUngueltigeParams, Message: "unbekanntes Werkzeug: " + eingabe.Name}
	}
}

// alsInhalt verpackt ein Ergebnis in die MCP-Inhaltsform.
func alsInhalt(wert any, fehler error) map[string]any {
	koerper := map[string]any{"ergebnis": wert}
	if fehler != nil {
		koerper["fehler"] = fehler.Error()
	}
	gepackt, packFehler := json.Marshal(koerper)
	if packFehler != nil {
		gepackt = []byte(fmt.Sprintf(`{"fehler":"Ergebnis nicht serialisierbar: %s"}`, packFehler.Error()))
	}
	ergebnis := map[string]any{
		"content": []map[string]any{{"type": "text", "text": string(gepackt)}},
	}
	if errors.Is(fehler, kette.ErrNichtsGeliefert) {
		// `isError` heisst: das Werkzeug hat nicht geleistet, was es versprochen
		// hat. Ein leeres Suchergebnis ist genau das — und das Modell soll es
		// nicht als "nichts da draussen" lesen, sondern als "die Anbieter
		// antworten nicht".
		ergebnis["isError"] = true
	}
	return ergebnis
}

func verpacke(antwort rpcAntwort) []byte {
	gepackt, fehler := json.Marshal(antwort)
	if fehler != nil {
		return []byte(`{"jsonrpc":"2.0","error":{"code":-32603,"message":"Antwort nicht serialisierbar"}}`)
	}
	return gepackt
}
