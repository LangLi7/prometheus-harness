package tests

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-research/internal/kette"
)

// fakeSearXNG liefert die Form, die eine Instanz mit format=json ausgibt.
func fakeSearXNG(t *testing.T, status int, koerper string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/search" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("format") != "json" {
			// Der haeufigste Fehlaufbau: ohne format=json liefert die Instanz HTML.
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html><body>kein json</body></html>"))
			return
		}
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(koerper))
	}))
	t.Cleanup(server.Close)
	return server
}

// fakeFirecrawl liefert die Suchform der Firecrawl-API.
func fakeFirecrawl(t *testing.T, status int, koerper string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("authorization") == "" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(koerper))
	}))
	t.Cleanup(server.Close)
	return server
}

const searxJSON = `{"results":[
  {"title":"Erster Treffer","url":"https://example.invalid/a","content":"Auszug A"},
  {"title":"Zweiter Treffer","url":"https://example.invalid/b","content":"Auszug B"}
]}`

const firecrawlJSON = `{"data":[
  {"url":"https://example.invalid/fc","title":"Firecrawl-Treffer","description":"aus Firecrawl"}
]}`

func TestSearXNGLiefertTrefferMitHerkunft(t *testing.T) {
	server := fakeSearXNG(t, http.StatusOK, searxJSON)
	k := &kette.Kette{SucheAnbieter: []kette.SucheAnbieter{
		&kette.SearXNG{Basis: server.URL, Klient: server.Client()},
	}}

	bericht, fehler := k.Suche(context.Background(), "irgendwas", 10)
	if fehler != nil {
		t.Fatalf("unerwarteter Fehler: %v", fehler)
	}
	if len(bericht.Treffer) != 2 {
		t.Fatalf("erwartet 2 Treffer, bekommen %d", len(bericht.Treffer))
	}
	if bericht.Herkunft != "searxng" {
		t.Fatalf("Herkunft: erwartet searxng, bekommen %q", bericht.Herkunft)
	}
	for _, treffer := range bericht.Treffer {
		if treffer.Herkunft != "searxng" {
			t.Fatalf("jeder Treffer traegt seine Herkunft; dieser nicht: %+v", treffer)
		}
	}
}

func TestKetteFaelltAufDenNaechstenAnbieterZurueck(t *testing.T) {
	kaputt := fakeSearXNG(t, http.StatusInternalServerError, `{}`)
	fc := fakeFirecrawl(t, http.StatusOK, firecrawlJSON)

	k := &kette.Kette{SucheAnbieter: []kette.SucheAnbieter{
		&kette.SearXNG{Basis: kaputt.URL, Klient: kaputt.Client()},
		&kette.Firecrawl{Basis: fc.URL, Schluessel: "geheim", Klient: fc.Client()},
	}}

	bericht, fehler := k.Suche(context.Background(), "anfrage", 10)
	if fehler != nil {
		t.Fatalf("der Rueckfall haette greifen muessen: %v", fehler)
	}
	if bericht.Herkunft != "firecrawl" {
		t.Fatalf("Herkunft: erwartet firecrawl, bekommen %q", bericht.Herkunft)
	}
	// Der gescheiterte Anbieter steht im Bericht — sonst waere nicht erkennbar,
	// dass ein Teil der Kette ausgefallen ist.
	if len(bericht.Versuche) != 2 {
		t.Fatalf("erwartet 2 Versuche, bekommen %d", len(bericht.Versuche))
	}
	if bericht.Versuche[0].Anbieter != "searxng" || bericht.Versuche[0].Fehler == "" {
		t.Fatalf("der erste Versuch muss searxng mit Fehler sein: %+v", bericht.Versuche[0])
	}
	if bericht.Versuche[1].Treffer == 0 {
		t.Fatalf("der zweite Versuch muss Treffer nennen: %+v", bericht.Versuche[1])
	}
}

