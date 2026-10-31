// Package stub ist das Vorgabe-Backend von pmh-nix: eine ehrliche Attrappe.
//
// Sie aendert NICHTS am System. Kein Programm wird aufgerufen, keine Datei
// ausserhalb der eigenen Ablage angefasst, keine Distribution umgestellt. Sie
// meldet ausdruecklich, dass echte Actuation auf diesem Wirt nicht moeglich
// ist, und traegt trotzdem den vollen Vertrag Vorschlag -> Pruefung ->
// Anwendung -> Generation -> Rueckweg auf ihrer eigenen Buchfuehrung.
//
// # Warum das kein Selbstbetrug ist
//
// Der Vertrag ist damit pruefbar, ohne dass NixOS oder Nix installiert wird
// (Weisung "kein nixos installieren lol", docs/decisions/hybrid-then-self-build.md
// Abschnitt 3.1). Eine Attrappen-Generation ist ausserdem nie als echter
// Systemwechsel zu verwechseln: sie traegt System "attrappe" und den Vermerk,
// dass nur die Buchfuehrung geschrieben wurde.
//
// # Zwei Betriebsarten — der Unterschied ist Absicht
//
//   - Simulation (Vorgabe): Detect meldet die Wahrheit ("kein Nix"), die
//     Pruefung liefert Hinweise statt Sperren, und der volle Vertrag laeuft
//     durch. Nur so ist propose -> check -> apply -> generations -> rollback
//     auf diesem Wirt ueberhaupt testbar.
//   - Streng (Strict = true): die Pruefung liefert einen Befund der Schwere
//     error, und jede Anwendung wird verweigert. Das ist die Betriebsart, die
//     zeigt, dass die Attrappe fail-closed ist, sobald sie sich fuer
//     unverfuegbar erklaert.
//
// In keiner der beiden Betriebsarten geschieht etwas am System.
package stub

import (
	"fmt"
	"os/exec"
	"regexp"
	"strings"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/state"
)

// Name ist der Kurzname des Backends.
const Name = "stub"

// ReasonNoNix ist die ehrliche Begruendung der Nichtverfuegbarkeit.
const ReasonNoNix = "nicht verfuegbar: kein Nix auf diesem Wirt"

// System ist die Schalterstellung, die eine Attrappen-Generation eintraegt.
// Sie macht jede Attrappen-Generation als solche erkennbar.
const System = "attrappe"

// Note ist der Vermerk an jeder Attrappen-Generation.
const Note = "nichts am System geaendert, nur Buchfuehrung"

// RepoStandIn ist das Repository, das die Attrappe fuer ihre Branches nennt.
// Es wird NICHT angefasst: der Branch ist ein Datensatz, kein Git-Aufruf.
const RepoStandIn = "git+ssh://forgejo/nixos-config.git"

// MaxTargetLength ist die Laenge, die ein Zielname hoechstens haben darf.
const MaxTargetLength = 63

