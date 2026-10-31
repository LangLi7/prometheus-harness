// Package api haelt die uebertragenen Typen des Dienstes pmh-nix: Anfrage und
// Antwort, Diff, Befund, Generation und Faehigkeitsmeldung.
//
// Der Dienst steht hinter einer Prozessgrenze (docs/concept.md, Regel 4:
// "Sprachgrenzen sind Dienstgrenzen"). Dieses Paket ist deshalb die
// Veroeffentlichung: nur diese Typen verlassen den Dienst, und nur ueber JSON.
// Nichts hier importiert Interna des TypeScript-Kerns.
package api

import (
	"strings"
	"time"
)

// Schema ist die Fassung des ueber tragenen Formats. Sie wird mit jeder
// Antwort ausgeliefert, damit ein Aufrufer die Fassung pruefen kann, statt sie
// zu raten.
//
// Fassung 2 ergaenzt: Betriebsart (Mode), Branch-Aufzeichnung, Kategorien und
// die ausdrueckliche Freigabe (Approval). Ein Vorschlag ist seither ausdruecklich
// ein BRANCH MIT DIFF und keine angewandte Aenderung.
const Schema = 2

// Mode ist die Betriebsart der Actuation.
type Mode string

const (
	// ModeLocal ist der Start: Flake im Repository, Diff und Pruefbau
	// (build/test) ohne Aktivierung. Die Vorgabe.
	ModeLocal Mode = "local"
	// ModeRemote ist das Ziel: Branch im Git-Repository, Pruefbau auf der
	// Zielmaschine, Freigabe, dann switch; Rueckweg ueber die Generation.
	ModeRemote Mode = "remote"
)

// ParseMode liest eine Betriebsart; der leere Wert ist die Vorgabe local.
func ParseMode(s string) (Mode, bool) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "", string(ModeLocal):
		return ModeLocal, true
	case string(ModeRemote):
		return ModeRemote, true
	default:
		return "", false
	}
}

// Category ist eine Sachkategorie eines Diffs. Sie entscheidet, welche
// Politik-Stufe greift: network, users und secrets sind strenger als der
// allgemeine Fall.
type Category string

const (
	// CategoryGeneral ist der allgemeine Fall: Pakete, Dienste, Einstellungen.
	CategoryGeneral Category = "general"
	// CategoryNetwork beruehrt networking.* — Netzwerk und Firewall.
	CategoryNetwork Category = "network"
	// CategoryUsers beruehrt users.* — Nutzer und Rechte.
	CategoryUsers Category = "users"
	// CategorySecrets beruehrt Geheimnisse (Passwoerter, Schluessel, Token).
	CategorySecrets Category = "secrets"
)

// Restricted gilt fuer die drei Kategorien, die eine ausdrueckliche Freigabe
// zwingend brauchen (Betreiber-Vorgabe G3: Netzwerk, Nutzerrechte und Secrets
// darf der Agent nicht ungeprueft aendern).
func (c Category) Restricted() bool {
	switch c {
	case CategoryNetwork, CategoryUsers, CategorySecrets:
		return true
	}
	return false
}

// Severity ist die Schwere eines Befunds aus Check.
type Severity string

const (
	// SeverityInfo ist ein Hinweis ohne Sperrwirkung.
	SeverityInfo Severity = "info"
	// SeverityWarning ist ein Risiko ohne Sperrwirkung.
	SeverityWarning Severity = "warning"
	// SeverityError sperrt die Anwendung: Apply verweigert den Dienst.
	SeverityError Severity = "error"
)

// Blocks berichtet, ob diese Schwere die Anwendung sperrt.
func (s Severity) Blocks() bool { return s == SeverityError }

// Capability meldet, ob echte Actuation auf diesem Wirt moeglich ist, mit
// Begruendung. Sie ist die ehrliche Antwort von Detect.
type Capability struct {
	// Backend ist der Name des antwortenden Backends.
	Backend string `json:"backend"`
	// Available ist genau dann wahr, wenn echte Actuation moeglich ist.
	// Ein Attrappen-Backend meldet hier immer false.
	Available bool `json:"available"`
	// Reason nennt den Grund — auch dann, wenn Available wahr ist.
	Reason string `json:"reason"`
	// Executable ist der gefundene Programmpfad, sonst leer.
	Executable string `json:"executable,omitempty"`
	// Details sind weitere Messwerte, etwa gesuchte Programme.
	Details []string `json:"details,omitempty"`
}

// Branch ist die Aufzeichnung des Vorschlags im Git-Repository. Der Agent
// aendert NIE den aktiven Stand: er legt einen Branch mit einem Commit an
// (Betreiber-Vorgabe G5).
type Branch struct {
	// Name ist der Branch, auf dem der Vorschlag liegt.
	Name string `json:"name"`
	// Repo ist das Repository, in dem der Branch liegt.
	Repo string `json:"repo,omitempty"`
	// Commit ist die Kennung des Commits auf dem Branch.
	Commit string `json:"commit"`
	// Base ist der Commit, von dem abgezweigt wurde.
	Base string `json:"base,omitempty"`
	// Push ist wahr, wenn der Branch zu einem entfernten Repository gehoert
	// (Betriebsart remote).
	Push bool `json:"push"`
}

