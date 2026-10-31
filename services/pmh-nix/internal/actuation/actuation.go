// Package actuation definiert den austauschbaren Rand der System-Actuation:
// ein Backend, das den Vertrag Vorschlag -> Pruefbau -> Freigabe -> Anwendung
// -> Generation -> Rueckweg erfuellt.
//
// Warum ein Interface und nicht eine Umsetzung: NixOS/Nix wird auf diesem
// Rechner NICHT installiert (Weisung "kein nixos installieren lol", siehe
// docs/decisions/hybrid-then-self-build.md Abschnitt 3.1). Damit die Vision
// trotzdem gebaut und getestet werden kann, ist das erste Backend eine
// Attrappe ohne Systemwirkung. Ein echtes Nix-Backend kommt spaeter als
// weitere Umsetzung — Konzept und Schnittstelle aendern sich dafuer nicht.
//
// Die Betriebsart (api.Mode) ist KEIN zweites Interface: local und remote
// erfuellen denselben Vertrag. Was sie unterscheidet, ist der Ort, an dem
// gebaut und geschaltet wird, nicht die Form des Aufrufs.
//
// Kein Backend entscheidet, ob eine Aenderung zulaessig ist. Das entscheidet
// internal/policy. Hier steht nur, WIE eine Aenderung ausgefuehrt wird — und
// was dabei inhaltlich auffaellt (Kategorien, Klartext-Geheimnisse).
package actuation

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"path"
	"regexp"
	"strings"

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
// Methoden erfuellen — in beiden Betriebsarten (local und remote).
type Backend interface {
	// Name ist der Kurzname des Backends fuer Meldung und Auswahl.
	Name() string
	// Detect meldet ehrlich, ob echte Actuation auf diesem Wirt moeglich ist,
	// samt Begruendung. Detect veraendert nie etwas.
	Detect() (api.Capability, error)
	// Propose erzeugt aus einer Anfrage einen BRANCH MIT DIFF und zeichnet
	// Commit und Basisgeneration auf. Propose aktiviert NIE und beruehrt das
	// System nie.
	Propose(req api.Proposal) (api.Diff, api.Branch, error)
	// Check ist der Pruefbau ohne Aktivierung (build/test). Ein Befund traegt
	// Schwere und Text.
	Check(diff api.Diff) ([]api.Finding, error)
	// Apply ist die Activation: sie fuehrt den Diff aus und liefert die
	// entstandene Generation.
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

// ---------------------------------------------------------------------------
// Sachkategorien — die Grundlage der strengeren Policy-Stufe
// ---------------------------------------------------------------------------

// Kategorien als Text, damit ein Backend sie ohne Import von api nennen kann.
const (
	CategoryGeneral = "general"
	CategoryNetwork = "network"
	CategoryUsers   = "users"
	CategorySecrets = "secrets"
)

// categoryRule ordnet einer Datei eine Sachkategorie zu. Die Regeln sind
// geordnet: die erste passende gewinnt. Neue Kategorien kommen hier hinzu,
// nicht in eine Fallunterscheidung.
type categoryRule struct {
	category     api.Category
	pathContains []string
	nameContains []string
}

var categoryRules = []categoryRule{
	{
		category:     api.CategorySecrets,
		pathContains: []string{"/secrets/", "/secret/", "secrets.nix", "secret.nix", "sops", "agenix"},
		nameContains: []string{"secret", "sops", "agenix", "keyfile"},
	},
	{
		category:     api.CategoryUsers,
		pathContains: []string{"/users/", "/user/", "users.nix", "/home/", "sudoers"},
		nameContains: []string{"users", "user", "accounts", "sudoers"},
	},
	{
		category:     api.CategoryNetwork,
		pathContains: []string{"/network/", "/networking/", "networking.nix", "network.nix", "/firewall/"},
		nameContains: []string{"network", "networking", "firewall", "tailscale", "wireguard"},
	},
}

// Classify bestimmt die Sachkategorien eines Diffs aus seinen Pfaden. Es ist
// eine reine Funktion ueber den Text des Diffs; sie liest keine Anfrage.
func Classify(d api.Diff) []api.Category {
	var out []api.Category
	for _, f := range d.Files {
		c := classifyPath(f.Path, f.Hunks)
		if !containsCategory(out, c) {
			out = append(out, c)
		}
	}
	if len(out) == 0 {
		out = append(out, api.CategoryGeneral)
	}
	return out
}

func classifyPath(p, hunks string) api.Category {
	lower := strings.ToLower(p)
	base := strings.ToLower(path.Base(p))
	baseNoExt := strings.TrimSuffix(base, ".nix")

	for _, rule := range categoryRules {
		for _, needle := range rule.pathContains {
			if strings.Contains(lower, needle) {
				return rule.category
			}
		}
		for _, needle := range rule.nameContains {
			if strings.Contains(baseNoExt, needle) {
				return rule.category
			}
		}
	}
	// Ein Diff, der einen Geheimnis-Wert einfuegt, ist eine Geheimnis-Aenderung,
	// auch wenn der Pfad allgemein aussieht.
	if PlaintextSecretIn(hunks) != "" {
		return api.CategorySecrets
	}
	return api.CategoryGeneral
}

func containsCategory(list []api.Category, want api.Category) bool {
	for _, c := range list {
		if c == want {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Klartext-Geheimnisse — Betreiber-Vorgabe G4
// ---------------------------------------------------------------------------

// SecretKeyPattern nennt die Bezeichner, die auf ein Geheimnis hindeuten.
//
// ABSICHTLICH ohne Wortgrenze am Anfang: Bezeichner wie "adminPassword" oder
// "dbSecretKey" sind der Normalfall in einer NixOS-Konfiguration. Eine
// Wortgrenze wuerde genau die uebersehen, die am haeufigsten vorkommen.
var SecretKeyPattern = regexp.MustCompile(`(?i)(password|passwd|passphrase|secret|token|api[_-]?key|auth[_-]?key|private[_-]?key|psk|credential)`)

// secretValuePattern erkennt einen ZUGEORDNETEN Literalwert: key = "…".
var secretValuePattern = regexp.MustCompile(`=\s*"([^"\n]{6,})"`)

// SecretRefPattern erkennt den VORGESEHENEN Weg: Geheimnisse kommen aus
// sops-nix oder agenix, nicht aus der Konfiguration. Ein Verweis ist kein
// Befund — sonst waere der richtige Weg der bestrafte.
var SecretRefPattern = regexp.MustCompile(`(?i)(sops|agenix|\.age\b|secrets/|config\.sops|getEnv\()`)

var pemHeaderPattern = regexp.MustCompile(`-----BEGIN [A-Z ]*PRIVATE KEY-----`)

var literalSecretPattern = regexp.MustCompile(`(?i)(gh[pousr]_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})`)

// PlaintextSecretIn sucht in einer Aenderung nach einem Klartext-Geheimnis und
// liefert die erste verdaechtige Zeile, sonst "".
//
// Geprueft werden nur HINZUGEFUEGTE Zeilen (fuehrendes "+") und keine
// Kommentare: was entfernt wird, ist kein neues Geheimnis, und ein Kommentar
// ist keine Zuweisung.
//
// Der Nix-Store ist world-readable; ein Geheimnis dort ist damit offen.
// Vorgesehen sind sops-nix oder agenix.
func PlaintextSecretIn(hunks string) string {
	for _, line := range strings.Split(hunks, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "+") || strings.HasPrefix(trimmed, "++") {
			continue
		}
		added := strings.TrimSpace(strings.TrimPrefix(trimmed, "+"))
		if added == "" || strings.HasPrefix(added, "#") {
			continue
		}
		// Der richtige Weg ist kein Befund.
		if SecretRefPattern.MatchString(added) {
			continue
		}
		if pemHeaderPattern.MatchString(added) || literalSecretPattern.MatchString(added) {
			return added
		}
		if SecretKeyPattern.MatchString(added) {
			if m := secretValuePattern.FindStringSubmatch(added); m != nil && !SecretRefPattern.MatchString(m[1]) {
				return added
			}
		}
	}
	return ""
}

// SecretFindings erzeugt die Pruefbefunde zu Klartext-Geheimnissen.
//
// Ein Klartext-Geheimnis in der Konfiguration ist ein Befund der Schwere ERROR,
// kein Hinweis: er sperrt die Anwendung (Betreiber-Vorgabe G4).
func SecretFindings(d api.Diff) []api.Finding {
	var out []api.Finding
	for _, f := range d.Files {
		if line := PlaintextSecretIn(f.Hunks); line != "" {
			out = append(out, api.Finding{
				Code:     "secret-im-klartext",
				Severity: api.SeverityError,
				Message: "Klartext-Geheimnis in der Konfiguration: der Nix-Store ist world-readable. " +
					"Geheimnisse gehoeren zu sops-nix oder agenix, nicht in die Konfiguration",
				Location: f.Path,
			})
		}
	}
	return out
}

// CategoryHint nennt die strengeren Kategorien eines Diffs als Text. Die
// Backends nutzen das fuer ihre Pruefbefunde.
func CategoryHint(categories []api.Category) string {
	var parts []string
	for _, c := range categories {
		parts = append(parts, string(c))
	}
	return strings.Join(parts, ", ")
}

// ---------------------------------------------------------------------------
// Kleine Hilfen, die beide Backends brauchen
// ---------------------------------------------------------------------------

// Slug macht aus einem Namen ein branch-taugliches Textstueck.
func Slug(s string) string {
	var b strings.Builder
	lastDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		default:
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "unbenannt"
	}
	return out
}

// CommitHash bildet die Kennung eines vorgeschlagenen Commits. Es ist eine
// Kennung, kein Git-Objekt: die Backends rufen kein git auf.
func CommitHash(branch, diffHash string) string {
	sum := sha256.Sum256([]byte("branch\x00" + branch + "\x00" + diffHash))
	return "commit:" + hex.EncodeToString(sum[:])[:12]
}
