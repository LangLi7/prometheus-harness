// Package service verbindet die drei Teile von pmh-nix zum Vertrag:
// Buchfuehrung (internal/state), Politik (internal/policy) und ausfuehrendes
// Backend (internal/actuation).
//
// Hier — und nur hier — wird entschieden, ob eine Handlung laeuft. Die
// Reihenfolge ist bindend:
//
//	propose -> check -> policy.require(apply) -> backend.Apply
//
// Der Aufruf von policy.Require steht VOR jedem backend.Apply. Ein Backend
// wird nie ohne Zulassung angefasst, und die Zulassung kommt nie aus der
// Anfrage des Aufrufers, sondern aus der Aufzeichnung.
package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/policy"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/state"
)

// Service ist der Vertrag des Dienstes.
type Service struct {
	store   *state.Store
	backend actuation.Backend
	policy  *policy.Policy
}

// New baut den Dienst.
func New(store *state.Store, backend actuation.Backend) (*Service, error) {
	if store == nil {
		return nil, errors.New("service: Buchfuehrung fehlt")
	}
	if backend == nil {
		return nil, errors.New("service: Backend fehlt")
	}
	return &Service{store: store, backend: backend, policy: policy.New(store)}, nil
}

// Backend nennt den Namen des Backends.
func (s *Service) Backend() string { return s.backend.Name() }

// Path nennt den Ablageort der Buchfuehrung.
func (s *Service) Path() string { return s.store.Path() }

// Detect meldet die Faehigkeit des Backends. Detect veraendert nichts und
// braucht keine Zulassung.
func (s *Service) Detect() (api.Capability, error) {
	cap, err := s.backend.Detect()
	if err != nil {
		return cap, fmt.Errorf("detect: %w", err)
	}
	if cap.Backend == "" {
		cap.Backend = s.backend.Name()
	}
	return cap, nil
}

// ProposeResult ist die Antwort auf einen Vorschlag.
type ProposeResult struct {
	Proposal api.Proposal `json:"proposal"`
	Diff     api.Diff     `json:"diff"`
	// Admissible ist das Urteil der Politik ueber das Aufnehmen. Es ist
	// informativ: Vorschlagen ist nicht gesperrt, Anwenden schon.
	Admissible bool   `json:"admissible"`
	Message    string `json:"message"`
}

// Propose nimmt einen Vorschlag auf. Das ist die einzige Handlung, die ein
// Modell ausloesen darf.
func (s *Service) Propose(flake, target, summary string) (ProposeResult, error) {
	if err := s.policy.Require(policy.Request{Action: policy.ActionPropose}); err != nil {
		return ProposeResult{}, err
	}
	diff, err := s.backend.Propose(api.Proposal{Flake: flake, Target: target, Summary: summary})
	if err != nil {
		return ProposeResult{}, fmt.Errorf("propose: %w", err)
	}
	rec, err := s.store.AddProposal(api.Proposal{Flake: flake, Target: target, Summary: summary}, diff)
	if err != nil {
		return ProposeResult{}, fmt.Errorf("propose: %w", err)
	}
	return ProposeResult{
		Proposal:   rec.Proposal,
		Diff:       rec.Diff,
		Admissible: true,
		Message:    "vorschlag aufgenommen und gespeichert; anwenden erst nach check",
	}, nil
}

// CheckResult ist die Antwort auf eine Pruefung.
type CheckResult struct {
	ProposalID string         `json:"proposal_id"`
	Findings   []api.Finding  `json:"findings"`
	Checked    api.CheckRecord `json:"checked"`
	// Blocked ist wahr, sobald ein Befund der Schwere error dabei war.
	Blocked bool `json:"blocked"`
	Message string `json:"message"`
}

// Check prueft einen aufgenommenen Vorschlag statisch und zeichnet das
// Ergebnis auf. Ab hier traegt der Vorschlag ein Pruefergebnis — vorher kann
// er nicht angewandt werden.
func (s *Service) Check(proposalID string) (CheckResult, error) {
	id := strings.TrimSpace(proposalID)
	if id == "" {
		return CheckResult{}, errors.New("check: --proposal fehlt")
	}
	if err := s.policy.Require(policy.Request{Action: policy.ActionCheck, ProposalID: id}); err != nil {
		return CheckResult{}, err
	}
	rec := s.store.Proposal(id)
	findings, err := s.backend.Check(rec.Diff)
	if err != nil {
		return CheckResult{}, fmt.Errorf("check: %w", err)
	}
	record := api.CheckRecord{
		At:       time.Now().UTC(),
		Findings: findings,
		DiffHash: rec.Diff.Hash,
	}
	if err := s.store.RecordCheck(id, record); err != nil {
		return CheckResult{}, fmt.Errorf("check: %w", err)
	}
	// Der Sperrvermerk wird aus der Aufzeichnung gelesen, nicht aus der
	// lokalen Kopie: die Aufzeichnung ist die Wahrheit, an der die Politik
	// spaeter entscheidet.
	if recorded := s.store.Proposal(id); recorded != nil && recorded.Checked != nil {
		record = *recorded.Checked
	}
	result := CheckResult{
		ProposalID: id,
		Findings:   findings,
		Checked:    record,
		Blocked:    record.Blocked,
	}
	if record.Blocked {
		// Den Ablehnungsgrund dauerhaft festhalten, damit ein zweiter
		// Anlauf denselben Grund sichtbar macht.
		_ = s.store.MarkBlocked(id, policy.ReasonFindingsBlocking)
		result.Message = "pruefung ergab Befunde der Schwere error: anwenden gesperrt"
		return result, nil
	}
	result.Message = "pruefung ohne sperrende Befunde: anwenden moeglich"
	return result, nil
}