func TestKetteMeldetAlleAnbieterWennKeinerLiefert(t *testing.T) {
	a := fakeSearXNG(t, http.StatusInternalServerError, `{}`)
	b := fakeFirecrawl(t, http.StatusInternalServerError, `{}`)

	k := &kette.Kette{SucheAnbieter: []kette.SucheAnbieter{
		&kette.SearXNG{Basis: a.URL, Klient: a.Client()},
		&kette.Firecrawl{Basis: b.URL, Schluessel: "geheim", Klient: b.Client()},
	}}

	bericht, fehler := k.Suche(context.Background(), "anfrage", 10)
	if !errors.Is(fehler, kette.ErrNichtsGeliefert) {
		t.Fatalf("erwartet ErrNichtsGeliefert, bekommen %v", fehler)
	}
	if len(bericht.Versuche) != 2 {
		t.Fatalf("beide Anbieter muessen versucht worden sein, bekommen %d", len(bericht.Versuche))
	}
	for _, versuch := range bericht.Versuche {
		if versuch.Fehler == "" {
			t.Fatalf("jeder gescheiterte Versuch nennt einen Grund: %+v", versuch)
		}
	}
	if bericht.Herkunft != "" {
		t.Fatalf("ohne Lieferung gibt es keine Herkunft, bekommen %q", bericht.Herkunft)
	}
}

func TestLeererAnbieterHaeltDieKetteNichtFuerEinErgebnis(t *testing.T) {
	leer := fakeSearXNG(t, http.StatusOK, `{"results":[]}`)
	fc := fakeFirecrawl(t, http.StatusOK, firecrawlJSON)

	k := &kette.Kette{SucheAnbieter: []kette.SucheAnbieter{
		&kette.SearXNG{Basis: leer.URL, Klient: leer.Client()},
		&kette.Firecrawl{Basis: fc.URL, Schluessel: "geheim", Klient: fc.Client()},
	}}

	bericht, fehler := k.Suche(context.Background(), "anfrage", 10)
	if fehler != nil {
		t.Fatalf("unerwarteter Fehler: %v", fehler)
	}
	if bericht.Herkunft != "firecrawl" {
		t.Fatalf("ein leerer Anbieter ist kein Ergebnis; Herkunft: %q", bericht.Herkunft)
	}
	// „leer" und „kaputt" sind zwei verschiedene Aussagen — und beide stehen da.
	if bericht.Versuche[0].Fehler != "" {
		t.Fatalf("ein leerer Anbieter ist kein Fehler: %+v", bericht.Versuche[0])
	}
	if bericht.Versuche[0].Treffer != 0 {
		t.Fatalf("ein leerer Anbieter liefert 0 Treffer: %+v", bericht.Versuche[0])
	}
}

func TestSearXNGOhneJSONFormatIstEinFehlerUndKeinLeeresErgebnis(t *testing.T) {
	// **Der echte Fehlaufbau:** die Instanz hat `search.formats` ohne `json`,
	// antwortet also mit **200 und HTML** — auch wenn der Klient `format=json`
	// verlangt (was er immer tut). Wer das als „keine Treffer" liest, meldet
	// einen Konfigurationsfehler als Ergebnis und schickt den Nutzer mit einer
	// leeren Liste nach Hause.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><body>nichts</body></html>"))
	}))
	t.Cleanup(server.Close)

	anbieter := &kette.SearXNG{Basis: server.URL, Klient: server.Client()}
	treffer, fehler := anbieter.Suche(context.Background(), "anfrage", 0)
	if fehler == nil {
		t.Fatalf("eine HTML-Antwort haette ein Fehler sein muessen, bekommen %d Treffer", len(treffer))
	}
	if !strings.Contains(fehler.Error(), "kein JSON") {
		t.Fatalf("der Fehler nennt den Grund: %v", fehler)
	}
}

func TestFirecrawlOhneSchluesselSagtDasUndVersuchtNichts(t *testing.T) {
	anbieter := &kette.Firecrawl{Basis: "https://example.invalid", Schluessel: ""}
	_, fehler := anbieter.Suche(context.Background(), "anfrage", 0)
	if fehler == nil || !strings.Contains(fehler.Error(), "kein API-Schluessel") {
		t.Fatalf("erwartet Hinweis auf den fehlenden Schluessel, bekommen %v", fehler)
	}
}

