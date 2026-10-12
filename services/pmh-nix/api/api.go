// Package api haelt die uebertragenen Typen des Dienstes pmh-nix: Anfrage und
// Antwort, Diff, Befund, Generation und Faehigkeitsmeldung.
//
// Der Dienst steht hinter einer Prozessgrenze (docs/concept.md, Regel 4:
// "Sprachgrenzen sind Dienstgrenzen"). Dieses Paket ist deshalb die
// Veroeffentlichung: nur diese Typen verlassen den Dienst, und nur ueber JSON.
// Nichts hier importiert Interna des TypeScript-Kerns.
package api

import "time"

// Schema ist die Fassung des uebertragenen Formats. Sie wird mit jeder
// Antwort ausgeliefert, damit ein Aufrufer die Fassung pruefen kann, statt sie
// zu raten.
const Schema = 1

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

// Proposal ist eine vorgeschlagene Aenderung. Ein Modell oder ein fremder
// Aufrufer kann genau das hier erzeugen: einen Vorschlag. Mehr nicht.
//
// Es gibt absichtlich KEIN Feld, das eine Anwendung erlaubt. Wer Apply
// ausloesen will, braucht einen Vorschlag, der geprueft und gespeichert ist;
// der Vorschlag selbst kann das nicht behaupten.
type Proposal struct {
	// ID wird vom Dienst vergeben, nicht vom Aufrufer.
	ID string `json:"id"`
	// Flake ist der Pfad zum Nix-Flake, der die Systemkonfiguration beschreibt.
	Flake string `json:"flake"`
	// Target ist der Zielrechner, leer heisst der lokale Wirt.
	Target string `json:"target,omitempty"`
	// Summary ist die menschenlesbare Kurzfassung des Vorschlags.
	Summary string `json:"summary,omitempty"`
	// CreatedAt ist der Zeitpunkt der Aufnahme.
	CreatedAt time.Time `json:"created_at"`
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
	ProposalID string     `json:"proposal_id"`
	Flake      string     `json:"flake"`
	Target     string     `json:"target,omitempty"`
	Files      []FileDiff `json:"files"`
	Hash       string     `json:"hash"`
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
}
