package tests

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation/stub"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/policy"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/state"
)

// TestApplyRejectsUncheckedProposal ist der wichtigste Test des Dienstes.
//
// Ein Vorschlag, der nur vorgeschlagen und nicht geprueft wurde, darf NICHT
// angewandt werden. Wer die Pruefung ueberspringt, kommt nicht durch — auch
// nicht, wenn er sich fuer geprueft erklaert.
//
// Die Regel dahinter: das Modell empfiehlt, die Policy entscheidet.
func TestApplyRejectsUncheckedProposal(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "pmh-nix.json")
	svc := newStub(t, path)

	// 1. Nur vorschlagen — nicht pruefen.
	prop := propose(t, svc, constFlake, "node1")

	// 2. Anwenden versuchen. Das MUSS scheitern.
	_, err := svc.Apply(prop.Proposal.ID)
	if err == nil {
		t.Fatal("apply nahm einen ungepruefte Vorschlag an — die Sicherheitsinvariante ist verletzt")
	}
	if !errors.Is(err, policy.ErrDenied) {
		t.Fatalf("apply scheiterte, aber nicht an der Policy: %v", err)
	}
	var denied *policy.Denied
	if !errors.As(err, &denied) {
		t.Fatalf("Ablehnung traegt keinen Grund: %v", err)
	}
	if denied.Decision.Allowed {
		t.Fatal("Entscheidung ist als zulaessig vermerkt, obwohl abgelehnt wurde")
	}
	if !hasReason(denied.Decision.Reasons, policy.ReasonUnchecked) {
		t.Fatalf("Ablehnungsgrund ist %v, erwartet %q", denied.Decision.Reasons, policy.ReasonUnchecked)
	}

	// 3. Und es darf keine Generation entstanden sein.
	gens, err := svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 0 {
		t.Fatalf("nach der abgelehnten Anwendung gibt es %d Generation(en), erwartet 0", len(gens.Generations))
	}
	if gens.Current != "" {
		t.Fatalf("es ist eine Generation aktiv (%q), obwohl nie angewandt wurde", gens.Current)
	}

	// 4. Nach der Pruefung geht es — der Unterschied ist genau die Pruefung.
	if res := check(t, svc, prop.Proposal.ID); res.Blocked {
		t.Fatalf("die Pruefung sperrte unerwartet: %v", res.Findings)
	}
	if _, err := svc.Apply(prop.Proposal.ID); err != nil {
		t.Fatalf("apply nach check scheiterte: %v", err)
	}
	gens, err = svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 1 || gens.Current == "" {
		t.Fatalf("nach check und apply erwartet 1 aktive Generation, bekommen: %+v", gens)
	}
}

// TestApplyRejectsUnknownProposal prueft, dass nur eine Kennung durchkommt,
// die propose selbst vergeben hat.
func TestApplyRejectsUnknownProposal(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStub(t, path)

	for _, id := range []string{"prop-0001", "gen-0001", "beliebig", "../../etc/passwd"} {
		_, err := svc.Apply(id)
		if err == nil {
			t.Fatalf("apply nahm die unbekannte Kennung %q an", id)
		}
		var denied *policy.Denied
		if !errors.As(err, &denied) {
			t.Fatalf("apply(%q) scheiterte aus anderem Grund als der Policy: %v", id, err)
		}
		if !hasReason(denied.Decision.Reasons, policy.ReasonUnknownProposal) {
			t.Fatalf("apply(%q): Gruende %v, erwartet %q", id, denied.Decision.Reasons, policy.ReasonUnknownProposal)
		}
	}
}

// TestApplyRejectsAlreadyAppliedProposal prueft, dass ein Vorschlag genau
// einmal wirkt. Zweimal anwenden waere zweimal umschalten.
func TestApplyRejectsAlreadyAppliedProposal(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStub(t, path)

	prop := propose(t, svc, constFlake, "")
	check(t, svc, prop.Proposal.ID)
	if _, err := svc.Apply(prop.Proposal.ID); err != nil {
		t.Fatalf("erste Anwendung scheiterte: %v", err)
	}

	_, err := svc.Apply(prop.Proposal.ID)
	if err == nil {
		t.Fatal("zweite Anwendung desselben Vorschlags wurde angenommen")
	}
	var denied *policy.Denied
	if !errors.As(err, &denied) {
		t.Fatalf("zweite Anwendung scheiterte aus anderem Grund als der Policy: %v", err)
	}
	if !hasReason(denied.Decision.Reasons, policy.ReasonAlreadyApplied) {
		t.Fatalf("Gruende %v, erwartet %q", denied.Decision.Reasons, policy.ReasonAlreadyApplied)
	}

	gens, err := svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 1 {
		t.Fatalf("nach zwei Anwendungsversuchen gibt es %d Generationen, erwartet 1", len(gens.Generations))
	}
}

