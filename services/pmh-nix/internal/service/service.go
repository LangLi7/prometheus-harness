// Package service verbindet die drei Teile von pmh-nix zum Vertrag:
// Buchfuehrung (internal/state), Politik (internal/policy) und ausfuehrendes
// Backend (internal/actuation).
//
// Hier — und nur hier — wird entschieden, ob eine Handlung laeuft. Die
// Reihenfolge ist bindend:
//
//	propose -> check -> approve -> policy.Require(apply) -> backend.Apply
//
// Der Aufruf von policy.Require steht VOR jedem backend.Apply. Ein Backend
// wird nie ohne Zulassung angefasst, und die Zulassung kommt nie aus der
// Anfrage des Aufrufers, sondern aus der Aufzeichnung.
//
// Der Betreiber hat den Vertrag praezisiert: der Agent aendert nicht das
// laufende System, sondern die Konfiguration auf einem Branch. Der Mensch
// sieht den Diff und gibt ausdruecklich frei (Approve); erst dann folgt die
// Activation (Apply). Ohne aufgezeichnete Freigabe laeuft keine Anwendung.
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
	Branch   api.Branch   `json:"branch"`
	// Categories sind die Sachkategorien des Diffs.
	Categories []api.Category `json:"categories"`
	// Admissible ist das Urteil der Politik ueber das Aufnehmen. Es ist
	// informativ: Vorschlagen ist nicht gesperrt, Anwenden schon.
	Admissible bool   `json:"admissible"`
	Message    string `json:"message"`
}

// Propose nimmt einen Vorschlag auf. Das ist die einzige Handlung, die ein
// Modell ausloesen darf.
//
// Aufgezeichnet wird ein BRANCH MIT DIFF, keine angewandte Aenderung. Propose
// aktiviert nie und beruehrt das System nie.
func (s *Service) Propose(mode api.Mode, flake, target, summary string) (ProposeResult, error) {
	if err := s.policy.Require(policy.Request{Action: policy.ActionPropose}); err != nil {
		return ProposeResult{}, err
	}
	if mode == "" {
		mode = api.ModeLocal
	}
	diff, branch, err := s.backend.Propose(api.Proposal{Mode: mode, Flake: flake, Target: target, Summary: summary})
	if err != nil {
		return ProposeResult{}, fmt.Errorf("propose: %w", err)
	}
	rec, err := s.store.AddProposal(api.Proposal{
		Mode: mode, Flake: flake, Target: target, Summary: summary, Branch: branch,
	}, diff)
	if err != nil {
		return ProposeResult{}, fmt.Errorf("propose: %w", err)
	}
	return ProposeResult{
		Proposal:   rec.Proposal,
		Diff:       rec.Diff,
		Branch:     branch,
		Categories: actuation.Classify(rec.Diff),
		Admissible: true,
		Message: fmt.Sprintf("vorschlag %s aufgenommen: Branch %s, Commit %s — nichts aktiviert; "+
			"weiter mit check, dann Freigabe", rec.Proposal.ID, branch.Name, branch.Commit),
	}, nil
}

// CheckResult ist die Antwort auf einen Pruefbau.
type CheckResult struct {
	ProposalID string          `json:"proposal_id"`
	Findings   []api.Finding   `json:"findings"`
	Checked    api.CheckRecord `json:"checked"`
	// Categories sind die Sachkategorien des geprueften Diffs.
	Categories []api.Category `json:"categories"`
	// Restricted nennt die Kategorien, die eine ausdrueckliche Freigabe
	// verlangen (Netzwerk, Nutzerrechte, Geheimnisse).
	Restricted []api.Category `json:"restricted"`
	// Blocked ist wahr, sobald ein Befund der Schwere error dabei war.
	Blocked bool   `json:"blocked"`
	Message string `json:"message"`
}

