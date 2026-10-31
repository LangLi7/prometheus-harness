// Package policy ist die Zulassungsschicht von pmh-nix. Sie beantwortet genau
// eine Frage: darf dieser Vorschlag JETZT angewandt werden?
//
// # Die Regel, die dieses Paket traegt
//
//	Das Modell empfiehlt, die Policy entscheidet —
//	ein Modell loest niemals einen Systemwechsel aus.
//
// Der Betreiber hat das verschaerft: der Agent aendert nicht das laufende
// System, sondern die Konfiguration auf einem Branch; der Mensch sieht den
// Diff und gibt frei, erst dann folgt der Wechsel. Deshalb verlangt die
// Anwendung hier eine AUFGEZEICHNETE, AUSDRUECKLICHE FREIGABE (api.Approval)
// — zusaetzlich zu Vorschlag, Pruefbau und unveraendertem Fingerabdruck.
//
// # Warum die Entscheidung nicht aus der Anfrage kommt
//
// Dieses Paket liest AUSSCHLIESSLICH die aufgezeichnete Buchfuehrung
// (internal/state). Es liest kein Feld einer Anfrage, das ein Aufrufer selbst
// fuellen koennte — kein "checked: true", kein "safe: true", kein
// "policy_ok: true", kein "approved: true". Ein Vorschlag ist eine Bitte,
// keine Erlaubnis.
//
// Der Test TestPolicyCannotBeBypassedByProposalFields belegt das: er baut
// einen Vorschlag, der sich selbst fuer geprueft, sicher, genehmigt und
// anwendbar erklaert, und die Politik weist ihn trotzdem ab, weil die
// Aufzeichnung fehlt.
//
// Der Fingerabdruck bindet die geprueften Bytes: wer den Diff nach der
// Pruefung austauscht, faellt durch (Grund "diff-geaendert"), und wer ihn nach
// der Freigabe austauscht, ebenfalls.
//
// # Zwei Stufen statt einer
//
// Die drei Kategorien network, users und secrets (Betreiber-Vorgabe G3:
// Netzwerk, Nutzerrechte und Geheimnisse) bekommen eine EIGENE, strengere
// Stufe: ihre Zulaessigkeit haengt an der ausdruecklichen Freigabe. Sie werden
// nie allein aufgrund der allgemeinen Branch-Regel angewandt.
package policy

import (
	"errors"
	"fmt"
	"strings"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/state"
)

// Action ist die Handlung, deren Zulaessigkeit geprueft wird.
type Action string

const (
	// ActionPropose ist das Aufnehmen eines Vorschlags.
	ActionPropose Action = "propose"
	// ActionCheck ist die statische Pruefung (Pruefbau ohne Aktivierung).
	ActionCheck Action = "check"
	// ActionApprove ist die ausdrueckliche menschliche Freigabe.
	ActionApprove Action = "approve"
	// ActionApply ist die Anwendung (Activation). Sie ist die einzige
	// gesperrte Handlung.
	ActionApply Action = "apply"
	// ActionRollback ist der Rueckweg.
	ActionRollback Action = "rollback"
)

// Feste Ablehnungsgruende. Sie sind maschinenlesbar, damit ein Aufrufer sie
// auswerten kann, statt Fehlertexte zu vergleichen.
const (
	ReasonUnknownProposal  = "vorschlag-unbekannt"
	ReasonAlreadyApplied   = "vorschlag-schon-angewandt"
	ReasonUnchecked        = "vorschlag-ungeprueft"
	ReasonBlocked          = "pruefung-gesperrt"
	ReasonFindingsBlocking = "befunde-der-schwere-error"
	ReasonDiffChanged      = "diff-geaendert"
	ReasonNoCheckRecord    = "keine-pruefaufzeichnung"
	ReasonUnknownAction    = "unbekannte-handlung"

	// ReasonNoApproval: es liegt keine ausdrueckliche Freigabe vor.
	ReasonNoApproval = "keine-freigabe"
	// ReasonApprovalStale: die Freigabe gilt fuer einen anderen Diff.
	ReasonApprovalStale = "freigabe-veraltet"
	// ReasonRestrictedCategory: der Diff beruehrt eine strengere Kategorie.
	ReasonRestrictedCategory = "strengere-kategorie"
	// ReasonBaseGenerationChanged: die Basisgeneration ist nicht mehr aktiv.
	ReasonBaseGenerationChanged = "basisgeneration-geaendert"
)

// Request ist, was die Politik zu sehen bekommt. Es gibt genau zwei Felder
// aus der Aussenwelt: die Kennung und den Fingerabdruck des Diffs. Alles
// andere kommt aus der Aufzeichnung.
type Request struct {
	// Action ist die zu pruefende Handlung.
	Action Action
	// ProposalID ist die Kennung aus der Buchfuehrung.
	ProposalID string
	// DiffHash ist der Fingerabdruck des vorliegenden Diffs. Leer heisst:
	// es wird gegen den gespeicherten Diff geprueft.
	DiffHash string
}

