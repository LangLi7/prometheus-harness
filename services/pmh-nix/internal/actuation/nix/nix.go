// Package nix ist das echte Backend von pmh-nix: es ruft den Nix-Werkzeugkasten
// auf, statt selbst Nix zu sein.
//
// # Zustand dieses Pakets — ehrlich
//
// Dieses Backend ist ein duenner, dokumentierter Rumpf. Es ist gebaut und
// geprueft, aber auf diesem Wirt NICHT ausfuehrbar: Nix und NixOS sind nicht
// installiert und werden auch nicht installiert (Weisung "kein nixos
// installieren lol", docs/decisions/hybrid-then-self-build.md Abschnitt 3.1).
//
// # Fail-closed
//
// Ist `nix` nicht auf dem Suchpfad, scheitert JEDER Aufruf laut: mit
// actuation.ErrNotAvailable, einer Begruendung im Text und — ueber die
// CLI — mit dem Exit-Code 125. Es gibt keinen Pfad, auf dem dieses Backend
// stillschweigend Erfolg meldet, ohne etwas getan zu haben. Insbesondere
// liefert Apply niemals eine Generation, die es nicht erzeugt hat.
//
// # Was ein spaeterer Ausbau tun muss
//
//   - Propose: `nixos-rebuild build --flake <flake>#<target> --dry-run` und
//     daraus einen echten Diff ableiten (heute: Verweigerung).
//   - Check: `nix flake check` plus Bewertung der Ausgabe.
//   - Apply: `nixos-rebuild switch --flake <flake>#<target>`; die entstehende
//     Generation ist aus `nix-env --list-generations --profile
//     /nix/var/nix/profiles/system` abzulesen, nicht zu erfinden.
//   - Generations: dieselbe Liste, neueste zuerst.
//   - Rollback: `nixos-rebuild switch --rollback` oder das Umschalten auf eine
//     benannte Generation.
//
// Bis dahin ist jede dieser Stellen eine Verweigerung mit Begruendung.
package nix

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation"
)

// Name ist der Kurzname des Backends.
const Name = "nix"

// DefaultTimeout begrenzt jeden Aufruf des Nix-Werkzeugkastens. Ein
// Systemwechsel ohne Frist waere ein haengender Aufruf ohne Ende.
const DefaultTimeout = 10 * time.Minute

// ReasonNoNix ist die Begruendung, wenn der Werkzeugkasten fehlt.
const ReasonNoNix = "nicht verfuegbar: kein nix auf dem Suchpfad (PATH)"

// Backend ruft den Nix-Werkzeugkasten auf.
type Backend struct {
	// LookPath ist der Programmsucher; nil heisst exec.LookPath.
	LookPath func(string) (string, error)
	// Run fuehrt ein Programm aus und liefert Ausgabe und Fehler; nil heisst
	// der Standardweg ueber os/exec. Die Tests setzen ihn, damit kein
	// Programm wirklich gestartet wird.
	Run func(ctx context.Context, name string, args ...string) (stdout, stderr string, err error)
	// Timeout begrenzt jeden Aufruf; 0 heisst DefaultTimeout.
	Timeout time.Duration
	// Flake ist der Vorgabe-Flake, wenn ein Vorschlag keinen nennt.
	Flake string
}

// New baut das Backend mit den Standardwegen.
func New() *Backend { return &Backend{} }

// Name meldet den Kurznamen.
func (b *Backend) Name() string { return Name }

func (b *Backend) lookPath(name string) (string, error) {
	if b.LookPath != nil {
		return b.LookPath(name)
	}
	return exec.LookPath(name)
}

func (b *Backend) timeout() time.Duration {
	if b.Timeout > 0 {
		return b.Timeout
	}
	return DefaultTimeout
}

func (b *Backend) run(ctx context.Context, name string, args ...string) (string, string, error) {
	if b.Run != nil {
		return b.Run(ctx, name, args...)
	}
	ctx, cancel := context.WithTimeout(ctx, b.timeout())
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	err := cmd.Run()
	return out.String(), errBuf.String(), err
}