// Check ist der Pruefbau ohne Aktivierung. Er prueft statisch und zeichnet das
// Ergebnis auf. Ab hier traegt der Vorschlag ein Pruefergebnis — vorher kann er
// nicht freigegeben und nicht angewandt werden.
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
	// Der Pruefbau fuehrt die Pruefungen des Randes mit den inhaltlichen
	// zusammen: Kategorien und Klartext-Geheimnisse sind Aussagen ueber den
	// Diff, unabhaengig davon, welches Backend laeuft.
	findings = mergeFindings(findings, actuation.SecretFindings(rec.Diff))
	categories := actuation.Classify(rec.Diff)
	restricted := policy.Restricted(categories)

	record := api.CheckRecord{
		At:         time.Now().UTC(),
		Findings:   findings,
		DiffHash:   rec.Diff.Hash,
		Categories: categories,
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
		Categories: categories,
		Restricted: restricted,
		Blocked:    record.Blocked,
	}
	switch {
	case record.Blocked:
		// Den Ablehnungsgrund dauerhaft festhalten, damit ein zweiter
		// Anlauf denselben Grund sichtbar macht.
		_ = s.store.MarkBlocked(id, policy.ReasonFindingsBlocking)
		result.Message = "pruefbau ergab Befunde der Schwere error: anwenden gesperrt"
	case len(restricted) > 0:
		result.Message = fmt.Sprintf("pruefbau ohne sperrende Befunde; Achtung: %s verlangt eine ausdrueckliche Freigabe",
			categoryList(restricted))
	default:
		result.Message = "pruefbau ohne sperrende Befunde: Freigabe moeglich"
	}
	return result, nil
}

// ApprovalResult ist die Antwort auf eine Freigabe.
type ApprovalResult struct {
	ProposalID string       `json:"proposal_id"`
	Approval   api.Approval `json:"approval"`
	Message    string       `json:"message"`
}

// Approve zeichnet die ausdrueckliche menschliche Freigabe auf.
//
// Sie ist die vierte Stufe des Vertrags und die einzige Stelle, an der eine
// Freigabe entstehen kann. Sie verlangt einen Pruefbau: eine Freigabe ohne
// Pruefbau waere blind.
//
// Der Fingerabdruck wird auf den GEPRUEFTEN Diff festgelegt, nicht auf das,
// was der Aufrufer behauptet.
func (s *Service) Approve(proposalID, by, note string) (ApprovalResult, error) {
	id := strings.TrimSpace(proposalID)
	if id == "" {
		return ApprovalResult{}, errors.New("approve: --proposal fehlt")
	}
	by = strings.TrimSpace(by)
	if by == "" {
		return ApprovalResult{}, errors.New("approve: --by fehlt: wer freigibt, muss benannt sein")
	}
	if err := s.policy.Require(policy.Request{Action: policy.ActionApprove, ProposalID: id}); err != nil {
		return ApprovalResult{}, err
	}
	rec := s.store.Proposal(id)
	if rec.Checked == nil {
		// Kein Aufruffeher und kein Backendfehler, sondern eine Verweigerung
		// der Zulassungsschicht: Exit 1.
		return ApprovalResult{}, &policy.Denied{Decision: policy.Decision{
			Action:     policy.ActionApprove,
			ProposalID: id,
			Allowed:    false,
			Reasons:    []string{policy.ReasonUnchecked},
			Message:    "approve verlangt einen Pruefbau: eine Freigabe ohne Pruefbau waere blind",
		}}
	}
	if rec.Checked.Blocked {
		return ApprovalResult{}, &policy.Denied{Decision: policy.Decision{
			Action:     policy.ActionApprove,
			ProposalID: id,
			Allowed:    false,
			Reasons:    []string{policy.ReasonBlocked, policy.ReasonFindingsBlocking},
			Message:    "approve verweigert: der Pruefbau hat Befunde der Schwere error ergeben",
		}}
	}
	approval, err := s.store.RecordApproval(id, api.Approval{By: by, Note: note})
	if err != nil {
		return ApprovalResult{}, fmt.Errorf("approve: %w", err)
	}
	return ApprovalResult{
		ProposalID: id,
		Approval:   *approval,
		Message: fmt.Sprintf("vorschlag %s von %q freigegeben fuer Diff %s — Activation erst mit apply",
			id, approval.By, shortHash(approval.DiffHash)),
	}, nil
}

