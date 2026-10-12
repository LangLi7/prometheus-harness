// Command pmh-nix bildet eine Selbstaenderung des Systems als gestuften,
// umkehrbaren Vorgang ab: Vorschlag -> Pruefung -> Anwendung -> Generation ->
// Rueckweg.
//
// # Was dieser Dienst NICHT tut
//
// Er installiert kein NixOS und kein Nix, tauscht keine Distribution aus,
// partitioniert nicht und bootet nichts. NixOS/Nix sind auf diesem Rechner
// nicht vorhanden, und das bleibt so (Weisung "kein nixos installieren lol",
// docs/decisions/hybrid-then-self-build.md Abschnitt 3.1). Das Vorgabe-Backend
// ist eine Attrappe, die nichts am System aendert.
//
// # Die Regel, die der Dienst durchsetzt
//
//	Das Modell empfiehlt, die Policy entscheidet —
//	ein Modell loest niemals einen Systemwechsel aus.
//
// Ein Aufrufer kann genau eines: einen Vorschlag aufnehmen. Angewandt wird
// nur, was aufgenommen, geprueft und von internal/policy zugelassen ist.
//
// Aufruf:
//
//	pmh-nix detect [--json]
//	pmh-nix propose --flake <pfad> [--target <host>] [--json]
//	pmh-nix check   --proposal <id> [--json]
//	pmh-nix apply   --proposal <id> [--json]
//	pmh-nix generations [--json]
//	pmh-nix rollback --to <generation-id> [--json]
//	pmh-nix [--backend stub|nix] <unterbefehl> [--state <datei>]
//
// Exit-Codes: 0 Erfolg · 1 Politik- oder Pruefungsfehler · 2 Aufruffeher ·
// 125 Backend- oder Startfehler. Fehler gehen nach stderr mit dem Praefix
// "pmh-nix: ".
package main

import "os"

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}