// Detect prueft, ob der Nix-Werkzeugkasten vorhanden ist. Detect veraendert
// nichts und ist deshalb auch dann erfolgreich, wenn das Ergebnis "nicht
// verfuegbar" lautet.
func (b *Backend) Detect() (api.Capability, error) {
	cap := api.Capability{
		Backend:   Name,
		Available: false,
		Reason:    ReasonNoNix,
	}
	var missing []string
	for _, prog := range []string{"nix", "nixos-rebuild"} {
		path, err := b.lookPath(prog)
		if err != nil {
			missing = append(missing, prog)
			continue
		}
		cap.Details = append(cap.Details, fmt.Sprintf("%s gefunden unter %s", prog, path))
		if prog == "nix" {
			cap.Executable = path
		}
	}
	if len(missing) > 0 {
		cap.Reason = fmt.Sprintf("%s (fehlend: %s)", ReasonNoNix, strings.Join(missing, ", "))
		cap.Details = append(cap.Details, missing...)
		return cap, nil
	}
	cap.Available = true
	cap.Reason = "nix und nixos-rebuild gefunden; Actuation waere moeglich"
	return cap, nil
}

// unavailable liefert den fail-closed Fehler samt Begruendung.
func (b *Backend) unavailable(op string) error {
	cap, err := b.Detect()
	if err != nil {
		return fmt.Errorf("backend %q verweigert %s: Erkennung fehlgeschlagen: %w", Name, op, err)
	}
	if cap.Available {
		return nil
	}
	return &actuation.UnavailableError{Backend: Name, Reason: cap.Reason, Op: op}
}

// Propose verweigert, solange kein Nix vorhanden ist. Ein echter Diff kann
// ohne Werkzeugkasten nicht ehrlich berechnet werden, und ein erfundener Diff
// waere schlimmer als keiner.
func (b *Backend) Propose(req api.Proposal) (api.Diff, error) {
	if err := b.unavailable("propose"); err != nil {
		return api.Diff{}, err
	}
	return api.Diff{}, fmt.Errorf("propose: %w (geplant: nixos-rebuild build --dry-run --flake %s#%s)",
		actuation.ErrUnsupported, req.Flake, req.Target)
}

// Check verweigert, solange kein Nix vorhanden ist.
func (b *Backend) Check(diff api.Diff) ([]api.Finding, error) {
	if err := b.unavailable("check"); err != nil {
		return nil, err
	}
	return nil, fmt.Errorf("check: %w (geplant: nix flake check)", actuation.ErrUnsupported)
}

// Apply verweigert, solange kein Nix vorhanden ist. Es wird ausdruecklich kein
// nixos-rebuild switch ausgeloest.
func (b *Backend) Apply(diff api.Diff) (api.Generation, error) {
	if err := b.unavailable("apply"); err != nil {
		return api.Generation{}, err
	}
	return api.Generation{}, fmt.Errorf("apply: %w (geplant: nixos-rebuild switch --flake %s#%s)",
		actuation.ErrUnsupported, diff.Flake, diff.Target)
}

// Generations verweigert, solange kein Nix vorhanden ist: eine erfundene
// Generationenliste waere eine Luege ueber den Systemzustand.
func (b *Backend) Generations() ([]api.Generation, error) {
	if err := b.unavailable("generations"); err != nil {
		return nil, err
	}
	return nil, fmt.Errorf("generations: %w (geplant: nix-env --list-generations --profile /nix/var/nix/profiles/system)",
		actuation.ErrUnsupported)
}

// Rollback verweigert, solange kein Nix vorhanden ist.
func (b *Backend) Rollback(target string) (api.Generation, error) {
	if err := b.unavailable("rollback"); err != nil {
		return api.Generation{}, err
	}
	return api.Generation{}, fmt.Errorf("rollback nach %q: %w (geplant: nixos-rebuild switch --rollback)",
		target, actuation.ErrUnsupported)
}

// IsUnavailable prueft, ob ein Fehler die Nichtverfuegbarkeit meldet.
func IsUnavailable(err error) bool { return errors.Is(err, actuation.ErrNotAvailable) }
