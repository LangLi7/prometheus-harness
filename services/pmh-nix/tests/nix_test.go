package tests

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation/nix"
)

// TestNixDetectReportsMissingToolchain prueft, dass das echte Backend den
// fehlenden Werkzeugkasten ehrlich meldet, ohne etwas zu tun. Detect ist auch
// bei "nicht verfuegbar" ein gelungener Aufruf: es ist die Wahrheit.
func TestNixDetectReportsMissingToolchain(t *testing.T) {
	backend := nix.New()
	backend.LookPath = missingToolchain

	cap, err := backend.Detect()
	if err != nil {
		t.Fatalf("detect scheiterte: %v", err)
	}
	if cap.Available {
		t.Fatal("das Backend meldet sich als verfuegbar, obwohl kein nix existiert")
	}
	if cap.Backend != nix.Name {
		t.Fatalf("Backend ist %q, erwartet %q", cap.Backend, nix.Name)
	}
	mustContain(t, cap.Reason, nix.ReasonNoNix)
	mustContain(t, cap.Reason, "nixos-rebuild")
}

// TestNixRefusesEveryMutatingCallFailClosed ist der Kern des echten Backends:
// ohne nix auf dem Suchpfad scheitert JEDER Aufruf laut. Kein Aufruf meldet
// Erfolg, und es entsteht nie eine Generation.
func TestNixRefusesEveryMutatingCallFailClosed(t *testing.T) {
	backend := nix.New()
	backend.LookPath = missingToolchain
	// Wenn dieses Backend je ein Programm startet, faellt es hier auf.
	backend.Run = func(_ context.Context, name string, args ...string) (string, string, error) {
		t.Fatalf("das echte Backend hat %s %v gestartet, obwohl kein nix existiert", name, args)
		return "", "", nil
	}

	proposal := api.Proposal{ID: "prop-0001", Flake: constFlake, Target: "node1"}
	diff := api.Diff{ProposalID: "prop-0001", Flake: constFlake, Target: "node1"}

	calls := []struct {
		name string
		run  func() error
	}{
		{"propose", func() error { _, err := backend.Propose(proposal); return err }},
		{"check", func() error { _, err := backend.Check(diff); return err }},
		{"apply", func() error { _, err := backend.Apply(diff); return err }},
		{"generations", func() error { _, err := backend.Generations(); return err }},
		{"rollback", func() error { _, err := backend.Rollback("gen-0001"); return err }},
	}
	for _, call := range calls {
		err := call.run()
		if err == nil {
			t.Fatalf("%s meldete Erfolg, obwohl kein nix existiert — fail-closed ist verletzt", call.name)
		}
		if !errors.Is(err, actuation.ErrNotAvailable) {
			t.Fatalf("%s scheiterte, aber nicht mit ErrNotAvailable: %v", call.name, err)
		}
		mustContain(t, err.Error(), call.name)
	}
}

// TestNixApplyNeverReturnsAGeneration prueft, dass niemand eine Generation
// erfindet: ohne Werkzeugkasten gibt es keine.
func TestNixApplyNeverReturnsAGeneration(t *testing.T) {
	backend := nix.New()
	backend.LookPath = missingToolchain

	gen, err := backend.Apply(api.Diff{Flake: constFlake})
	if err == nil {
		t.Fatal("apply meldete Erfolg, obwohl kein nix existiert")
	}
	if gen.ID != "" {
		t.Fatalf("apply lieferte eine Generation (%q), obwohl nichts angewandt wurde", gen.ID)
	}
}