// Decision ist das Ergebnis. Allowed ist die Antwort, Reasons sind die
// Gruende (leer, wenn erlaubt).
type Decision struct {
	Action     Action   `json:"action"`
	ProposalID string   `json:"proposal_id"`
	Allowed    bool     `json:"allowed"`
	Reasons    []string `json:"reasons,omitempty"`
	Message    string   `json:"message"`
}

// Denied ist der Fehler einer abgelehnten Handlung. Er traegt die Gruende,
// damit die CLI sie als ein JSON-Objekt ausgeben kann.
type Denied struct {
	Decision Decision
}

func (d *Denied) Error() string {
	return fmt.Sprintf("policy verweigert %s fuer %q: %s (%s)",
		d.Decision.Action, d.Decision.ProposalID, d.Decision.Message, strings.Join(d.Decision.Reasons, ", "))
}

// ErrDenied ist der Sentinel fuer jede Ablehnung durch die Politik.
var ErrDenied = errors.New("von der policy verweigert")

// Unwrap bindet an ErrDenied.
func (d *Denied) Unwrap() error { return ErrDenied }

// Policy entscheidet ueber Zulaessigkeit. Sie haelt selbst keinen Zustand:
// die Buchfuehrung ist die einzige Wahrheit, und sie wird bei jeder
// Entscheidung neu gelesen.
type Policy struct {
	store *state.Store
}

// New baut die Politik auf einer Buchfuehrung.
func New(store *state.Store) *Policy { return &Policy{store: store} }

// Decide faellt die Entscheidung. Sie liest ausschliesslich die
// Aufzeichnung.
func (p *Policy) Decide(req Request) Decision {
	d := Decision{Action: req.Action, ProposalID: req.ProposalID}
	if p == nil || p.store == nil {
		d.Allowed = false
		d.Reasons = []string{ReasonNoCheckRecord}
		d.Message = "keine Buchfuehrung vorhanden: ohne Aufzeichnung keine Zulassung"
		return d
	}

	switch req.Action {
	case ActionPropose, ActionCheck, ActionApprove, ActionRollback:
		// Diese Handlungen aendern nichts am System. Sie sind immer
		// zulaessig; geprueft wird nur, ob es den Vorschlag ueberhaupt gibt.
		if req.Action != ActionPropose && strings.TrimSpace(req.ProposalID) != "" {
			if p.store.Proposal(req.ProposalID) == nil {
				d.Allowed = false
				d.Reasons = []string{ReasonUnknownProposal}
				d.Message = fmt.Sprintf("vorschlag %q ist nicht aufgenommen", req.ProposalID)
				return d
			}
		}
		d.Allowed = true
		d.Message = fmt.Sprintf("%s aendert nichts am System und ist zulaessig", req.Action)
		return d

	case ActionApply:
		return p.decideApply(d, req)

	default:
		d.Allowed = false
		d.Reasons = []string{ReasonUnknownAction}
		d.Message = fmt.Sprintf("handlung %q ist unbekannt", req.Action)
		return d
	}
}