// ---------------------------------------------------------------------------
// Abruf und Zielschutz
// ---------------------------------------------------------------------------

func TestBrowserLiefertTitelUndTextOhneMarkierungen(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Ein Titel</title>
			<style>body{color:red}</style></head>
			<body><script>var geheim = 1;</script>
			<h1>Ueberschrift</h1><p>Erster Absatz &amp; mehr.</p><p>Zweiter Absatz.</p>
			</body></html>`))
	}))
	t.Cleanup(server.Close)

	browser := &kette.Browser{Klient: server.Client(), ErlaubtPrivat: true}
	seite, fehler := browser.Hole(context.Background(), server.URL, 1<<20)
	if fehler != nil {
		t.Fatalf("unerwarteter Fehler: %v", fehler)
	}
	if seite.Titel != "Ein Titel" {
		t.Fatalf("Titel: erwartet %q, bekommen %q", "Ein Titel", seite.Titel)
	}
	if strings.Contains(seite.Text, "var geheim") {
		t.Fatalf("Skriptinhalt gehoert nicht in den Text: %q", seite.Text)
	}
	if strings.Contains(seite.Text, "color:red") {
		t.Fatalf("Stilinhalt gehoert nicht in den Text: %q", seite.Text)
	}
	if !strings.Contains(seite.Text, "Erster Absatz & mehr.") {
		t.Fatalf("Entitaeten muessen aufgeloest sein: %q", seite.Text)
	}
}

func TestBrowserLehntPrivateZieleAb(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("darf nicht gelesen werden"))
	}))
	t.Cleanup(server.Close)

	browser := &kette.Browser{Klient: server.Client(), ErlaubtPrivat: false}
	_, fehler := browser.Hole(context.Background(), server.URL, 1<<20)
	if fehler == nil {
		t.Fatal("ein privates Ziel muss ohne ausdrueckliche Erlaubnis abgelehnt werden")
	}
	if !strings.Contains(fehler.Error(), "privater Bereich") {
		t.Fatalf("der Fehler nennt den Grund: %v", fehler)
	}

	// Und mit Erlaubnis geht es — die Sperre ist eine Entscheidung, kein Defekt.
	erlaubt := &kette.Browser{Klient: server.Client(), ErlaubtPrivat: true}
	if _, fehler := erlaubt.Hole(context.Background(), server.URL, 1<<20); fehler != nil {
		t.Fatalf("mit Erlaubnis haette es gehen muessen: %v", fehler)
	}
}

func TestZielschutz(t *testing.T) {
	faelle := []struct {
		ziel     string
		erlaubt  bool
		ablehnen bool
		grund    string
	}{
		{"https://example.com/seite", false, false, ""},
		{"http://example.com", false, false, ""},
		{"ftp://example.com", false, true, "nur http und https"},
		{"file:///etc/passwd", false, true, "nur http und https"},
		{"http://127.0.0.1:8080/admin", false, true, "privater Bereich"},
		{"http://10.0.0.5/", false, true, "privater Bereich"},
		{"http://192.168.1.1/", false, true, "privater Bereich"},
		{"http://169.254.169.254/latest/meta-data", false, true, "privater Bereich"},
		{"http://[::1]/", false, true, "privater Bereich"},
		{"http://localhost/", false, true, "lokaler Name"},
		{"http://nutzer:passwort@example.com/", false, true, "Benutzerangaben"},
		{"https://example.com", true, false, ""},
		{"http://127.0.0.1:8080/admin", true, false, ""},
	}
	for _, fall := range faelle {
		_, fehler := kette.PruefeZiel(fall.ziel, fall.erlaubt)
		if fall.ablehnen && fehler == nil {
			t.Fatalf("%q haette abgelehnt werden muessen (erlaubt=%v)", fall.ziel, fall.erlaubt)
		}
		if !fall.ablehnen && fehler != nil {
			t.Fatalf("%q haette angenommen werden muessen: %v", fall.ziel, fehler)
		}
		if fall.ablehnen && fehler != nil && !strings.Contains(fehler.Error(), fall.grund) {
			t.Fatalf("%q: Grund %q nicht in %q", fall.ziel, fall.grund, fehler.Error())
		}
	}
}

// ---------------------------------------------------------------------------
// Renderer — der echte Browser als Dienst
// ---------------------------------------------------------------------------

// fakeRenderer antwortet wie `scripts/browser-render.mjs`.
func fakeRenderer(t *testing.T, status int, koerper string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/render" || r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(koerper))
	}))
	t.Cleanup(server.Close)
	return server
}

func TestRendererLiefertTextUndHerkunft(t *testing.T) {
	server := fakeRenderer(t, http.StatusOK, `{"url":"https://example.invalid/js","title":"Gerendert","text":"Sichtbarer Text","bytes":15}`)

	renderer := &kette.Renderer{Basis: server.URL, Klient: server.Client(), ErlaubtPrivat: true}
	k := &kette.Kette{HoleAnbieter: []kette.HoleAnbieter{renderer}}

	bericht, fehler := k.Hole(context.Background(), "https://example.invalid/js", 1<<20)
	if fehler != nil {
		t.Fatalf("unerwarteter Fehler: %v", fehler)
	}
	if bericht.Herkunft != "renderer" {
		t.Fatalf("Herkunft: erwartet renderer, bekommen %q", bericht.Herkunft)
	}
	if bericht.Text != "Sichtbarer Text" {
		t.Fatalf("Text: %q", bericht.Text)
	}
	if bericht.Titel != "Gerendert" {
		t.Fatalf("Titel: %q", bericht.Titel)
	}
}

// **Der Fall, der zaehlt:** der Renderer ist nicht gestartet (oder kaputt). Dann
// muss die Kette den naechsten Anbieter nehmen und **beides** im Bericht nennen —
// sonst sieht ein Ausfall aus wie „die Seite gibt es nicht".
func TestKetteNimmtDenNacktenAbrufWennDerRendererScheitert(t *testing.T) {
	kaputt := fakeRenderer(t, http.StatusInternalServerError, `{"error":"Browser startet nicht"}`)
	seite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Statisch</title></head><body><p>Nur HTML.</p></body></html>`))
	}))
	t.Cleanup(seite.Close)

	k := &kette.Kette{HoleAnbieter: []kette.HoleAnbieter{
		&kette.Renderer{Basis: kaputt.URL, Klient: kaputt.Client(), ErlaubtPrivat: true},
		&kette.Browser{Klient: seite.Client(), ErlaubtPrivat: true},
	}}

	bericht, fehler := k.Hole(context.Background(), seite.URL, 1<<20)
	if fehler != nil {
		t.Fatalf("der Rueckfall haette greifen muessen: %v", fehler)
	}
	if bericht.Herkunft != "browser" {
		t.Fatalf("Herkunft: erwartet browser, bekommen %q", bericht.Herkunft)
	}
	if len(bericht.Versuche) != 2 {
		t.Fatalf("erwartet 2 Versuche, bekommen %d", len(bericht.Versuche))
	}
	if bericht.Versuche[0].Anbieter != "renderer" || bericht.Versuche[0].Fehler == "" {
		t.Fatalf("der erste Versuch muss renderer mit Fehler sein: %+v", bericht.Versuche[0])
	}
	if !strings.Contains(bericht.Versuche[0].Fehler, "Status 500") {
		t.Fatalf("der Fehler nennt den Status: %+v", bericht.Versuche[0])
	}
}

// Ein Renderer, der mit 200 antwortet, aber keinen Text liefert, ist ein Fehler
// und kein Ergebnis — dieselbe Regel wie ueberall in dieser Kette.
func TestRendererOhneTextIstEinFehler(t *testing.T) {
	server := fakeRenderer(t, http.StatusOK, `{"url":"https://example.invalid","title":"","text":"   ","bytes":0}`)
	renderer := &kette.Renderer{Basis: server.URL, Klient: server.Client(), ErlaubtPrivat: true}

	if _, fehler := renderer.Hole(context.Background(), "https://example.invalid", 1<<20); fehler == nil {
		t.Fatal("leerer Text haette ein Fehler sein muessen")
	}
}