// ApplyResult ist die Antwort auf eine Anwendung (Activation).
type ApplyResult struct {
	ProposalID string         `json:"proposal_id"`
	Generation api.Generation `json:"generation"`
	// ApprovedBy nennt die Identitaet der Freigabe, auf der die Anwendung
	// beruht.
	ApprovedBy string `json:"approved_by"`
	Message    string `json:"message"`
}

// Apply ist die Activation: sie wendet einen geprueften UND ausdruecklich
// freigegebenen Vorschlag an. Diese Methode ist der einzige Weg zu einer neuen
// Generation. Sie verweigert:
//
//   - einen unbekannten Vorschlag (nie vorgeschlagen),
//   - einen bereits angewandten Vorschlag,
//   - einen Vorschlag ohne aufgezeichnetes Pruefergebnis,
//   - einen Vorschlag, dessen Pruefbau einen Befund der Schwere error ergab,
//   - einen Diff, der nach dem Pruefbau getauscht wurde,
//   - einen Vorschlag OHNE aufgezeichnete ausdrueckliche Freigabe,
//   - einen Diff, der nach der Freigabe getauscht wurde,
//   - einen Vorschlag, dessen Basisgeneration nicht mehr aktiv ist.
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
	approvedBy := ""
	if rec.Approval != nil {
		approvedBy = rec.Approval.By
	}
	return ApplyResult{
		ProposalID: id,
		Generation: gen,
		ApprovedBy: approvedBy,
		Message: fmt.Sprintf("vorschlag %s angewandt, Generation %s ist aktiv (freigegeben von %s)",
			id, gen.ID, approvedBy),
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

// Rollback schaltet auf eine AUFGEZEICHNETE Generation zurueck — die vorige,
// nicht eine wiederhergestellte. Das ist ein Umschalten, keine
// Wiederherstellung von Dateien. Der Rueckweg ist bewusst nicht gesperrt: ein
// System, aus dem man nicht herauskommt, waere schlimmer als eines, das sich
// aendert.
//
// Eine unbekannte Generation wird abgewiesen; geraten wird nie.
func (s *Service) Rollback(target string) (RollbackResult, error) {
	id := strings.TrimSpace(target)
	if id == "" {
		return RollbackResult{}, errors.New("rollback: --to fehlt")
	}
	if err := s.policy.Require(policy.Request{Action: policy.ActionRollback}); err != nil {
		return RollbackResult{}, err
	}
	from := s.store.Current()
	if _, ok := s.store.Generation(id); !ok {
		return RollbackResult{}, fmt.Errorf("%w: generation %q ist nicht aufgezeichnet", actuation.ErrNoGeneration, id)
	}
	gen, err := s.backend.Rollback(id)
	if err != nil {
		return RollbackResult{}, fmt.Errorf("rollback: %w", err)
	}
	return RollbackResult{
		From:       from,
		Generation: gen,
		Message:    fmt.Sprintf("auf die aufgezeichnete Generation %s umgeschaltet (vorher %s)", gen.ID, from),
	}, nil
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

// mergeFindings haengt Befunde an, ohne denselben Code zweimal zu fuehren.
func mergeFindings(base, extra []api.Finding) []api.Finding {
	seen := make(map[string]bool, len(base))
	out := make([]api.Finding, 0, len(base)+len(extra))
	for _, f := range base {
		key := f.Code + "\x00" + f.Location
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, f)
	}
	for _, f := range extra {
		key := f.Code + "\x00" + f.Location
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, f)
	}
	return out
}

// categoryList nennt Kategorien als Text.
func categoryList(list []api.Category) string {
	parts := make([]string, 0, len(list))
	for _, c := range list {
		parts = append(parts, string(c))
	}
	return strings.Join(parts, ", ")
}

// shortHash kuerzt einen Fingerabdruck fuer Meldungen.
func shortHash(h string) string {
	if len(h) <= 19 {
		return h
	}
	return h[:19] + "…"
}