// decideApply ist der Kern: die einzige gesperrte Handlung.
//
// Geprueft wird in dieser Reihenfolge, und jeder Schritt kann allein sperren:
//
//  1. der Vorschlag ist aufgenommen,
//  2. er ist noch nicht angewandt,
//  3. er traegt einen Pruefbau (check),
//  4. der Diff ist unveraendert (Fingerabdruck),
//  5. der Pruefbau hat keine Befunde der Schwere error,
//  6. die Basisgeneration ist noch aktiv,
//  7. es liegt eine ausdrueckliche Freigabe vor,
//  8. die Freigabe gilt genau fuer diesen Diff UND diese Basisgeneration.
func (p *Policy) decideApply(d Decision, req Request) Decision {
	rec := p.store.Proposal(req.ProposalID)
	if rec == nil {
		d.Allowed = false
		d.Reasons = []string{ReasonUnknownProposal}
		d.Message = fmt.Sprintf("vorschlag %q ist nicht aufgenommen: nur ein Vorschlag aus propose darf angewandt werden", req.ProposalID)
		return d
	}
	if rec.Applied {
		d.Allowed = false
		d.Reasons = []string{ReasonAlreadyApplied}
		d.Message = fmt.Sprintf("vorschlag %q wurde bereits angewandt (%s)",
			req.ProposalID, rec.GenerationID)
		return d
	}
	if rec.Checked == nil {
		d.Allowed = false
		d.Reasons = []string{ReasonUnchecked}
		d.Message = fmt.Sprintf("vorschlag %q traegt kein aufgezeichnetes Pruefergebnis: erst check, dann apply", req.ProposalID)
		return d
	}
	// Der Fingerabdruck bindet die geprueften Bytes.
	if req.DiffHash != "" && req.DiffHash != rec.Checked.DiffHash {
		d.Allowed = false
		d.Reasons = []string{ReasonDiffChanged}
		d.Message = "der vorliegende Diff ist nicht der gepruefte"
		return d
	}
	current := state.HashDiff(rec.Diff)
	if rec.Checked.DiffHash != "" && current != rec.Checked.DiffHash {
		d.Allowed = false
		d.Reasons = []string{ReasonDiffChanged}
		d.Message = "der gespeicherte Diff wurde nach der Pruefung geaendert"
		return d
	}
	if rec.Checked.Blocked {
		d.Allowed = false
		d.Reasons = []string{ReasonBlocked, ReasonFindingsBlocking}
		d.Message = fmt.Sprintf("die Pruefung von %q hat Befunde der Schwere error ergeben", req.ProposalID)
		return d
	}

	// Die Basisgeneration wird VOR der Freigabe geprueft: ist sie nicht mehr
	// aktiv, hilft auch die schoenste Freigabe nicht — der Vorschlag ist dann
	// auf einem veralteten Stand gebaut.
	if rec.BaseGeneration != "" && rec.BaseGeneration != p.store.Current() {
		d.Allowed = false
		d.Reasons = []string{ReasonBaseGenerationChanged}
		d.Message = fmt.Sprintf("die Basisgeneration %q ist nicht mehr aktiv (aktiv: %q): "+
			"der Vorschlag muss auf dem heutigen Stand neu gebaut, geprueft und freigegeben werden",
			rec.BaseGeneration, p.store.Current())
		return d
	}

	// Ab hier die verschaerfte Stufe: ohne ausdrueckliche Freigabe laeuft
	// nichts. Das ist die Betreiber-Vorgabe — der Mensch sieht den Diff und
	// gibt frei, erst dann folgt der Wechsel.
	if rec.Approval == nil {
		d.Allowed = false
		d.Reasons = []string{ReasonNoApproval}
		if len(rec.Checked.Categories) > 0 && HasRestricted(rec.Checked.Categories) {
			d.Reasons = append(d.Reasons, ReasonRestrictedCategory)
		}
		d.Message = fmt.Sprintf("vorschlag %q ist geprueft, aber nicht freigegeben: "+
			"eine Anwendung ohne ausdrueckliche menschliche Freigabe ist nicht zulaessig", req.ProposalID)
		return d
	}
	if rec.Approval.DiffHash != current {
		d.Allowed = false
		d.Reasons = []string{ReasonApprovalStale, ReasonDiffChanged}
		d.Message = "die Freigabe gilt fuer einen anderen Diff: der Diff wurde nach der Freigabe geaendert"
		return d
	}
	if rec.Approval.BaseGeneration != rec.BaseGeneration {
		d.Allowed = false
		d.Reasons = []string{ReasonBaseGenerationChanged}
		d.Message = fmt.Sprintf("die Freigabe beruht auf Generation %q, der Vorschlag auf %q",
			rec.Approval.BaseGeneration, rec.BaseGeneration)
		return d
	}

	restricted := Restricted(rec.Checked.Categories)
	d.Allowed = true
	d.Message = fmt.Sprintf("vorschlag %q ist geprueft und freigegeben von %q (%s)",
		req.ProposalID, rec.Approval.By, rec.Approval.At.UTC().Format("2006-01-02T15:04:05Z"))
	if len(restricted) > 0 {
		d.Message += fmt.Sprintf("; strengere Kategorie(n): %s", joinCategories(restricted))
	}
	return d
}

// Require gibt bei Ablehnung einen *Denied zurueck, sonst nil.
func (p *Policy) Require(req Request) error {
	d := p.Decide(req)
	if d.Allowed {
		return nil
	}
	return &Denied{Decision: d}
}

// BlockingFindings filtert die Befunde, die eine Anwendung sperren.
func BlockingFindings(findings []api.Finding) []api.Finding {
	var out []api.Finding
	for _, f := range findings {
		if f.Severity.Blocks() {
			out = append(out, f)
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Sachkategorien — die zweite, strengere Stufe (Betreiber-Vorgabe G3)
// ---------------------------------------------------------------------------
//
// Die Zuordnung Pfad -> Kategorie steht in internal/actuation (Classify), weil
// sie eine Aussage ueber den Diff ist und nicht ueber die Zulaessigkeit. Hier
// steht nur, was aus der Kategorie fuer die Entscheidung folgt: network, users
// und secrets brauchen zwingend eine ausdrueckliche Freigabe.

// HasRestricted meldet, ob eine der Kategorien die strengere Stufe verlangt.
func HasRestricted(categories []api.Category) bool {
	for _, c := range categories {
		if c.Restricted() {
			return true
		}
	}
	return false
}

// Restricted liefert die strengeren Kategorien einer Liste, in fester
// Reihenfolge.
func Restricted(categories []api.Category) []api.Category {
	var out []api.Category
	for _, want := range []api.Category{api.CategorySecrets, api.CategoryUsers, api.CategoryNetwork} {
		if containsCategory(categories, want) {
			out = append(out, want)
		}
	}
	return out
}

func containsCategory(list []api.Category, want api.Category) bool {
	for _, c := range list {
		if c == want {
			return true
		}
	}
	return false
}

func joinCategories(list []api.Category) string {
	parts := make([]string, 0, len(list))
	for _, c := range list {
		parts = append(parts, string(c))
	}
	return strings.Join(parts, ", ")
}
