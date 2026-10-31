package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-research/internal/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-research/internal/kette"
	"github.com/LangLi7/prometheus-harness/services/pmh-research/internal/mcp"
)

const praefix = "pmh-research: "

// konfig ist alles, was die Kette zur Laufzeit weiss.
//
// Sie kommt aus der Umgebung und **nicht** aus einer Datei: ein Dienst, der eine
// Konfigurationsdatei liest, braucht einen Pfad, einen Parser und eine Meldung
// ueber die Herkunft. Die Umgebung ist die kleinste Form, die ohne all das
// auskommt — und der Supervisor setzt sie ohnehin.
type konfig struct {
	searxng    string
	firecrawl  string
	schluessel string
	renderer   string
	privat     bool
	maxBytes   int64
}

// umgebung liest eine Umgebungsvariable.
//
// Als eigene Funktion und nicht als direkter `os.Getenv`-Aufruf: so steht an
// **einer** Stelle, woher die Einrichtung kommt, und ein spaeterer Wechsel auf
// eine Datei oder ein Secret hat einen Ort statt vieler.
func umgebung(name string) string {
	return os.Getenv(name)
}

func liesKonfig() konfig {
	maxBytes := int64(2 << 20)
	if roh := umgebung("PMH_RESEARCH_MAXBYTES"); roh != "" {
		if wert, fehler := strconv.ParseInt(roh, 10, 64); fehler == nil && wert > 0 {
			maxBytes = wert
		}
	}
	firecrawl := umgebung("PMH_FIRECRAWL_URL")
	if firecrawl == "" {
		firecrawl = "https://api.firecrawl.dev"
	}
	return konfig{
		searxng:    umgebung("PMH_SEARXNG_URL"),
		firecrawl:  firecrawl,
		schluessel: umgebung("PMH_FIRECRAWL_KEY"),
		renderer:   umgebung("PMH_BROWSER_RENDER_URL"),
		privat:     umgebung("PMH_RESEARCH_PRIVAT") == "1",
		maxBytes:   maxBytes,
	}
}

// baueKette stellt die Anbieter in der Reihenfolge zusammen, die der Betreiber
// eingerichtet hat.
//
// **Firecrawl ohne Schluessel wird weggelassen und nicht versucht.** Ein Aufruf
// ohne Schluessel ergaebe einen 401, und der stuende im Bericht als
// „Anbieterfehler" — obwohl in Wahrheit niemand ihn eingerichtet hat. Der
// Unterschied gehoert in die Auskunft, nicht in einen Fehlertext.
func (k konfig) baueKette() *kette.Kette {
	klient := kette.NeuerKlient(30 * time.Second)
	var suche []kette.SucheAnbieter
	var hole []kette.HoleAnbieter

	if k.searxng != "" {
		suche = append(suche, &kette.SearXNG{Basis: k.searxng, Klient: klient})
	}
	if k.schluessel != "" {
		fc := &kette.Firecrawl{Basis: k.firecrawl, Schluessel: k.schluessel, Klient: klient}
		suche = append(suche, fc)
		hole = append(hole, fc)
	}
	// **Der Browser steht zwischen Firecrawl und dem nackten Abruf.**
	//
	// Firecrawl zuerst: es liefert Markdown und kostet keinen Browserstart.
	// Der Renderer danach: er ist der einzige, der JavaScript ausfuehrt. Der
	// nackte Abruf zuletzt, weil er am wenigsten kann und am wenigsten kostet.
	// Ist der Renderer nicht gestartet, steht das als Versuch im Bericht und die
	// Kette nimmt den naechsten — kein Schalter, kein Sonderfall.
	if k.renderer != "" {
		hole = append(hole, &kette.Renderer{Basis: k.renderer, Klient: klient, ErlaubtPrivat: k.privat})
	}
	hole = append(hole, &kette.Browser{Klient: klient, ErlaubtPrivat: k.privat})

	return &kette.Kette{SucheAnbieter: suche, HoleAnbieter: hole}
}

func (k konfig) auskunft() api.Auskunft {
	return api.Auskunft{
		SearXNG:   k.searxng != "",
		Firecrawl: k.schluessel != "",
		Renderer:  k.renderer != "",
		Browser:   true,
		MaxBytes:  k.maxBytes,
		Privat:    k.privat,
	}
}

