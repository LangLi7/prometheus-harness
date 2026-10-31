// Die drei Anbieter: Metasuche ueber SearXNG, Extraktion ueber Firecrawl,
// Rueckfall auf einen nackten Abruf.
//
// # Die gemeinsame Haltung
//
// Jeder Anbieter prueft **seine eigene** Antwort, bevor er sie weitergibt. Eine
// Antwort mit Status 200 und ohne verwertbaren Inhalt ist ein Fehler und kein
// leeres Ergebnis — sonst sieht „der Anbieter ist kaputt" aus wie „es gibt
// nichts", und niemand merkt den Unterschied.
package kette

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// SearXNG — Metasuche
// ---------------------------------------------------------------------------

// SearXNG fragt eine SearXNG-Instanz.
//
// Erwartet wird `GET {basis}/search?q=...&format=json` mit
// `{"results":[{"title","url","content"}]}`. Das ist die Form, die eine
// Instanz mit `search.formats: [json]` liefert; ohne diese Einstellung
// antwortet sie mit HTML, und genau dann meldet dieser Anbieter einen Fehler
// statt null Treffer.
type SearXNG struct {
	Basis  string
	Klient *http.Client
}

func (s *SearXNG) Name() string { return "searxng" }

func (s *SearXNG) Suche(ctx context.Context, anfrage string, grenze int) ([]Treffer, error) {
	adresse, fehler := url.Parse(strings.TrimRight(s.Basis, "/") + "/search")
	if fehler != nil {
		return nil, fmt.Errorf("searxng: ungueltige Basis-URL: %w", fehler)
	}
	werte := adresse.Query()
	werte.Set("q", anfrage)
	werte.Set("format", "json")
	adresse.RawQuery = werte.Encode()

	anfrageHTTP, fehler := http.NewRequestWithContext(ctx, http.MethodGet, adresse.String(), nil)
	if fehler != nil {
		return nil, fmt.Errorf("searxng: Anfrage nicht baubar: %w", fehler)
	}
	anfrageHTTP.Header.Set("accept", "application/json")

	antwort, fehler := s.klient().Do(anfrageHTTP)
	if fehler != nil {
		return nil, fmt.Errorf("searxng: nicht erreichbar: %w", fehler)
	}
	defer func() { _ = antwort.Body.Close() }()

	if antwort.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("searxng: Status %d", antwort.StatusCode)
	}
	roh, fehler := io.ReadAll(io.LimitReader(antwort.Body, 4<<20))
	if fehler != nil {
		return nil, fmt.Errorf("searxng: Antwort nicht lesbar: %w", fehler)
	}

	var geparst struct {
		Results []struct {
			Title   string `json:"title"`
			URL     string `json:"url"`
			Content string `json:"content"`
		} `json:"results"`
	}
	if fehler := json.Unmarshal(roh, &geparst); fehler != nil {
		// Der haeufigste Fall: die Instanz liefert HTML, weil das JSON-Format
		// nicht eingeschaltet ist. Das wird gesagt und nicht als „keine Treffer"
		// ausgegeben.
		return nil, fmt.Errorf("searxng: Antwort ist kein JSON (Format json in der Instanz eingeschaltet?): %w", fehler)
	}

	treffer := make([]Treffer, 0, len(geparst.Results))
	for _, eintrag := range geparst.Results {
		if strings.TrimSpace(eintrag.URL) == "" {
			continue
		}
		treffer = append(treffer, Treffer{
			Titel: eintrag.Title,
			URL:   eintrag.URL,
			Auszug: eintrag.Content,
		})
		if grenze > 0 && len(treffer) >= grenze {
			break
		}
	}
	return treffer, nil
}

func (s *SearXNG) klient() *http.Client {
	if s.Klient != nil {
		return s.Klient
	}
	return NeuerKlient(20 * time.Second)
}

// ---------------------------------------------------------------------------
// Firecrawl — Suche und Extraktion
// ---------------------------------------------------------------------------

