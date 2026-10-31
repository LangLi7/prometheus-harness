// Package api ist die HTTP-Oberflaeche des Recherchedienstes.
//
// # Zwei Oberflaechen, eine Faehigkeit
//
// Die Wege unter `/api/pmh/research/...` liefern **strukturiertes JSON** und
// sind fuer den Host und die Oberflaeche gedacht. `/mcp` spricht JSON-RPC 2.0
// und ist fuer Agenten und fremde MCP-Klienten gedacht. Beide rufen dieselbe
// `kette`; die Form unterscheidet sich, die Antwort nicht.
//
// # Was jeder Weg gemeinsam hat
//
//  - **Koerpergrenze vor dem Lesen.** Ein Weg, der erst liest und dann prueft,
//    ist ein Weg, der sich mit einem grossen Koerper belegen laesst.
//  - **Ein Fehler nennt den Grund und den Bericht.** „500" ohne Koerper ist eine
//    Auskunft ueber nichts.
//  - **Kein Geheimnis in einer Antwort.** Der Firecrawl-Schluessel erscheint
//    nirgends — auch nicht in der Auskunft ueber die Anbieter.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/LangLi7/prometheus-harness/services/pmh-research/internal/kette"
	"github.com/LangLi7/prometheus-harness/services/pmh-research/internal/mcp"
)

// Koerpergrenze ist die hoechste erlaubte Anfragegroesse in Bytes.
const Koerpergrenze = 1 << 20

// Auskunft beschreibt, was eingerichtet ist — ohne Geheimnisse.
type Auskunft struct {
	SearXNG   bool `json:"searxng"`
	Firecrawl bool `json:"firecrawl"`
	// Renderer sagt, ob ein lokaler Browser-Dienst eingerichtet ist
	// (`PMH_BROWSER_RENDER_URL`). Er ist der einzige Anbieter, der JavaScript
	// ausfuehrt — ohne ihn bleibt die Kette bei statischem HTML.
	Renderer bool `json:"renderer"`
	Browser  bool `json:"browser"`
	MaxBytes int64 `json:"maxBytes"`
	Privat    bool `json:"privatErlaubt"`
}

// Dienst buendelt Kette und Grenzen.
type Dienst struct {
	Kette    *kette.Kette
	MaxBytes int64
	Auskunft Auskunft
}

// Handler baut den Wegesatz.
func (d *Dienst) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/pmh/research/health", d.health)
	mux.HandleFunc("/api/pmh/research/search", d.suche)
	mux.HandleFunc("/api/pmh/research/fetch", d.hole)
	mux.HandleFunc("/mcp", d.rpc)
	return mux
}

func schreibe(w http.ResponseWriter, status int, wert any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.Header().Set("cache-control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(wert)
}

func (d *Dienst) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		schreibe(w, http.StatusMethodNotAllowed, map[string]any{"fehler": "nur GET"})
		return
	}
	schreibe(w, http.StatusOK, map[string]any{
		"ok":      true,
		"dienst":  "pmh-research",
		"fassung": "0.1.0",
		"anbieter": d.Auskunft,
	})
}

func liesKoerper(w http.ResponseWriter, r *http.Request, ziel any) bool {
	if r.Method != http.MethodPost {
		schreibe(w, http.StatusMethodNotAllowed, map[string]any{"fehler": "nur POST"})
		return false
	}
	roh, fehler := io.ReadAll(io.LimitReader(r.Body, Koerpergrenze+1))
	if fehler != nil {
		schreibe(w, http.StatusBadRequest, map[string]any{"fehler": "Koerper nicht lesbar", "grund": fehler.Error()})
		return false
	}
	if int64(len(roh)) > Koerpergrenze {
		schreibe(w, http.StatusRequestEntityTooLarge, map[string]any{
			"fehler": "Koerper zu gross", "grenze": Koerpergrenze,
		})
		return false
	}
	if fehler := json.Unmarshal(roh, ziel); fehler != nil {
		schreibe(w, http.StatusBadRequest, map[string]any{"fehler": "kein gueltiges JSON", "grund": fehler.Error()})
		return false
	}
	return true
}