func run(args []string, ein io.Reader, aus io.Writer, fehlerAus io.Writer) int {
	if len(args) == 0 {
		fmt.Fprint(fehlerAus, praefix+"kein Unterbefehl. Aufrufe: detect | search | fetch | serve | mcp\n")
		return 2
	}
	konf := liesKonfig()

	switch args[0] {
	case "detect":
		return unterbefehlDetect(args[1:], aus, fehlerAus, konf)
	case "search":
		return unterbefehlSearch(args[1:], aus, fehlerAus, konf)
	case "fetch":
		return unterbefehlFetch(args[1:], aus, fehlerAus, konf)
	case "serve":
		return unterbefehlServe(args[1:], aus, fehlerAus, konf)
	case "mcp":
		return unterbefehlMCP(ein, args[1:], aus, fehlerAus, konf)
	default:
		fmt.Fprintf(fehlerAus, praefix+"unbekannter Unterbefehl %q\n", args[0])
		return 2
	}
}

func unterbefehlDetect(args []string, aus io.Writer, fehlerAus io.Writer, konf konfig) int {
	satz := flag.NewFlagSet("detect", flag.ContinueOnError)
	satz.SetOutput(fehlerAus)
	alsJSON := satz.Bool("json", false, "Ausgabe als JSON")
	if fehler := satz.Parse(args); fehler != nil {
		return 2
	}
	auskunft := konf.auskunft()
	if *alsJSON {
		return schreibeJSON(aus, map[string]any{
			"dienst":   "pmh-research",
			"fassung":  "0.1.0",
			"anbieter": auskunft,
			"suchkette": namensListe(konf.baueKette().SucheAnbieter),
		}, fehlerAus)
	}
	fmt.Fprintf(aus, "dienst    pmh-research 0.1.0\n")
	fmt.Fprintf(aus, "searxng   %s\n", jaNein(auskunft.SearXNG))
	fmt.Fprintf(aus, "firecrawl %s\n", jaNein(auskunft.Firecrawl))
	fmt.Fprintf(aus, "renderer  %s\n", jaNein(auskunft.Renderer))
	fmt.Fprintf(aus, "browser   ja (Rueckfall)\n")
	fmt.Fprintf(aus, "privat    %s\n", jaNein(auskunft.Privat))
	return 0
}

func unterbefehlSearch(args []string, aus io.Writer, fehlerAus io.Writer, konf konfig) int {
	satz := flag.NewFlagSet("search", flag.ContinueOnError)
	satz.SetOutput(fehlerAus)
	anfrage := satz.String("query", "", "Suchanfrage")
	grenze := satz.Int("limit", 8, "Hoechstzahl der Treffer")
	alsJSON := satz.Bool("json", false, "Ausgabe als JSON")
	if fehler := satz.Parse(args); fehler != nil {
		return 2
	}
	if *anfrage == "" {
		fmt.Fprint(fehlerAus, praefix+"search braucht --query\n")
		return 2
	}

	bericht, fehler := konf.baueKette().Suche(context.Background(), *anfrage, *grenze)
	if fehler != nil {
		if *alsJSON {
			_ = schreibeJSON(aus, map[string]any{"fehler": fehler.Error(), "bericht": bericht}, fehlerAus)
			return 1
		}
		fmt.Fprintf(fehlerAus, praefix+"%s%s\n", fehler.Error(), api.FormatiereFehler(bericht))
		return 1
	}
	if *alsJSON {
		return schreibeJSON(aus, bericht, fehlerAus)
	}
	for index, treffer := range bericht.Treffer {
		fmt.Fprintf(aus, "%d. %s\n   %s\n   %s\n", index+1, treffer.Titel, treffer.URL, treffer.Herkunft)
	}
	fmt.Fprintf(aus, "herkunft  %s (%d Versuch(e))\n", bericht.Herkunft, len(bericht.Versuche))
	return 0
}