// ApplyResult ist die Antwort auf eine Anwendung.
type ApplyResult struct {
	ProposalID string         `json:"proposal_id"`
	Generation api.Generation `json:"generation"`
	Message    string         `json:"message"`
}

// Apply wendet einen geprueften Vorschlag an. Diese Methode ist der einzige
// Weg zu einer neuen Generation. Sie verweigert:
//
//   - einen unbekannten Vorschlag (nie vorgeschlagen),
//   - einen bereits angewandten Vorschlag,
//   - einen Vorschlag ohne aufgezeichnetes Pruefergebnis,
//   - einen Vorschlag, dessen Pruefung einen Befund der Schwere error ergab,
//   - einen Diff, der nach der Pruefung getauscht wurde.
func (s *Service) Apply(proposalID string) (ApplyResult, error) {
	id := strings.TrimSpace(proposalID)
	if id == "" {
		return ApplyResult{}, errors.New("apply: --proposal fehlt")
	}
	// Die Politik entscheidet — nicht der Aufrufer und nicht das Modell.
	if err := s.policy.Require(policy.Request{Action: policy.ActionApply, ProposalID: id}); err != nil {
		return ApplyResult{}, err
	}
	rec := s.store.Proposal(id)
	gen, err := s.backend.Apply(rec.Diff)
	if err != nil {
		return ApplyResult{}, fmt.Errorf("apply: %w", err)
	}
	if err := s.store.MarkApplied(id, gen.ID); err != nil {
		return ApplyResult{}, fmt.Errorf("apply: %w", err)
	}
	return ApplyResult{
		ProposalID: id,
		Generation: gen,
		Message:    fmt.Sprintf("vorschlag %s angewandt, Generation %s ist aktiv", id, gen.ID),
	}, nil
}

// GenerationsResult ist die Antwort auf die Generationenliste.
type GenerationsResult struct {
	Current     string           `json:"current"`
	Generations []api.Generation `json:"generations"`
	Message     string           `json:"message"`
}

// Generations listet die Generationen, neueste zuerst, die aktive markiert.
func (s *Service) Generations() (GenerationsResult, error) {
	gens, err := s.backend.Generations()
	if err != nil {
		return GenerationsResult{}, fmt.Errorf("generations: %w", err)
	}
	current := s.store.Current()
	if current == "" {
		for _, g := range gens {
			if g.Current {
				current = g.ID
				break
			}
		}
	}
	msg := "keine Generation vorhanden"
	if len(gens) > 0 {
		msg = fmt.Sprintf("%d Generation(en), aktiv: %s", len(gens), current)
	}
	return GenerationsResult{Current: current, Generations: gens, Message: msg}, nil
}

// RollbackResult ist die Antwort auf einen Rueckweg.
type RollbackResult struct {
	From       string         `json:"from"`
	Generation api.Generation `json:"generation"`
	Message    string         `json:"message"`
}

// Rollback schaltet auf eine vorhandene Generation zurueck. Das ist ein
// Umschalten, keine Wiederherstellung. Der Rueckweg ist bewusst nicht
// gesperrt: ein System, aus dem man nicht herauskommt, waere schlimmer als
// eines, das sich aendert.
func (s *Service) Rollback(target string) (RollbackResult, error) {
	id := strings.TrimSpace(target)
	if id == "" {
		return RollbackResult{}, errors.New("rollback: --to fehlt")
	}
	if err := s.policy.Require(policy.Request{Action: policy.ActionRollback}); err != nil {
		return RollbackResult{}, err
	}
	from := s.store.Current()
	gen, err := s.backend.Rollback(id)
	if err != nil {
		return RollbackResult{}, fmt.Errorf("rollback: %w", err)
	}
	return RollbackResult{
		From:       from,
		Generation: gen,
		Message:    fmt.Sprintf("auf Generation %s umgeschaltet (vorher %s)", gen.ID, from),
	}, nil
}