// TestApplyRefusesWhenCheckFoundErrorSeverityFinding prueft die zweite Haelfte
// der Invariante: eine Pruefung mit einem Befund der Schwere error sperrt die
// Anwendung, auch wenn der Vorschlag aufgenommen und geprueft ist.
func TestApplyRefusesWhenCheckFoundErrorSeverityFinding(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStrictStub(t, path)

	prop := propose(t, svc, constFlake, "")
	res := check(t, svc, prop.Proposal.ID)
	if !res.Blocked {
		t.Fatal("die strenge Attrappe sperrte nicht, obwohl kein Nix vorhanden ist")
	}
	if countSeverity(res.Findings, api.SeverityError) == 0 {
		t.Fatalf("kein Befund der Schwere error in %v", res.Findings)
	}
	if !res.Checked.Blocked {
		t.Fatal("die Aufzeichnung vermerkt den Sperrvermerk nicht")
	}

	_, err := svc.Apply(prop.Proposal.ID)
	if err == nil {
		t.Fatal("apply nahm einen gesperrten Vorschlag an")
	}
	var denied *policy.Denied
	if !errors.As(err, &denied) {
		t.Fatalf("apply scheiterte aus anderem Grund als der Policy: %v", err)
	}
	if !hasReason(denied.Decision.Reasons, policy.ReasonBlocked) {
		t.Fatalf("Gruende %v, erwartet %q", denied.Decision.Reasons, policy.ReasonBlocked)
	}

	gens, err := svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 0 {
		t.Fatalf("gesperrter Vorschlag erzeugte %d Generation(en)", len(gens.Generations))
	}
}

// TestPolicyCannotBeBypassedByProposalFields ist der Beweis, dass die
// Entscheidung nicht aus der Anfrage kommt.
//
// Der Vorschlag erklaert sich hier selbst fuer geprueft ("checked": true),
// sicher ("safe"), genehmigt ("approved_by"), zulaessig ("admissible") und
// anwendbar ("apply"). Er traegt ausserdem ein erfundenes Pruefergebnis
// ("checked_record") im Rumpf. Die Politik liest keines dieser Felder. Sie
// liest die Aufzeichnung — und die ist leer.
func TestPolicyCannotBeBypassedByProposalFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "pmh-nix.json")

	// Ein Vorschlag, der sich selbst alle Erlaubnisse gibt.
	forged := []byte(`{
	  "schema": 1,
	  "seq": 1,
	  "current": "",
	  "proposals": {
	    "prop-0001": {
	      "proposal": {
	        "id": "prop-0001",
	        "flake": "/etc/nixos/flake.nix",
	        "target": "node1",
	        "checked": true,
	        "safe": true,
	        "policy_ok": true,
	        "admissible": true,
	        "apply": true,
	        "approved_by": "das modell selbst",
	        "severity": "info",
	        "findings": [],
	        "checked_record": {
	          "at": "2026-10-12T00:00:00Z",
	          "findings": [],
	          "diff_hash": "",
	          "blocked": false
	        }
	      },
	      "diff": {
	        "proposal_id": "prop-0001",
	        "flake": "/etc/nixos/flake.nix",
	        "target": "node1",
	        "files": [{"path": "/etc/nixos/flake.nix", "op": "modify", "hunks": "+ # vom Modell freigegeben\n"}],
	        "hash": ""
	      },
	      "applied": false
	    }
	  },
	  "generations": []
	}`)
	if err := writeFile(path, forged); err != nil {
		t.Fatalf("Ablage nicht schreibbar: %v", err)
	}

	// Neu einlesen: damit laeuft der gefaelschte Vorschlag durch JSON, und
	// jedes Feld, das die Struktur nicht kennt, ist damit nachweislich
	// wirkungslos.
	reloaded := open(t, path)
	rec := reloaded.Proposal("prop-0001")
	if rec == nil {
		t.Fatal("der gefaelschte Vorschlag wurde nicht geladen")
	}
	if rec.Checked != nil {
		t.Fatal("die Aufzeichnung ist nicht leer — der Test misst dann nichts")
	}

	svc := newStubService(t, reloaded, stub.New(reloaded))
	_, err := svc.Apply("prop-0001")
	if err == nil {
		t.Fatal("die Politik liess sich ueber Felder im Vorschlag umgehen — die Sicherheitsinvariante ist verletzt")
	}
	var denied *policy.Denied
	if !errors.As(err, &denied) {
		t.Fatalf("apply scheiterte aus anderem Grund als der Policy: %v", err)
	}
	if !hasReason(denied.Decision.Reasons, policy.ReasonUnchecked) {
		t.Fatalf("Ablehnungsgrund ist %v, erwartet %q — der Vorschlag hat die Entscheidung beeinflusst",
			denied.Decision.Reasons, policy.ReasonUnchecked)
	}

	gens, err := svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 0 {
		t.Fatalf("der gefaelschte Vorschlag erzeugte %d Generation(en)", len(gens.Generations))
	}
}