var targetPattern = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$`)

// Backend ist die Attrappe. Sie haelt keine eigene Kopie der Buchfuehrung:
// die Ablage ist die einzige Wahrheit, damit ein zweiter Aufruf denselben
// Stand sieht.
type Backend struct {
	store *state.Store
	// Strict macht die Pruefung sperrend: die Attrappe erklaert sich dann
	// fuer unverfuegbar und verweigert jede Anwendung.
	Strict bool
	// Mode ist die Betriebsart; leer heisst api.ModeLocal.
	Mode api.Mode
	// LookPath ist der Programmsucher; nil heisst exec.LookPath. Die Tests
	// setzen ihn, damit die Antwort nicht von der Umgebung des Pruefrecihners
	// abhaengt.
	LookPath func(string) (string, error)
	// OnActivate wird gerufen, wenn Apply wirklich ausfuehrt. Die Tests setzen
	// ihn, um zu belegen, dass propose NIE aktiviert.
	OnActivate func(diff api.Diff)
}

// New baut die Attrappe in der Vorgabe-Betriebsart Simulation und Mode local.
func New(store *state.Store) *Backend { return &Backend{store: store} }

func (b *Backend) mode() api.Mode {
	if b.Mode == "" {
		return api.ModeLocal
	}
	return b.Mode
}

// Name meldet den Kurznamen.
func (b *Backend) Name() string { return Name }

func (b *Backend) lookPath(name string) (string, error) {
	if b.LookPath != nil {
		return b.LookPath(name)
	}
	return exec.LookPath(name)
}

// Detect meldet ehrlich, dass echte Actuation hier nicht moeglich ist. Detect
// veraendert nichts und ist deshalb auch dann erfolgreich, wenn das Ergebnis
// "nicht verfuegbar" lautet.
//
// Detect sagt die Wahrheit in BEIDEN Betriebsarten: die Attrappe kann nichts
// anwenden, gleich was sie prueft.
func (b *Backend) Detect() (api.Capability, error) {
	cap := api.Capability{
		Backend:   Name,
		Available: false,
		Reason:    ReasonNoNix,
		Details: []string{
			"dieses Backend ist eine Attrappe und aendert nichts am System",
			"kein nix, kein nixos-rebuild, kein nix-env wird aufgerufen",
		},
	}
	for _, prog := range []string{"nix", "nixos-rebuild"} {
		if path, err := b.lookPath(prog); err == nil {
			cap.Details = append(cap.Details, fmt.Sprintf("%s gefunden unter %s, wird von diesem Backend aber nicht aufgerufen", prog, path))
			continue
		}
		cap.Details = append(cap.Details, fmt.Sprintf("%s nicht auf PATH", prog))
	}
	if b.Strict {
		cap.Details = append(cap.Details, "Betriebsart streng: die Pruefung sperrt jede Anwendung")
	} else {
		cap.Details = append(cap.Details, "Betriebsart Simulation: der Vertrag laeuft durch, ohne etwas zu aendern")
	}
	cap.Details = append(cap.Details,
		fmt.Sprintf("Betriebsart der Actuation: %s (local = Flake im Repository mit Pruefbau, remote = Branch im Git-Repository mit switch auf der Zielmaschine)", b.mode()),
		"Branch und Commit sind Datensaetze: die Attrappe ruft kein git auf",
		"Grenze G1: NixOS laeuft nur auf Linux; auf diesem Wirt findet keine Actuation statt")
	return cap, nil
}

// Propose erzeugt den Branch mit dem textuellen Diff, den die Aenderung
// bewirken wuerde — und zeichnet Commit, Diff und Basisgeneration auf.
//
// Propose aktiviert NIE. Es ruft kein nix, kein nixos-rebuild und kein git
// auf; der Branch ist ein Datensatz. Der Aufruf von OnActivate belegt das in
// den Tests.
func (b *Backend) Propose(req api.Proposal) (api.Diff, api.Branch, error) {
	flake := strings.TrimSpace(req.Flake)
	if flake == "" {
		return api.Diff{}, api.Branch{}, fmt.Errorf("propose: --flake fehlt: ohne Flake-Pfad gibt es keine Systembeschreibung")
	}
	target := strings.TrimSpace(req.Target)
	mode := req.Mode
	if mode == "" {
		mode = b.mode()
	}
	diff := api.Diff{
		Mode:   mode,
		Flake:  flake,
		Target: target,
		Files: []api.FileDiff{{
			Path: flake,
			Op:   "modify",
			Hunks: fmt.Sprintf(`--- a/%s