// Proposal ist eine vorgeschlagene Aenderung: ein BRANCH MIT DIFF, nicht eine
// angewandte Aenderung. Ein Modell oder ein fremder Aufrufer kann genau das
// hier erzeugen. Mehr nicht.
//
// Es gibt absichtlich KEIN Feld, das eine Anwendung erlaubt — kein "checked",
// kein "safe", kein "approved", kein "policy_ok". Wer Apply ausloesen will,
// braucht einen Vorschlag, der geprueft UND ausdruecklich freigegeben ist; der
// Vorschlag selbst kann das nicht behaupten.
type Proposal struct {
	// ID wird vom Dienst vergeben, nicht vom Aufrufer.
	ID string `json:"id"`
	// Mode ist die Betriebsart, in der der Vorschlag entstanden ist.
	Mode Mode `json:"mode"`
	// Flake ist der Pfad zum Nix-Flake, der die Systemkonfiguration beschreibt.
	Flake string `json:"flake"`
	// Target ist der Zielrechner, leer heisst der lokale Wirt.
	Target string `json:"target,omitempty"`
	// Summary ist die menschenlesbare Kurzfassung des Vorschlags.
	Summary string `json:"summary,omitempty"`
	// Branch ist der Branch samt Commit, auf dem der Vorschlag liegt.
	Branch Branch `json:"branch"`
	// BaseGeneration ist die Generation, die beim Vorschlag aktiv war. Sie
	// bindet die Anwendung an einen Ausgangszustand.
	BaseGeneration string `json:"base_generation,omitempty"`
	// CreatedAt ist der Zeitpunkt der Aufnahme.
	CreatedAt time.Time `json:"created_at"`
}

// Approval ist die ausdrueckliche menschliche Freigabe. Ohne eine
// aufgezeichnete Freigabe laeuft keine Anwendung (Betreiber-Vorgabe: der
// Mensch sieht den Diff und gibt frei, erst dann folgt switch).
//
// Die Freigabe bindet den Fingerabdruck des freigegebenen Diffs und die
// Basisgeneration. Aendert sich der Diff danach, passt der Fingerabdruck nicht
// mehr und die Anwendung wird fail-closed abgelehnt.
type Approval struct {
	// By ist die Identitaet der freigebenden Person.
	By string `json:"by"`
	// At ist der Zeitstempel der Freigabe.
	At time.Time `json:"at"`
	// DiffHash ist der Fingerabdruck des freigegebenen Diffs.
	DiffHash string `json:"diff_hash"`
	// BaseGeneration ist die Generation, auf der die Freigabe beruht.
	BaseGeneration string `json:"base_generation,omitempty"`
	// Note ist eine optionale Bemerkung zur Freigabe.
	Note string `json:"note,omitempty"`
}

// FileDiff ist die Aenderung an einer einzelnen Datei.
type FileDiff struct {
	Path  string `json:"path"`
	Op    string `json:"op"` // "modify" | "create" | "delete"
	Hunks string `json:"hunks"`
}

// Diff ist die textuelle Aenderung, die ein Vorschlag bewirken wuerde. Der
// Hash bindet die geprueften Bytes: wer den Diff nach der Pruefung tauscht,
// faellt bei der Politik durch.
type Diff struct {
	ProposalID string `json:"proposal_id"`
	// Mode ist die Betriebsart, in der der Vorschlag entstanden ist. Sie steht
	// im Diff, damit die Anwendung nicht raten muss, wo sie stattfindet.
	Mode   Mode       `json:"mode,omitempty"`
	Flake  string     `json:"flake"`
	Target string     `json:"target,omitempty"`
	Files  []FileDiff `json:"files"`
	Hash   string     `json:"hash"`
}

// Finding ist ein Befund der statischen Pruefung.
type Finding struct {
	Code     string   `json:"code"`
	Severity Severity `json:"severity"`
	Message  string   `json:"message"`
	Location string   `json:"location,omitempty"`
}

// Generation ist eine erzeugte Systemgeneration. Der Rueckweg ist ein
// Umschalten auf eine vorhandene Generation, keine Wiederherstellung.
type Generation struct {
	ID      string    `json:"id"`
	Label   string    `json:"label"`
	Created time.Time `json:"created_at"`
	// Current markiert genau die aktive Generation.
	Current bool `json:"current"`
	// System ist die Schalterstellung, die diese Generation erzeugt hat.
	System string `json:"system"`
	// Mode ist die Betriebsart, in der die Generation entstanden ist.
	Mode Mode `json:"mode,omitempty"`
	// ProposalID ist der Vorschlag, der diese Generation erzeugt hat; leer bei
	// einer von Hand aufgenommenen Generation.
	ProposalID string `json:"proposal_id,omitempty"`
	// Target ist der Zielrechner, leer heisst der lokale Wirt.
	Target string `json:"target,omitempty"`
	// Note haelt fest, was ausserhalb der Buchfuehrung geschah.
	Note string `json:"note,omitempty"`
}

// CheckRecord ist das aufgezeichnete Pruefergebnis eines Vorschlags. Die
// Politik liest ausschliesslich diese Aufzeichnung — nie ein Feld der Anfrage.
type CheckRecord struct {
	At       time.Time `json:"at"`
	Findings []Finding `json:"findings"`
	// DiffHash bindet die geprueften Bytes.
	DiffHash string `json:"diff_hash"`
	// Blocked ist wahr, sobald ein Befund der Schwere error dabei war.
	Blocked bool `json:"blocked"`
	// Categories sind die Sachkategorien des geprueften Diffs. Die Politik
	// leitet daraus ab, ob eine strengere Stufe greift.
	Categories []Category `json:"categories,omitempty"`
}
