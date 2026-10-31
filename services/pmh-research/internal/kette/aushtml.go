// Package kette — HTML zu Text, ohne Fremdbibliothek.
//
// # Warum kein Parser
//
// Ein echter HTML-Parser waere die richtige Wahl. Er ist hier trotzdem nicht
// drin: das Projekt hat fuer Go **keine** Fremdabhaengigkeit (siehe `go.mod` der
// Nachbardienste, die ohne `require` auskommen), und eine Abhaengigkeit nur fuer
// den Rueckfall-Anbieter waere ein schlechtes Geschaeft.
//
// # Was das kostet, ehrlich
//
// Die Zerlegung ist eine **Heuristik**, kein Parser. Sie kennt keine
// Verschachtelung, keine Namensraeume, keine kaputten Dokumente. Sie tut genau
// zwei Dinge gut: Skript- und Stilbloecke entfernen und Markierungen wegschneiden.
// Wer Haupttext von Navigation trennen will, braucht einen echten Parser — und
// genau dafuer ist Firecrawl in der Kette, nicht dieser Rueckfall.
package kette

import (
	"html"
	"regexp"
	"strings"
)

var (
	musterTitel   = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	musterSkript  = regexp.MustCompile(`(?is)<script\b[^>]*>.*?</script>`)
	musterStil    = regexp.MustCompile(`(?is)<style\b[^>]*>.*?</style>`)
	musterKomment = regexp.MustCompile(`(?s)<!--.*?-->`)
	musterBlock   = regexp.MustCompile(`(?is)</?(?:p|div|br|li|tr|h[1-6]|section|article|header|footer|nav|blockquote|pre)\b[^>]*>`)
	musterTag     = regexp.MustCompile(`(?s)<[^>]*>`)
	musterLeer    = regexp.MustCompile(`[ \t\f\v]+`)
	musterZeilen  = regexp.MustCompile(`\n{3,}`)
)

// ausHTML liefert Titel und Text einer HTML-Seite.
//
// Der Titel wird **vor** dem Entfernen der Markierungen gelesen: danach ist er
// nicht mehr vorhanden, und ein nachtraeglicher Leser wuerde ihn in der ersten
// Zeile des Textes suchen — was bei jeder Seite ohne Titel falsch raet.
func ausHTML(roh string) (titel string, text string) {
	if treffer := musterTitel.FindStringSubmatch(roh); len(treffer) > 1 {
		titel = aufraeumen(html.UnescapeString(treffer[1]))
	}

	bearbeitet := musterKomment.ReplaceAllString(roh, " ")
	bearbeitet = musterSkript.ReplaceAllString(bearbeitet, " ")
	bearbeitet = musterStil.ReplaceAllString(bearbeitet, " ")
	// Blockgrenzen werden zu Zeilenumbruechen, damit Absaetze nicht zusammenkleben.
	bearbeitet = musterBlock.ReplaceAllString(bearbeitet, "\n")
	bearbeitet = musterTag.ReplaceAllString(bearbeitet, "")
	bearbeitet = html.UnescapeString(bearbeitet)

	return titel, aufraeumen(bearbeitet)
}

func aufraeumen(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	zeilen := strings.Split(text, "\n")
	for index, zeile := range zeilen {
		zeilen[index] = strings.TrimSpace(musterLeer.ReplaceAllString(zeile, " "))
	}
	text = strings.Join(zeilen, "\n")
	text = musterZeilen.ReplaceAllString(text, "\n\n")
	return strings.TrimSpace(text)
}

// Grenze der Heuristik, damit sie nicht als Zusage gelesen wird.
const HinweisHTMLHeuristik = "Der Rueckfall-Anbieter schneidet Markierungen weg; er trennt keinen Haupttext von Navigation."