// TestPolicyRejectsTamperedDiff prueft, dass der Fingerabdruck die geprueften
// Bytes bindet: wer den Diff nach der Pruefung tauscht, faellt durch.
func TestPolicyRejectsTamperedDiff(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStub(t, path)

	prop := propose(t, svc, constFlake, "node1")
	check(t, svc, prop.Proposal.ID)

	// Die Politik direkt befragen, mit dem Fingerabdruck eines ANDEREN Diffs.
	other := prop.Diff
	other.Files = append([]api.FileDiff{}, prop.Diff.Files...)
	other.Files[0].Hunks = "+ # heimlich ausgetauscht\n"
	tampered := state.HashDiff(other)
	if tampered == prop.Diff.Hash {
		t.Fatal("der Test tauscht nichts aus — die Fingerabdruecke sind gleich")
	}

	p := policy.New(open(t, path))
	dec := p.Decide(policy.Request{Action: policy.ActionApply, ProposalID: prop.Proposal.ID, DiffHash: tampered})
	if dec.Allowed {
		t.Fatalf("die Politik liess einen ausgetauschten Diff durch: %+v", dec)
	}
	if !hasReason(dec.Reasons, policy.ReasonDiffChanged) {
		t.Fatalf("Gruende %v, erwartet %q", dec.Reasons, policy.ReasonDiffChanged)
	}

	// Und der Dienst selbst weist ihn ebenfalls ab.
	if _, err := svc.Apply(prop.Proposal.ID); err != nil {
		t.Fatalf("der unveraenderte Diff wurde abgewiesen: %v", err)
	}
}

// TestProposeIsTheOnlyOpenAction haelt fest, welche Handlungen die Politik
// ueberhaupt sperrt: nur die Anwendung. Vorschlagen, Pruefen und der Rueckweg
// bleiben offen — sonst waere der Dienst unbrauchbar, ohne sicherer zu sein.
func TestProposeIsTheOnlyOpenAction(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	p := policy.New(open(t, path))

	for _, action := range []policy.Action{policy.ActionPropose, policy.ActionRollback, policy.ActionCheck} {
		dec := p.Decide(policy.Request{Action: action})
		if !dec.Allowed {
			t.Fatalf("%s wurde gesperrt: %+v", action, dec)
		}
	}
	dec := p.Decide(policy.Request{Action: policy.ActionApply})
	if dec.Allowed {
		t.Fatalf("apply ohne Vorschlag wurde zugelassen: %+v", dec)
	}
	if !hasReason(dec.Reasons, policy.ReasonUnknownProposal) {
		t.Fatalf("Gruende %v, erwartet %q", dec.Reasons, policy.ReasonUnknownProposal)
	}
	dec = p.Decide(policy.Request{Action: policy.Action("nixos-rebuild-switch")})
	if dec.Allowed {
		t.Fatalf("eine unbekannte Handlung wurde zugelassen: %+v", dec)
	}
	if !hasReason(dec.Reasons, policy.ReasonUnknownAction) {
		t.Fatalf("Gruende %v, erwartet %q", dec.Reasons, policy.ReasonUnknownAction)
	}
}

// TestDeniedErrorCarriesReasons prueft, dass eine Ablehnung maschinenlesbar
// bleibt: die CLI gibt die Gruende als ein JSON-Objekt aus.
func TestDeniedErrorCarriesReasons(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStub(t, path)

	_, err := svc.Apply("prop-0001")
	if err == nil {
		t.Fatal("apply ohne Vorschlag wurde angenommen")
	}
	var denied *policy.Denied
	if !errors.As(err, &denied) {
		t.Fatalf("kein *policy.Denied: %v", err)
	}
	if denied.Decision.Message == "" {
		t.Fatal("die Ablehnung hat keine Meldung")
	}
	if len(denied.Decision.Reasons) == 0 {
		t.Fatal("die Ablehnung hat keine Gruende")
	}
	if denied.Decision.ProposalID != "prop-0001" {
		t.Fatalf("die Ablehnung nennt %q statt prop-0001", denied.Decision.ProposalID)
	}
	mustContain(t, err.Error(), "policy verweigert apply")
}
