// Command pmh-research ist die Recherche-Kette des Prometheus Harness:
// Metasuche ueber SearXNG, Extraktion ueber Firecrawl, Rueckfall auf einen
// nackten Abruf — als HTTP-Wege **und** als MCP-Werkzeuge, aus einer Umsetzung.
//
// # Was dieser Dienst NICHT tut
//
// Er richtet keinen Anbieter ein. SearXNG ist eine Instanz, die der Betreiber
// laufen laesst; Firecrawl ist ein Dienst mit Schluessel. Fehlt ein Anbieter,
// wird er **nicht** ersetzt und **nicht** vorgetaeuscht — er fehlt im Bericht,
// und die Kette nimmt den naechsten.
//
// Er fuehrt auch kein JavaScript aus, loest keine SPA und umgeht keine Bezahl-
// schranke. Der Rueckfall-Anbieter holt, was der Server ohne Skript ausliefert.
//
// # Aufruf
//
//	pmh-research detect [--json]
//	pmh-research search --query <text> [--limit n] [--json]
//	pmh-research fetch  --url <adresse> [--json]
//	pmh-research serve  [--addr 127.0.0.1] [--port 4114]
//	pmh-research mcp                              (JSON-RPC ueber stdin/stdout)
//
// # Einrichtung (Umgebung)
//
//	PMH_SEARXNG_URL        z. B. http://127.0.0.1:8888
//	PMH_FIRECRAWL_URL      Vorgabe https://api.firecrawl.dev (nur mit Schluessel)
//	PMH_FIRECRAWL_KEY      der API-Schluessel
//	PMH_RESEARCH_PRIVAT    "1" erlaubt private Ziele beim Rueckfall-Abruf
//	PMH_RESEARCH_MAXBYTES  Obergrenze des abgerufenen Textes
//
// Exit-Codes: 0 Erfolg · 1 nichts geliefert oder Anbieterfehler · 2 Aufruffeher ·
// 125 Startfehler. Fehler nach stderr mit dem Praefix "pmh-research: ".
package main

import "os"

func main() {
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}
