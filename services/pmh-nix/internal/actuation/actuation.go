// Package actuation definiert den austauschbaren Rand der System-Actuation:
// ein Backend, das den Vertrag Vorschlag -> Pruefung -> Anwendung ->
// Generation -> Rueckweg erfuellt.
//
// Warum ein Interface und nicht eine Umsetzung: NixOS/Nix wird auf diesem
// Rechner NICHT installiert (Weisung "kein nixos installieren lol", siehe
// docs/decisions/hybrid-then-self-build.md Abschnitt 3.1). Damit die Vision
// trotzdem gebaut und getestet werden kann, ist das erste Backend eine
// Attrappe ohne Systemwirkung. Ein echtes Nix-Backend kommt spaeter als
// weitere Umsetzung — Konzept und Schnittstelle aendern sich dafuer nicht.
//
// Kein Backend entscheidet, ob eine Aenderung zulaessig ist. Das entscheidet
// internal/policy. Hier steht nur, WIE eine Aenderung ausgefuehrt wird.
package actuation

import (
	"errors"
	"fmt"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
)

// Feste Fehler des Randes. Sie sind mit errors.Is pruefbar, damit der
// Aufrufer sie auf Exit-Codes abbilden kann, ohne Fehlertexte zu vergleichen.
var (
	// ErrNotAvailable heisst: echte Actuation ist auf diesem Wirt nicht
	// moeglich. Jeder veraendernde Aufruf scheitert damit laut (fail-closed).
	ErrNotAvailable = errors.New("actuation nicht verfuegbar")
	// ErrUnsupported heisst: das Backend kennt diesen Schritt nicht. Es wird
	// nie stillschweigend Erfolg gemeldet.
	ErrUnsupported = errors.New("vom Backend nicht unterstuetzt")
	// ErrNoGeneration heisst: die Zielgeneration existiert nicht.
	ErrNoGeneration = errors.New("generation nicht vorhanden")
)

// Backend ist der austauschbare Rand. Jede Umsetzung muss alle sieben
// Methoden erfuellen.
type Backend interface {
	// Name ist der Kurzname des Backends fuer Meldung und Auswahl.
	Name() string
	// Detect meldet ehrlich, ob echte Actuation auf diesem Wirt moeglich ist,
	// samt Begruendung. Detect veraendert nie etwas.
	Detect() (api.Capability, error)
	// Propose erzeugt aus einer Anfrage den textuellen Diff, den die Aenderung
	// bewirken wuerde. Propose veraendert nie etwas.
	Propose(req api.Proposal) (api.Diff, error)
	// Check prueft einen Diff statisch. Ein Befund traegt Schwere und Text.
	Check(diff api.Diff) ([]api.Finding, error)
	// Apply fuehrt den Diff aus und liefert die entstandene Generation.
	Apply(diff api.Diff) (api.Generation, error)
	// Generations listet die Generationen, neueste zuerst, die aktive
	// markiert.
	Generations() ([]api.Generation, error)
	// Rollback schaltet auf eine vorhandene Generation zurueck. Das ist ein
	// Umschalten, keine Wiederherstellung.
	Rollback(target string) (api.Generation, error)
}

// UnavailableError nennt Backend und Grund, wenn echte Actuation fehlt.
type UnavailableError struct {
	Backend string
	Reason  string
	Op      string
}

func (e *UnavailableError) Error() string {
	return fmt.Sprintf("backend %q verweigert %s: %s: %v",
		e.Backend, e.Op, e.Reason, ErrNotAvailable)
}

// Unwrap bindet den Fehler an ErrNotAvailable, damit errors.Is greift.
func (e *UnavailableError) Unwrap() error { return ErrNotAvailable }