func unterbefehlFetch(args []string, aus io.Writer, fehlerAus io.Writer, konf konfig) int {
	satz := flag.NewFlagSet("fetch", flag.ContinueOnError)
	satz.SetOutput(fehlerAus)
	ziel := satz.String("url", "", "abzurufende Adresse")
	alsJSON := satz.Bool("json", false, "Ausgabe als JSON")
	if fehler := satz.Parse(args); fehler != nil {
		return 2
	}
	if *ziel == "" {
		fmt.Fprint(fehlerAus, praefix+"fetch braucht --url\n")
		return 2
	}

	bericht, fehler := konf.baueKette().Hole(context.Background(), *ziel, konf.maxBytes)
	if fehler != nil {
		if *alsJSON {
			_ = schreibeJSON(aus, map[string]any{"fehler": fehler.Error(), "bericht": bericht}, fehlerAus)
			return 1
		}
		fmt.Fprintf(fehlerAus, praefix+"%s\n", fehler.Error())
		for _, versuch := range bericht.Versuche {
			fmt.Fprintf(fehlerAus, "  %s: %s\n", versuch.Anbieter, versuch.Fehler)
		}
		return 1
	}
	if *alsJSON {
		return schreibeJSON(aus, bericht, fehlerAus)
	}
	fmt.Fprintf(aus, "quelle    %s (%s)\n", bericht.Herkunft, bericht.URL)
	fmt.Fprintf(aus, "bytes     %d\n\n", bericht.Bytes)
	fmt.Fprintln(aus, bericht.Text)
	return 0
}

func unterbefehlServe(args []string, aus io.Writer, fehlerAus io.Writer, konf konfig) int {
	satz := flag.NewFlagSet("serve", flag.ContinueOnError)
	satz.SetOutput(fehlerAus)
	adresse := satz.String("addr", "127.0.0.1", "Adresse")
	port := satz.Int("port", 4114, "Port")
	if fehler := satz.Parse(args); fehler != nil {
		return 2
	}

	dienst := &api.Dienst{Kette: konf.baueKette(), MaxBytes: konf.maxBytes, Auskunft: konf.auskunft()}
	server := &http.Server{
		Addr:              net.JoinHostPort(*adresse, strconv.Itoa(*port)),
		Handler:           dienst.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	fmt.Fprintf(aus, "pmh-research hoert auf http://%s\n", server.Addr)
	if fehler := server.ListenAndServe(); fehler != nil {
		fmt.Fprintf(fehlerAus, praefix+"Start fehlgeschlagen: %s\n", fehler.Error())
		return 125
	}
	return 0
}

// unterbefehlMCP spricht JSON-RPC 2.0 ueber stdin/stdout, eine Nachricht je Zeile.
//
// **Zeilenweise und nicht laengenpraefixiert**, weil MCP-Klienten ueber stdio
// genau so sprechen. Eine Nachricht ohne `id` bekommt keine Antwort — das ist
// die Regel und nicht eine Auslassung.
func unterbefehlMCP(ein io.Reader, args []string, aus io.Writer, fehlerAus io.Writer, konf konfig) int {
	satz := flag.NewFlagSet("mcp", flag.ContinueOnError)
	satz.SetOutput(fehlerAus)
	if fehler := satz.Parse(args); fehler != nil {
		return 2
	}
	kontext := &mcp.Kontext{Kette: konf.baueKette(), MaxBytes: konf.maxBytes}
	leser := bufio.NewScanner(ein)
	leser.Buffer(make([]byte, 0, 64<<10), 8<<20)
	for leser.Scan() {
		zeile := strings.TrimSpace(leser.Text())
		if zeile == "" {
			continue
		}
		antwort, ok := mcp.Behandle(context.Background(), []byte(zeile), kontext)
		if !ok {
			continue
		}
		if _, fehler := aus.Write(append(antwort, '\n')); fehler != nil {
			fmt.Fprintf(fehlerAus, praefix+"Antwort nicht schreibbar: %s\n", fehler.Error())
			return 1
		}
	}
	if fehler := leser.Err(); fehler != nil {
		fmt.Fprintf(fehlerAus, praefix+"Eingabe nicht lesbar: %s\n", fehler.Error())
		return 1
	}
	return 0
}

func schreibeJSON(aus io.Writer, wert any, fehlerAus io.Writer) int {
	gepackt, fehler := json.MarshalIndent(wert, "", "  ")
	if fehler != nil {
		fmt.Fprintf(fehlerAus, praefix+"Ausgabe nicht serialisierbar: %s\n", fehler.Error())
		return 1
	}
	fmt.Fprintf(aus, "%s\n", string(gepackt))
	return 0
}

func namensListe(anbieter []kette.SucheAnbieter) []string {
	namen := make([]string, 0, len(anbieter))
	for _, eintrag := range anbieter {
		namen = append(namen, eintrag.Name())
	}
	return namen
}

func jaNein(wert bool) string {
	if wert {
		return "ja"
	}
	return "nein"
}