// Firecrawl spricht die Firecrawl-API.
//
// Zwei Wege, zwei Formen: `POST {basis}/v1/search` mit `{query, limit}` und
// `POST {basis}/v1/scrape` mit `{url, formats:["markdown"]}`. Beide verlangen
// den Schluessel im Kopf, beide antworten mit `{"data": ...}`.
type Firecrawl struct {
	Basis    string
	Schluessel string
	Klient   *http.Client
}

func (f *Firecrawl) Name() string { return "firecrawl" }

func (f *Firecrawl) Suche(ctx context.Context, anfrage string, grenze int) ([]Treffer, error) {
	if f.Schluessel == "" {
		return nil, errors.New("firecrawl: kein API-Schluessel eingerichtet")
	}
	koerper := map[string]any{"query": anfrage}
	if grenze > 0 {
		koerper["limit"] = grenze
	}
	roh, fehler := f.rufe(ctx, "/v1/search", koerper)
	if fehler != nil {
		return nil, fehler
	}

	// Tolerante Form: `data` ist je nach Fassung eine Liste oder ein Objekt mit
	// `web`. Beides wird gelesen; alles andere ist ein Fehler und kein leeres
	// Ergebnis.
	var huellen struct {
		Data json.RawMessage `json:"data"`
	}
	if fehler := json.Unmarshal(roh, &huellen); fehler != nil {
		return nil, fmt.Errorf("firecrawl: Antwort ist kein JSON: %w", fehler)
	}
	var liste []struct {
		URL         string `json:"url"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Markdown    string `json:"markdown"`
	}
	if fehler := json.Unmarshal(huellen.Data, &liste); fehler != nil {
		var alsObjekt struct {
			Web []struct {
				URL         string `json:"url"`
				Title       string `json:"title"`
				Description string `json:"description"`
			} `json:"web"`
		}
		if fehler2 := json.Unmarshal(huellen.Data, &alsObjekt); fehler2 != nil {
			return nil, fmt.Errorf("firecrawl: unbekannte Form von \"data\": %w", fehler)
		}
		for _, eintrag := range alsObjekt.Web {
			liste = append(liste, struct {
				URL         string `json:"url"`
				Title       string `json:"title"`
				Description string `json:"description"`
				Markdown    string `json:"markdown"`
			}{URL: eintrag.URL, Title: eintrag.Title, Description: eintrag.Description})
		}
	}

	treffer := make([]Treffer, 0, len(liste))
	for _, eintrag := range liste {
		if strings.TrimSpace(eintrag.URL) == "" {
			continue
		}
		treffer = append(treffer, Treffer{Titel: eintrag.Title, URL: eintrag.URL, Auszug: eintrag.Description})
		if grenze > 0 && len(treffer) >= grenze {
			break
		}
	}
	return treffer, nil
}

func (f *Firecrawl) Hole(ctx context.Context, ziel string, maxBytes int64) (Seite, error) {
	if f.Schluessel == "" {
		return Seite{}, errors.New("firecrawl: kein API-Schluessel eingerichtet")
	}
	roh, fehler := f.rufe(ctx, "/v1/scrape", map[string]any{
		"url":     ziel,
		"formats": []string{"markdown"},
	})
	if fehler != nil {
		return Seite{}, fehler
	}
	var huellen struct {
		Data struct {
			Markdown string `json:"markdown"`
			Metadata struct {
				Title string `json:"title"`
				URL   string `json:"sourceURL"`
			} `json:"metadata"`
		} `json:"data"`
	}
	if fehler := json.Unmarshal(roh, &huellen); fehler != nil {
		return Seite{}, fmt.Errorf("firecrawl: Antwort ist kein JSON: %w", fehler)
	}
	text := huellen.Data.Markdown
	bytes := int64(len(text))
	if maxBytes > 0 && bytes > maxBytes {
		text = text[:maxBytes]
	}
	adresse := huellen.Data.Metadata.URL
	if adresse == "" {
		adresse = ziel
	}
	return Seite{URL: adresse, Titel: huellen.Data.Metadata.Title, Text: text, Bytes: bytes}, nil
}

func (f *Firecrawl) rufe(ctx context.Context, pfad string, koerper map[string]any) ([]byte, error) {
	gepackt, fehler := json.Marshal(koerper)
	if fehler != nil {
		return nil, fmt.Errorf("firecrawl: Anfrage nicht baubar: %w", fehler)
	}
	adresse := strings.TrimRight(f.Basis, "/") + pfad
	anfrage, fehler := http.NewRequestWithContext(ctx, http.MethodPost, adresse, strings.NewReader(string(gepackt)))
	if fehler != nil {
		return nil, fmt.Errorf("firecrawl: Anfrage nicht baubar: %w", fehler)
	}
	anfrage.Header.Set("content-type", "application/json")
	anfrage.Header.Set("accept", "application/json")
	anfrage.Header.Set("authorization", "Bearer "+f.Schluessel)

	antwort, fehler := f.klient().Do(anfrage)
	if fehler != nil {
		return nil, fmt.Errorf("firecrawl: nicht erreichbar: %w", fehler)
	}
	defer func() { _ = antwort.Body.Close() }()

	if antwort.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("firecrawl: Status %d", antwort.StatusCode)
	}
	roh, fehler := io.ReadAll(io.LimitReader(antwort.Body, 8<<20))
	if fehler != nil {
		return nil, fmt.Errorf("firecrawl: Antwort nicht lesbar: %w", fehler)
	}
	return roh, nil
}

func (f *Firecrawl) klient() *http.Client {
	if f.Klient != nil {
		return f.Klient
	}
	return NeuerKlient(45 * time.Second)
}

// ---------------------------------------------------------------------------
// Browser — der nackte Abruf
// ---------------------------------------------------------------------------

// Browser ist der letzte Rueckfall: ein HTTP-Abruf ohne Extraktionsdienst.
//
// **Was er NICHT kann, und das ist der Grund, warum er der letzte ist:** er
// fuehrt kein JavaScript aus, loest keine Weiterleitungen in eine SPA und
// liefert keinen Haupttext. Er holt, was der Server ohne Skript ausliefert, und
// schneidet die Markierungen weg. Fuer eine Nachrichtenseite reicht das oft,
// fuer eine React-Anwendung fast nie — und das wird gesagt, nicht verschwiegen.
type Browser struct {
	Klient       *http.Client
	ErlaubtPrivat bool
}

func (b *Browser) Name() string { return "browser" }

func (b *Browser) Hole(ctx context.Context, ziel string, maxBytes int64) (Seite, error) {
	geparst, fehler := PruefeZiel(ziel, b.ErlaubtPrivat)
	if fehler != nil {
		return Seite{}, fehler
	}
	anfrage, fehler := http.NewRequestWithContext(ctx, http.MethodGet, geparst.String(), nil)
	if fehler != nil {
		return Seite{}, fmt.Errorf("browser: Anfrage nicht baubar: %w", fehler)
	}
	anfrage.Header.Set("user-agent", "PrometheusHarness/0.1 (+Recherche)")
	anfrage.Header.Set("accept", "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5")

	antwort, fehler := b.klient().Do(anfrage)
	if fehler != nil {
		return Seite{}, fmt.Errorf("browser: nicht erreichbar: %w", fehler)
	}
	defer func() { _ = antwort.Body.Close() }()

	if antwort.StatusCode != http.StatusOK {
		return Seite{}, fmt.Errorf("browser: Status %d", antwort.StatusCode)
	}
	grenze := maxBytes
	if grenze <= 0 {
		grenze = 2 << 20
	}
	roh, fehler := io.ReadAll(io.LimitReader(antwort.Body, grenze+1))
	if fehler != nil {
		return Seite{}, fmt.Errorf("browser: Antwort nicht lesbar: %w", fehler)
	}
	bytes := int64(len(roh))
	text := string(roh)
	titel, text := ausHTML(text)
	return Seite{URL: antwort.Request.URL.String(), Titel: titel, Text: text, Bytes: bytes}, nil
}

// ---------------------------------------------------------------------------
// Renderer — der echte Browser
// ---------------------------------------------------------------------------

// Renderer holt eine Seite aus einem lokalen Browser-Dienst.
//
// **Warum ein Dienst und nicht ein Aufruf hier.** Ein Browser, der JavaScript
// ausfuehrt, ist ein Prozess mit eigenem Lebenszyklus. Ihn aus diesem Prozess zu
// starten hiesse: Chromium an die Frist einer Anfrage binden und bei jedem
// Fehlschlag einen Zombie hinterlassen. `scripts/browser-render.mjs` haelt den
// Browser; dieser Anbieter fragt ihn nur.
//
// Erwartet wird `POST {Basis}/render` mit `{"url": "...", "maxBytes": n}` und
// `{"url","title","text","bytes"}` zurueck. Ist der Dienst nicht gestartet,
// scheitert der Versuch mit „nicht erreichbar" — und die Kette nimmt den
// naechsten, ohne dass jemand einen Schalter umlegen muss.
type Renderer struct {
	Basis         string
	Klient        *http.Client
	ErlaubtPrivat bool
}

func (r *Renderer) Name() string { return "renderer" }

func (r *Renderer) Hole(ctx context.Context, ziel string, maxBytes int64) (Seite, error) {
	geparst, fehler := PruefeZiel(ziel, r.ErlaubtPrivat)
	if fehler != nil {
		return Seite{}, fehler
	}
	koerper, fehler := json.Marshal(map[string]any{"url": geparst.String(), "maxBytes": maxBytes})
	if fehler != nil {
		return Seite{}, fmt.Errorf("renderer: Anfrage nicht baubar: %w", fehler)
	}
	anfrage, fehler := http.NewRequestWithContext(
		ctx, http.MethodPost, strings.TrimRight(r.Basis, "/")+"/render", strings.NewReader(string(koerper)),
	)
	if fehler != nil {
		return Seite{}, fmt.Errorf("renderer: Anfrage nicht baubar: %w", fehler)
	}
	anfrage.Header.Set("content-type", "application/json")
	anfrage.Header.Set("accept", "application/json")

	antwort, fehler := r.klient().Do(anfrage)
	if fehler != nil {
		return Seite{}, fmt.Errorf("renderer: nicht erreichbar: %w", fehler)
	}
	defer func() { _ = antwort.Body.Close() }()

	roh, fehler := io.ReadAll(io.LimitReader(antwort.Body, 16<<20))
	if fehler != nil {
		return Seite{}, fmt.Errorf("renderer: Antwort nicht lesbar: %w", fehler)
	}
	if antwort.StatusCode != http.StatusOK {
		return Seite{}, fmt.Errorf("renderer: Status %d: %s", antwort.StatusCode, gekuerzt(string(roh), 200))
	}
	var geantwortet struct {
		URL   string `json:"url"`
		Titel string `json:"title"`
		Text  string `json:"text"`
		Bytes int64  `json:"bytes"`
	}
	if fehler := json.Unmarshal(roh, &geantwortet); fehler != nil {
		return Seite{}, fmt.Errorf("renderer: Antwort ist kein JSON: %w", fehler)
	}
	if strings.TrimSpace(geantwortet.Text) == "" {
		return Seite{}, errors.New("renderer: leerer Text")
	}
	text := geantwortet.Text
	if maxBytes > 0 && int64(len(text)) > maxBytes {
		text = text[:maxBytes]
	}
	adresse := geantwortet.URL
	if adresse == "" {
		adresse = ziel
	}
	return Seite{URL: adresse, Titel: geantwortet.Titel, Text: text, Bytes: int64(len(text))}, nil
}

// gekuerzt schneidet einen Fehlertext fuer die Meldung zurecht.
func gekuerzt(text string, grenze int) string {
	text = strings.TrimSpace(text)
	if len(text) <= grenze {
		return text
	}
	return text[:grenze] + "…"
}

func (r *Renderer) klient() *http.Client {
	if r.Klient != nil {
		return r.Klient
	}
	// Grosszuegiger als die anderen: ein Browserstart plus Seitaufbau dauert.
	return NeuerKlient(60 * time.Second)
}

func (b *Browser) klient() *http.Client {
	if b.Klient != nil {
		return b.Klient
	}
	return NeuerKlient(20 * time.Second)
}