func (d *Dienst) suche(w http.ResponseWriter, r *http.Request) {
	var anfrage struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	if !liesKoerper(w, r, &anfrage) {
		return
	}
	if anfrage.Query == "" {
		schreibe(w, http.StatusBadRequest, map[string]any{"fehler": "\"query\" fehlt"})
		return
	}
	grenze := anfrage.Limit
	if grenze <= 0 {
		grenze = 8
	}
	if grenze > 50 {
		grenze = 50
	}
	bericht, fehler := d.Kette.Suche(r.Context(), anfrage.Query, grenze)
	if fehler != nil {
		// **502 und nicht 200 mit leerer Liste.** Ein Anbieter, der nicht
		// antwortet, ist ein Fehler des Anbieters und kein Ergebnis der Suche.
		schreibe(w, http.StatusBadGateway, map[string]any{
			"fehler":  fehler.Error(),
			"bericht": bericht,
		})
		return
	}
	schreibe(w, http.StatusOK, bericht)
}

func (d *Dienst) hole(w http.ResponseWriter, r *http.Request) {
	var anfrage struct {
		URL string `json:"url"`
	}
	if !liesKoerper(w, r, &anfrage) {
		return
	}
	if anfrage.URL == "" {
		schreibe(w, http.StatusBadRequest, map[string]any{"fehler": "\"url\" fehlt"})
		return
	}
	bericht, fehler := d.Kette.Hole(r.Context(), anfrage.URL, d.MaxBytes)
	if fehler != nil {
		schreibe(w, http.StatusBadGateway, map[string]any{
			"fehler":  fehler.Error(),
			"bericht": bericht,
		})
		return
	}
	schreibe(w, http.StatusOK, bericht)
}

func (d *Dienst) rpc(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		schreibe(w, http.StatusMethodNotAllowed, map[string]any{"fehler": "nur POST"})
		return
	}
	roh, fehler := io.ReadAll(io.LimitReader(r.Body, Koerpergrenze+1))
	if fehler != nil {
		schreibe(w, http.StatusBadRequest, map[string]any{"fehler": "Koerper nicht lesbar"})
		return
	}
	if int64(len(roh)) > Koerpergrenze {
		schreibe(w, http.StatusRequestEntityTooLarge, map[string]any{"fehler": "Koerper zu gross"})
		return
	}
	antwort, ok := mcp.Behandle(r.Context(), roh, &mcp.Kontext{Kette: d.Kette, MaxBytes: d.MaxBytes})
	if !ok {
		// Eine Meldung ohne `id` bekommt **keine** Antwort. 202 heisst: angenommen,
		// nichts zu sagen.
		w.WriteHeader(http.StatusAccepted)
		return
	}
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.Header().Set("cache-control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(antwort)
}

// SucheUndHole ist die gemeinsame Fassung fuer Kommandozeile und Pruefungen.
//
// Sie existiert, damit `pmh-research search ...` und `POST /search` **nicht**
// zwei verschiedene Wege durch dieselbe Logik gehen.
func (d *Dienst) SucheUndHole(ctx context.Context, anfrage string, grenze int) (kette.Suchbericht, error) {
	if d.Kette == nil {
		return kette.Suchbericht{}, errors.New("keine Kette eingerichtet")
	}
	return d.Kette.Suche(ctx, anfrage, grenze)
}

// FormatiereFehler ergaenzt einen Fehler um die Anbieterliste — fuer die
// Kommandozeile, die keinen JSON-Koerper hat.
func FormatiereFehler(bericht kette.Suchbericht) string {
	text := ""
	for _, versuch := range bericht.Versuche {
		text += fmt.Sprintf("\n  %s: %d ms, %d Treffer", versuch.Anbieter, versuch.DauerMS, versuch.Treffer)
		if versuch.Fehler != "" {
			text += ", Fehler: " + versuch.Fehler
		}
	}
	return text
}