+++ b/%s
@@ Systembeschreibung (Vorschlag, nicht angewandt) @@
+# Ziel: %s
+# Diese Aenderung wurde vorgeschlagen und ist noch nicht wirksam.
+# Dieses Backend ist eine Attrappe und wendet nichts an.
`, flake, flake, orLocal(target)),
		}},
	}
	diff.Hash = state.HashDiff(diff)
	branch := api.Branch{
		Repo: RepoStandIn,
		Push: mode == api.ModeRemote,
	}
	if mode == api.ModeRemote {
		branch.Name = "agent/nixos-" + actuation.Slug(orLocal(target))
		branch.Base = "main"
	} else {
		branch.Name = "local/agent-" + actuation.Slug(orLocal(target))
		branch.Base = "HEAD"
	}
	branch.Commit = actuation.CommitHash(branch.Name, diff.Hash)
	return diff, branch, nil
}

// Check ist der Pruefbau ohne Aktivierung. Befunde tragen Schwere und Text.
//
// In der Betriebsart Simulation sind die Befunde Hinweise: die Attrappe
// berichtet, was sie nicht kann, ohne den Vertrag zu sperren. In der
// Betriebsart streng ist genau dieser Befund ein Fehler und sperrt.
//
// Eine Ausnahme von "Simulation sperrt nicht" gibt es: ein KLARTEXT-GEHEIMNIS
// ist IMMER ein Befund der Schwere error (Betreiber-Vorgabe G4). Der Nix-Store
// ist world-readable; ein Geheimnis dort ist offen, gleich welches Backend
// laeuft.
func (b *Backend) Check(diff api.Diff) ([]api.Finding, error) {
	findings := []api.Finding{}
	if strings.TrimSpace(diff.Flake) == "" {
		findings = append(findings, api.Finding{
			Code:     "flake-missing",
			Severity: api.SeverityError,
			Message:  "kein Flake-Pfad im Diff: ohne Systembeschreibung ist keine Generation bestimmbar",
		})
	} else if !strings.HasSuffix(diff.Flake, ".nix") && !strings.ContainsAny(diff.Flake, `/\`) {
		findings = append(findings, api.Finding{
			Code:     "flake-unbrauchbar",
			Severity: api.SeverityWarning,
			Message:  fmt.Sprintf("Flake-Pfad %q sieht weder wie eine Datei noch wie ein Verzeichnis aus", diff.Flake),
			Location: diff.Flake,
		})
	}

	if t := strings.TrimSpace(diff.Target); t != "" {
		switch {
		case len(t) > MaxTargetLength:
			findings = append(findings, api.Finding{
				Code:     "target-unbrauchbar",
				Severity: api.SeverityWarning,
				Message:  fmt.Sprintf("Zielname %q ist laenger als %d Zeichen", t, MaxTargetLength),
				Location: t,
			})
		case !targetPattern.MatchString(t):
			findings = append(findings, api.Finding{
				Code:     "target-unbrauchbar",
				Severity: api.SeverityError,
				Message:  fmt.Sprintf("Zielname %q ist kein gueltiger Rechnername", t),
				Location: t,
			})
		}
	}

	// G4: Klartext-Geheimnisse sperren immer.
	findings = append(findings, actuation.SecretFindings(diff)...)

	// Die strengeren Kategorien werden benannt. Sie sperren nicht von sich aus,
	// verlangen aber eine ausdrueckliche Freigabe (G3, entschieden in
	// internal/policy).
	categories := actuation.Classify(diff)
	if restricted := restrictedOf(categories); len(restricted) > 0 {
		findings = append(findings, api.Finding{
			Code:     "strengere-kategorie",
			Severity: api.SeverityWarning,
			Message: "der Diff beruehrt eine Kategorie, die eine ausdrueckliche Freigabe verlangt: " +
				actuation.CategoryHint(restricted) + " (Netzwerk, Nutzerrechte, Geheimnisse)",
		})
	}

	// Der Befund, der alles traegt: echte Actuation ist hier nicht moeglich.
	severity := api.SeverityInfo
	message := ReasonNoNix + " — die Attrappe wuerde nichts anwenden; eine Generation aus diesem Lauf ist keine Systemaenderung"
	if b.Strict {
		severity = api.SeverityError
		message = ReasonNoNix + " — Betriebsart streng: die Anwendung wird gesperrt"
	}
	findings = append(findings, api.Finding{
		Code:     "actuation-nicht-verfuegbar",
		Severity: severity,
		Message:  message,
	})
	return findings, nil
}

// Apply fuehrt den Diff aus — in dieser Attrappe heisst das: nichts. Sie
// schreibt ausschliesslich ihre eigene Buchfuehrung fort.
//
// Sie ruft ZUERST die eigene Pruefung auf und verweigert jede Anwendung, die
// einen Befund der Schwere error traegt. Damit bleibt sie auch dann
// fail-closed, wenn die Politik umgangen wuerde.
func (b *Backend) Apply(diff api.Diff) (api.Generation, error) {
	findings, err := b.Check(diff)
	if err != nil {
		return api.Generation{}, fmt.Errorf("apply: Pruefung nicht ausfuehrbar: %w", err)
	}
	if blocking := Blocking(findings); len(blocking) > 0 {
		return api.Generation{}, &actuation.UnavailableError{
			Backend: Name,
			Reason:  fmt.Sprintf("%d Befund(e) der Schwere error, erster: %s", len(blocking), blocking[0].Message),
			Op:      "apply",
		}
	}
	if b.store == nil {
		return api.Generation{}, fmt.Errorf("apply: Attrappe ohne Buchfuehrung gebaut")
	}
	// Ab hier waere die Activation. Der Haken belegt, dass propose hier nie
	// ankommt.
	if b.OnActivate != nil {
		b.OnActivate(diff)
	}
	mode := diff.Mode
	if mode == "" {
		mode = b.mode()
	}
	return b.store.AddGeneration(api.Generation{
		Label:      "Attrappe: " + diff.Flake,
		Mode:       mode,
		ProposalID: diff.ProposalID,
		Target:     diff.Target,
		System:     System,
		Note:       Note,
	})
}

// Generations listet die Generationen, neueste zuerst, die aktive markiert.
func (b *Backend) Generations() ([]api.Generation, error) {
	if b.store == nil {
		return nil, fmt.Errorf("generations: Attrappe ohne Buchfuehrung gebaut")
	}
	return b.store.Generations(), nil
}

// Rollback schaltet auf eine vorhandene Generation zurueck. Das ist ein
// Umschalten in der Buchfuehrung, keine Wiederherstellung von Dateien.
func (b *Backend) Rollback(target string) (api.Generation, error) {
	if b.store == nil {
		return api.Generation{}, fmt.Errorf("rollback: Attrappe ohne Buchfuehrung gebaut")
	}
	id := strings.TrimSpace(target)
	if id == "" {
		return api.Generation{}, fmt.Errorf("rollback: --to fehlt")
	}
	gen, err := b.store.SetCurrent(id)
	if err != nil {
		return api.Generation{}, fmt.Errorf("%w: %v", actuation.ErrNoGeneration, err)
	}
	return gen, nil
}

// Blocking filtert die Befunde, die eine Anwendung sperren.
func Blocking(findings []api.Finding) []api.Finding {
	var out []api.Finding
	for _, f := range findings {
		if f.Severity.Blocks() {
			out = append(out, f)
		}
	}
	return out
}

func orLocal(target string) string {
	if strings.TrimSpace(target) == "" {
		return "lokaler Wirt"
	}
	return target
}

// restrictedOf liefert die Kategorien, die eine ausdrueckliche Freigabe
// verlangen, in fester Reihenfolge.
func restrictedOf(categories []api.Category) []api.Category {
	var out []api.Category
	for _, want := range []api.Category{api.CategorySecrets, api.CategoryUsers, api.CategoryNetwork} {
		for _, c := range categories {
			if c == want {
				out = append(out, c)
			}
		}
	}
	return out
}

// IsSimulatedGeneration meldet, ob eine Generation aus der Attrappe stammt.
// Sie ist damit nie mit einem echten Systemwechsel zu verwechseln.
func IsSimulatedGeneration(g api.Generation) bool { return g.System == System }