// TestNixNeverStartsAProcessOnThisHost prueft gegen die Umgebung dieses
// Rechners: solange nix fehlt, wird kein Programm gestartet. Findet der Test
// doch einen Werkzeugkasten, meldet er das und prueft den unterstuetzten Weg.
func TestNixNeverStartsAProcessOnThisHost(t *testing.T) {
	backend := nix.New()
	backend.Run = func(_ context.Context, name string, args ...string) (string, string, error) {
		t.Fatalf("es wurde %s %v gestartet — auf diesem Wirt darf das nicht geschehen", name, args)
		return "", "", nil
	}
	cap, err := backend.Detect()
	if err != nil {
		t.Fatalf("detect scheiterte: %v", err)
	}
	if cap.Available {
		t.Skip("nix ist auf diesem Wirt vorhanden; der fail-closed-Fall wird anderswo geprueft")
	}
	if _, err := backend.Generations(); !errors.Is(err, actuation.ErrNotAvailable) {
		t.Fatalf("generations scheiterte nicht mit ErrNotAvailable: %v", err)
	}
}

// TestNixUnsupportedPathsAreTested prueft die Wege, die auch mit vorhandenem
// Werkzeugkasten noch nicht gebaut sind: sie melden ausdruecklich
// "nicht unterstuetzt" und niemals Erfolg.
func TestNixUnsupportedPathsAreTested(t *testing.T) {
	backend := nix.New()
	backend.LookPath = func(name string) (string, error) { return "/nix/var/nix/profiles/" + name, nil }

	cap, err := backend.Detect()
	if err != nil {
		t.Fatalf("detect scheiterte: %v", err)
	}
	if !cap.Available {
		t.Fatalf("mit vorhandenem Werkzeugkasten erwartet verfuegbar, bekommen: %+v", cap)
	}

	calls := []struct {
		name string
		run  func() error
	}{
		{"propose", func() error { _, err := backend.Propose(api.Proposal{Flake: constFlake}); return err }},
		{"check", func() error { _, err := backend.Check(api.Diff{Flake: constFlake}); return err }},
		{"apply", func() error { _, err := backend.Apply(api.Diff{Flake: constFlake}); return err }},
		{"generations", func() error { _, err := backend.Generations(); return err }},
		{"rollback", func() error { _, err := backend.Rollback("gen-0001"); return err }},
	}
	for _, call := range calls {
		err := call.run()
		if err == nil {
			t.Fatalf("%s meldete Erfolg, obwohl der Weg nicht gebaut ist", call.name)
		}
		if !errors.Is(err, actuation.ErrUnsupported) {
			t.Fatalf("%s scheiterte, aber nicht mit ErrUnsupported: %v", call.name, err)
		}
	}
}

// TestNixBackendThroughTheServiceFailsClosed prueft das echte Backend hinter
// dem Dienst: die Anwendung kommt nicht durch, und es entsteht keine
// Generation.
func TestNixBackendThroughTheServiceFailsClosed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newNix(t, path)

	_, err := svc.Propose(constFlake, "node1", "")
	if err == nil {
		t.Fatal("das echte Backend nahm einen Vorschlag an, obwohl kein nix existiert")
	}
	if !errors.Is(err, actuation.ErrNotAvailable) {
		t.Fatalf("der Fehler ist nicht als Nichtverfuegbarkeit erkennbar: %v", err)
	}

	gens, err := svc.Generations()
	if err == nil {
		t.Fatalf("generations meldete Erfolg: %+v", gens)
	} else if !errors.Is(err, actuation.ErrNotAvailable) {
		t.Fatalf("generations scheiterte aus anderem Grund: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("die Ablage entstand, obwohl nichts geschah: %v", err)
	}
}

// missingToolchain ahmt einen Wirt ohne nix nach.
func missingToolchain(string) (string, error) {
	return "", os.ErrNotExist
}

// TestNixBackendNameMatchesFlag prueft, dass der Name des Backends der
// Auswahl auf der Kommandozeile entspricht.
func TestNixBackendNameMatchesFlag(t *testing.T) {
	if nix.Name != "nix" {
		t.Fatalf("der Backend-Name ist %q, erwartet \"nix\"", nix.Name)
	}
	if got := nix.New().Name(); got != nix.Name {
		t.Fatalf("Name() liefert %q, erwartet %q", got, nix.Name)
	}
	if !strings.Contains(nix.ReasonNoNix, "kein nix") {
		t.Fatalf("die Begruendung nennt das fehlende Programm nicht: %q", nix.ReasonNoNix)
	}
}
