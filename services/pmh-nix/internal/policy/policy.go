// Package policy ist die Zulassungsschicht von pmh-nix. Sie beantwortet genau
// eine Frage: darf dieser Vorschlag JETZT angewandt werden?
//
// # Die Regel, die dieses Paket traegt
//
//	Das Modell empfiehlt, die Policy entscheidet —
//	ein Modell loest niemals einen Systemwechsel aus.
//
// # Warum die Entscheidung nicht aus der Anfrage kommt
//
// Dieses Paket liest AUSSCHLIESSLICH die aufgezeichnete Buchfuehrung
// (internal/state) und den Fingerabdruck des gespeicherten Diffs. Es liest
// kein Feld einer Anfrage, das ein Aufrufer selbst fuellen koennte — kein
// "checked: true", kein "safe: true", kein "policy_ok: true", kein
// "approved_by". Ein Vorschlag ist eine Bitte, keine Erlaubnis.
//
// Der Test TestPolicyCannotBeBypassedByProposalFields belegt das: er baut
// einen Vorschlag, der sich selbst fuer geprueft, sicher, genehmigt und
// anwendbar erklaert, und die Politik weist ihn trotzdem ab, weil die
// Aufzeichnung fehlt.
//
// Der Fingerabdruck bindet die geprueften Bytes: wer den Diff nach der
// Pruefung austauscht, faellt durch (Grund "diff-geaendert").
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
	// ActionCheck ist die statische Pruefung.
	ActionCheck Action = "check"
	// ActionApply ist die Anwendung. Sie ist die einzige gesperrte Handlung.
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
	case ActionPropose, ActionCheck, ActionRollback:
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
	if current := state.HashDiff(rec.Diff); rec.Checked.DiffHash != "" && current != rec.Checked.DiffHash {
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
	d.Allowed = true
	d.Message = fmt.Sprintf("vorschlag %q ist geprueft (%s) und darf angewandt werden",
		req.ProposalID, rec.Checked.At.UTC().Format("2006-01-02T15:04:05Z"))
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
