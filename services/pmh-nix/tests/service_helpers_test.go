// Package tests prueft den Vertrag des Dienstes pmh-nix von aussen: die
// Sicherheitsinvariante, den vollen Umlauf der Attrappe, die Ablage und die
// Kommandozeile.
//
// Die Tests liegen bewusst ausserhalb der Pakete: geprueft wird, was der
// Dienst nach aussen zusagt. Der wichtigste Test ist
// TestApplyRejectsUncheckedProposal — das Modell empfiehlt, die Policy
// entscheidet.
package tests

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation/nix"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation/stub"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/service"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/state"
)

// constFlake ist der Flake-Pfad, mit dem die meisten Tests arbeiten.
const constFlake = "/etc/nixos/flake.nix"

// open macht eine Buchfuehrung in einem Testverzeichnis auf.
func open(t *testing.T, path string) *state.Store {
	t.Helper()
	store, err := state.Open(path)
	if err != nil {
		t.Fatalf("Buchfuehrung %s nicht zu oeffnen: %v", path, err)
	}
	return store
}

// newStub baut den Dienst mit der Attrappe in der Vorgabe-Betriebsart
// Simulation. Beide Teile teilen sich EINE Buchfuehrung: sonst arbeiteten
// Politik und Backend auf verschiedenen Staenden.
func newStub(t *testing.T, path string) *service.Service {
	t.Helper()
	store := open(t, path)
	return newStubService(t, store, stub.New(store))
}

// newStubService baut den Dienst auf einer uebergebenen Buchfuehrung, damit
// ein Test denselben Stand zweimal oeffnen kann.
func newStubService(t *testing.T, store *state.Store, b actuation.Backend) *service.Service {
	t.Helper()
	svc, err := service.New(store, b)
	if err != nil {
		t.Fatalf("Dienst nicht baubar: %v", err)
	}
	return svc
}

// newStrictStub baut die Attrappe in der Betriebsart streng: ihre Pruefung
// sperrt, also verweigert jede Anwendung.
func newStrictStub(t *testing.T, path string) *service.Service {
	t.Helper()
	store := open(t, path)
	backend := stub.New(store)
	backend.Strict = true
	return newStubService(t, store, backend)
}

// newNix baut das echte Backend, ohne dass nix installiert waere.
func newNix(t *testing.T, path string) *service.Service {
	t.Helper()
	store := open(t, path)
	return newStubService(t, store, nix.New())
}

// propose nimmt einen Vorschlag auf und bricht ab, wenn das scheitert.
func propose(t *testing.T, svc *service.Service, flake, target string) service.ProposeResult {
	t.Helper()
	res, err := svc.Propose(flake, target, "Testvorschlag")
	if err != nil {
		t.Fatalf("propose(%q, %q) scheiterte: %v", flake, target, err)
	}
	if res.Proposal.ID == "" {
		t.Fatal("propose lieferte keine Kennung")
	}
	return res
}

// check prueft und bricht ab, wenn das scheitert.
func check(t *testing.T, svc *service.Service, id string) service.CheckResult {
	t.Helper()
	res, err := svc.Check(id)
	if err != nil {
		t.Fatalf("check(%q) scheiterte: %v", id, err)
	}
	return res
}

// decode liest ein JSON-Objekt in ein Ziel.
func decode(t *testing.T, raw []byte, into any) {
	t.Helper()
	if err := json.Unmarshal(raw, into); err != nil {
		t.Fatalf("Antwort ist kein JSON-Objekt: %v\n%s", err, raw)
	}
}

// hasReason prueft, ob eine Ablehnung einen Grund traegt.
func hasReason(reasons []string, want string) bool {
	for _, r := range reasons {
		if r == want {
			return true
		}
	}
	return false
}

// mustContain prueft, ob ein Textstueck vorkommt, und nennt sonst den Text.
func mustContain(t *testing.T, haystack, needle string) {
	t.Helper()
	if !strings.Contains(haystack, needle) {
		t.Fatalf("erwartet %q in:\n%s", needle, haystack)
	}
}

// countSeverity zaehlt Befunde einer Schwere.
func countSeverity(findings []api.Finding, sev api.Severity) int {
	n := 0
	for _, f := range findings {
		if f.Severity == sev {
			n++
		}
	}
	return n
}

// writeFile legt eine Datei samt Elternordnern an. Die Tests setzen damit
// eine von Hand gebaute Ablage, um zu pruefen, dass eine gefaelschte Anfrage
// die Politik nicht umgeht.
func writeFile(path string, content []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, content, 0o644)
}
