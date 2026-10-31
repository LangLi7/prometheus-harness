package tests

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation/stub"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/policy"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/service"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/state"
)

// TestApplyRejectsUncheckedProposal ist der wichtigste Test des Dienstes.
//
// Ein Vorschlag, der nur vorgeschlagen und nicht geprueft wurde, darf NICHT
// angewandt werden. Wer den Pruefbau ueberspringt, kommt nicht durch — auch
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
		t.Fatal("apply nahm einen ungeprueften Vorschlag an — die Sicherheitsinvariante ist verletzt")
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

	// 4. Nach Pruefbau UND Freigabe geht es — der Unterschied ist genau das.
	if res := check(t, svc, prop.Proposal.ID); res.Blocked {
		t.Fatalf("der Pruefbau sperrte unerwartet: %v", res.Findings)
	}
	approve(t, svc, prop.Proposal.ID, "betreiber@test")
	if _, err := svc.Apply(prop.Proposal.ID); err != nil {
		t.Fatalf("apply nach check und Freigabe scheiterte: %v", err)
	}
	gens, err = svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 1 || gens.Current == "" {
		t.Fatalf("nach check, Freigabe und apply erwartet 1 aktive Generation, bekommen: %+v", gens)
	}
}

// TestApplyRequiresRecordedApproval prueft die vierte Stufe des Vertrags.
//
// Ein Vorschlag, der vorgeschlagen UND geprueft ist, aber NICHT ausdruecklich
// freigegeben wurde, darf nicht angewandt werden. Der Betreiber hat das so
// verlangt: der Mensch sieht den Diff und gibt frei, erst dann folgt der
// Wechsel.
func TestApplyRequiresRecordedApproval(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "pmh-nix.json")
	svc := newStub(t, path)

	prop := propose(t, svc, constFlake, "node1")
	if res := check(t, svc, prop.Proposal.ID); res.Blocked {
		t.Fatalf("der Pruefbau sperrte unerwartet: %v", res.Findings)
	}

	// Ohne Freigabe: abgelehnt, mit eigenem Grund.
	_, err := svc.Apply(prop.Proposal.ID)
	if err == nil {
		t.Fatal("apply lief ohne aufgezeichnete Freigabe — die Invariante ist verletzt")
	}
	var denied *policy.Denied
	if !errors.As(err, &denied) {
		t.Fatalf("apply scheiterte aus anderem Grund als der Policy: %v", err)
	}
	if !hasReason(denied.Decision.Reasons, policy.ReasonNoApproval) {
		t.Fatalf("Ablehnungsgrund ist %v, erwartet %q", denied.Decision.Reasons, policy.ReasonNoApproval)
	}
	gens, err := svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 0 {
		t.Fatalf("ohne Freigabe entstand(en) %d Generation(en)", len(gens.Generations))
	}

	// Eine Freigabe ohne Identitaet ist keine Freigabe.
	if _, err := svc.Approve(prop.Proposal.ID, "   ", ""); err == nil {
		t.Fatal("eine Freigabe ohne Identitaet wurde angenommen")
	}

	// Eine Freigabe ohne vorherigen Pruefbau waere blind.
	second := propose(t, svc, constFlake, "node2")
	if _, err := svc.Approve(second.Proposal.ID, "betreiber@test", ""); err == nil {
		t.Fatal("eine Freigabe ohne Pruefbau wurde angenommen")
	}

	// Mit Freigabe: angewandt, und die Aufzeichnung nennt wer, wann, welchen
	// Diff und welche Basisgeneration.
	res := approve(t, svc, prop.Proposal.ID, "betreiber@test")
	if res.Approval.BaseGeneration != prop.Proposal.BaseGeneration {
		t.Fatalf("die Freigabe nennt Basisgeneration %q, der Vorschlag %q",
			res.Approval.BaseGeneration, prop.Proposal.BaseGeneration)
	}
	if res.Approval.DiffHash != prop.Diff.Hash {
		t.Fatalf("die Freigabe nennt Diff %q, erwartet %q", res.Approval.DiffHash, prop.Diff.Hash)
	}
	recorded := mustStore(t, path).Proposal(prop.Proposal.ID)
	if recorded == nil || recorded.Approval == nil {
		t.Fatal("die Freigabe steht nicht in der Ablage")
	}
	if recorded.Approval.By != "betreiber@test" || recorded.Approval.At.IsZero() {
		t.Fatalf("die aufgezeichnete Freigabe ist unvollstaendig: %+v", recorded.Approval)
	}

	applied, err := svc.Apply(prop.Proposal.ID)
	if err != nil {
		t.Fatalf("apply nach Freigabe scheiterte: %v", err)
	}
	if applied.ApprovedBy != "betreiber@test" {
		t.Fatalf("die Anwendung nennt Freigeber %q", applied.ApprovedBy)
	}
}

// TestApplyRejectsChangedDiffHash prueft das fail-closed-Verhalten bei einer
// Abweichung des Fingerabdrucks.
//
// Wer den Diff nach der Freigabe austauscht, kommt nicht durch: die Freigabe
// gilt genau fuer die Bytes, die freigegeben wurden.
func TestApplyRejectsChangedDiffHash(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStub(t, path)

	prop := propose(t, svc, constFlake, "node1")
	checkAndApprove(t, svc, prop.Proposal.ID)

	// Der Diff wird nach der Freigabe getauscht — hier in der Ablage selbst,
	// also hinter der Politik vorbei.
	store := mustStore(t, path)
	rec := store.Proposal(prop.Proposal.ID)
	if rec == nil {
		t.Fatal("der Vorschlag fehlt in der Ablage")
	}
	rec.Diff.Files[0].Hunks += "\n+ # heimlich nach der Freigabe angehaengt\n"
	if err := store.Save(); err != nil {
		t.Fatalf("Ablage nicht schreibbar: %v", err)
	}

	tampered := mustStore(t, path)
	svc2 := newStubService(t, tampered, stub.New(tampered))
	_, err := svc2.Apply(prop.Proposal.ID)
	if err == nil {
		t.Fatal("apply nahm einen nach der Freigabe getauschten Diff an")
	}
	var denied *policy.Denied
	if !errors.As(err, &denied) {
		t.Fatalf("apply scheiterte aus anderem Grund als der Policy: %v", err)
	}
	if !hasReason(denied.Decision.Reasons, policy.ReasonDiffChanged) &&
		!hasReason(denied.Decision.Reasons, policy.ReasonApprovalStale) {
		t.Fatalf("Ablehnungsgrund ist %v, erwartet %q oder %q",
			denied.Decision.Reasons, policy.ReasonDiffChanged, policy.ReasonApprovalStale)
	}

	// Und der Fingerabdruck der Freigabe passt nachweislich nicht mehr.
	rec2 := tampered.Proposal(prop.Proposal.ID)
	if rec2.Approval == nil {
		t.Fatal("die Freigabe ist verschwunden")
	}
	if rec2.Approval.DiffHash == state.HashDiff(rec2.Diff) {
		t.Fatal("der Test tauscht nichts aus — die Fingerabdruecke sind gleich")
	}

	// Kein zweiter Vorschlag, keine Generation.
	gens, err := svc2.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 0 {
		t.Fatalf("der getauschte Diff erzeugte %d Generation(en)", len(gens.Generations))
	}
}

// TestProposeNeverActivates prueft, dass propose nichts aktiviert und nichts
// am System beruehrt.
//
// Der Haken OnActivate wird nur von Apply gerufen. Die Attrappe schreibt
// ausserdem nur ihre eigene Buchfuehrung: es entsteht keine Datei ausserhalb
// der Ablage.
func TestProposeNeverActivates(t *testing.T) {
	dir := t.TempDir()
	work := filepath.Join(dir, "work")
	if err := mkdirAll(work); err != nil {
		t.Fatalf("Arbeitsordner nicht anlegbar: %v", err)
	}
	statePath := filepath.Join(dir, "state", "pmh-nix.json")

	store := open(t, statePath)
	backend := stub.New(store)
	activations := 0
	backend.OnActivate = func(api.Diff) { activations++ }
	svc := newStubService(t, store, backend)

	prop := propose(t, svc, constFlake, "node1")
	if res := check(t, svc, prop.Proposal.ID); res.Blocked {
		t.Fatalf("der Pruefbau sperrte unerwartet: %v", res.Findings)
	}
	approve(t, svc, prop.Proposal.ID, "betreiber@test")

	if activations != 0 {
		t.Fatalf("propose, check oder approve haben aktiviert (%d Aufrufe) — sie duerfen das nie", activations)
	}
	gens, err := svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 0 {
		t.Fatalf("ohne apply gibt es %d Generation(en)", len(gens.Generations))
	}
	// Der Arbeitsordner ist leer geblieben: der Branch ist ein Datensatz.
	entries := mustReadDir(t, work)
	if len(entries) != 0 {
		t.Fatalf("propose hinterliess %d Eintrag/Eintraege: %v", len(entries), entries)
	}

	// Erst die Activation ruft den Haken — der Unterschied ist der Punkt.
	if _, err := svc.Apply(prop.Proposal.ID); err != nil {
		t.Fatalf("apply scheiterte: %v", err)
	}
	if activations != 1 {
		t.Fatalf("apply rief den Haken %d mal, erwartet 1", activations)
	}
}

// TestRollbackReturnsToRecordedGeneration prueft den Rueckweg: er fuehrt auf
// eine AUFGEZEICHNETE Generation, nicht auf eine wiederhergestellte, und eine
// geratene Kennung wird abgewiesen.
func TestRollbackReturnsToRecordedGeneration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStub(t, path)

	first := propose(t, svc, constFlake, "node1")
	checkAndApprove(t, svc, first.Proposal.ID)
	appliedFirst, err := svc.Apply(first.Proposal.ID)
	if err != nil {
		t.Fatalf("erste Anwendung scheiterte: %v", err)
	}

	second := proposeIn(t, svc, api.ModeLocal, constFlake, "node2")
	// Der zweite Vorschlag beruht auf der ersten Generation — das ist die
	// aufgezeichnete Basis.
	if second.Proposal.BaseGeneration != appliedFirst.Generation.ID {
		t.Fatalf("Basisgeneration des zweiten Vorschlags ist %q, erwartet %q",
			second.Proposal.BaseGeneration, appliedFirst.Generation.ID)
	}
	checkAndApprove(t, svc, second.Proposal.ID)
	appliedSecond, err := svc.Apply(second.Proposal.ID)
	if err != nil {
		t.Fatalf("zweite Anwendung scheiterte: %v", err)
	}

	// Rueckweg auf die aufgezeichnete erste Generation.
	back, err := svc.Rollback(appliedFirst.Generation.ID)
	if err != nil {
		t.Fatalf("rollback scheiterte: %v", err)
	}
	if back.From != appliedSecond.Generation.ID {
		t.Fatalf("der Rueckweg nennt als Ausgang %q, erwartet %q", back.From, appliedSecond.Generation.ID)
	}
	if back.Generation.ID != appliedFirst.Generation.ID || !back.Generation.Current {
		t.Fatalf("der Rueckweg landete nicht auf der Zielgeneration: %+v", back)
	}
	gens, err := svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if gens.Current != appliedFirst.Generation.ID {
		t.Fatalf("nach dem Rueckweg ist %q aktiv, erwartet %q", gens.Current, appliedFirst.Generation.ID)
	}
	// Der Rueckweg schaltet um, er stellt nicht wieder her: beide Generationen
	// liegen weiterhin vor.
	if len(gens.Generations) != 2 {
		t.Fatalf("der Rueckweg veraenderte die Zahl der Generationen: %d", len(gens.Generations))
	}
	for _, g := range gens.Generations {
		if !stub.IsSimulatedGeneration(g) {
			t.Fatalf("die Generation %s ist nicht als Attrappe gekennzeichnet", g.ID)
		}
	}

	// Eine geratene Kennung wird abgewiesen.
	if _, err := svc.Rollback("gen-9999"); err == nil {
		t.Fatal("rollback auf eine nicht aufgezeichnete Generation gelang")
	} else if !errors.Is(err, actuation.ErrNoGeneration) {
		t.Fatalf("die Ablehnung ist nicht als unbekannte Generation erkennbar: %v", err)
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
	checkAndApprove(t, svc, prop.Proposal.ID)
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
// der Invariante: ein Pruefbau mit einem Befund der Schwere error sperrt die
// Anwendung, auch wenn der Vorschlag aufgenommen und geprueft ist — und eine
// Freigabe ist dann gar nicht erst moeglich.
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
	if _, err := svc.Approve(prop.Proposal.ID, "betreiber@test", ""); err == nil {
		t.Fatal("ein gesperrter Vorschlag wurde freigegeben")
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
// sicher ("safe"), genehmigt ("approved": true, "approved_by") und anwendbar
// ("apply"). Er traegt ausserdem ein erfundenes Pruefergebnis und eine
// erfundene Freigabe im Rumpf. Die Politik liest keines dieser Felder. Sie
// liest die Aufzeichnung — und die ist leer.
func TestPolicyCannotBeBypassedByProposalFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "pmh-nix.json")

	// Ein Vorschlag, der sich selbst alle Erlaubnisse gibt.
	forged := []byte(`{
	  "schema": 2,
	  "seq": 1,
	  "current": "",
	  "proposals": {
	    "prop-0001": {
	      "proposal": {
	        "id": "prop-0001",
	        "mode": "local",
	        "flake": "/etc/nixos/flake.nix",
	        "target": "node1",
	        "branch": {"name": "local/agent-node1", "commit": "commit:abc123abc123", "base": "HEAD", "push": false},
	        "checked": true,
	        "safe": true,
	        "policy_ok": true,
	        "admissible": true,
	        "apply": true,
	        "approved": true,
	        "approved_by": "das modell selbst",
	        "severity": "info",
	        "categories": [],
	        "findings": [],
	        "checked_record": {
	          "at": "2026-10-12T00:00:00Z",
	          "findings": [],
	          "diff_hash": "",
	          "blocked": false
	        },
	        "approval": {
	          "by": "das modell selbst",
	          "at": "2026-10-12T00:00:00Z",
	          "diff_hash": "",
	          "base_generation": ""
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
		t.Fatal("die Pruefaufzeichnung ist nicht leer — der Test misst dann nichts")
	}
	if rec.Approval != nil {
		t.Fatal("die Freigabeaufzeichnung ist nicht leer — der Test misst dann nichts")
	}
	if rec.Proposal.Branch.Name == "" {
		t.Fatal("der Branch wurde nicht geladen — der Test misst dann nichts")
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

	// Auch eine erfundene Freigabe im Rumpf hilft nicht: die Aufzeichnung
	// bleibt leer.
	if _, err := svc.Approve("prop-0001", "betreiber@test", ""); err == nil {
		t.Fatal("approve nahm einen Vorschlag ohne Pruefbau an")
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
// Bytes bindet: wer den Diff nach dem Pruefbau tauscht, faellt durch.
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

	// Und der Dienst selbst weist ihn ebenfalls ab — weil die Freigabe fehlt.
	if _, err := svc.Apply(prop.Proposal.ID); err == nil {
		t.Fatal("apply ohne Freigabe gelang")
	}
	approve(t, svc, prop.Proposal.ID, "betreiber@test")
	if _, err := svc.Apply(prop.Proposal.ID); err != nil {
		t.Fatalf("der unveraenderte Diff wurde abgewiesen: %v", err)
	}
}

// TestProposeIsTheOnlyOpenAction haelt fest, welche Handlungen die Politik
// ueberhaupt sperrt: nur die Anwendung. Vorschlagen, Pruefen, Freigeben und der
// Rueckweg bleiben offen — sonst waere der Dienst unbrauchbar, ohne sicherer zu
// sein.
func TestProposeIsTheOnlyOpenAction(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	p := policy.New(open(t, path))

	for _, action := range []policy.Action{
		policy.ActionPropose, policy.ActionRollback, policy.ActionCheck, policy.ActionApprove,
	} {
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

// ---------------------------------------------------------------------------
// Sachkategorien, Klartext-Geheimnisse und Betriebsarten
// ---------------------------------------------------------------------------

// TestClassifyRecognisesRestrictedCategories prueft die Zuordnung
// Pfad -> Kategorie. Sie ist die Grundlage der strengeren Stufe.
func TestClassifyRecognisesRestrictedCategories(t *testing.T) {
	cases := []struct {
		path string
		want api.Category
	}{
		{"/etc/nixos/configuration.nix", api.CategoryGeneral},
		{"/etc/nixos/packages.nix", api.CategoryGeneral},
		{"/etc/nixos/networking.nix", api.CategoryNetwork},
		{"/etc/nixos/modules/network/firewall.nix", api.CategoryNetwork},
		{"/etc/nixos/users.nix", api.CategoryUsers},
		{"/etc/nixos/modules/users/alice.nix", api.CategoryUsers},
		{"/etc/nixos/secrets/secrets.nix", api.CategorySecrets},
		{"/etc/nixos/modules/sops.nix", api.CategorySecrets},
		{"/etc/nixos/hosts/pi5/tailscale.nix", api.CategoryNetwork},
	}
	for _, c := range cases {
		got := actuation.Classify(api.Diff{Files: []api.FileDiff{{Path: c.path, Op: "modify", Hunks: "+ # nur ein Kommentar\n"}}})
		if len(got) != 1 || got[0] != c.want {
			t.Fatalf("%s wurde als %v eingeordnet, erwartet %s", c.path, got, c.want)
		}
		if c.want.Restricted() && !policy.HasRestricted(got) {
			t.Fatalf("%s: die strenge Stufe wurde nicht erkannt", c.path)
		}
		if !c.want.Restricted() && policy.HasRestricted(got) {
			t.Fatalf("%s: der allgemeine Fall wurde als streng eingeordnet", c.path)
		}
	}

	// Ein Klartext-Geheimnis macht auch einen allgemeinen Pfad zur
	// Geheimnis-Aenderung.
	diff := api.Diff{Files: []api.FileDiff{{
		Path:  "/etc/nixos/configuration.nix",
		Op:    "modify",
		Hunks: "+\tadminPassword = \"geheim123\"\n",
	}}}
	if got := actuation.Classify(diff); len(got) != 1 || got[0] != api.CategorySecrets {
		t.Fatalf("Klartext-Geheimnis wurde als %v eingeordnet, erwartet secrets", got)
	}
}

// TestCheckReportsPlaintextSecretAsError prueft Betreiber-Vorgabe G4: ein
// Klartext-Geheimnis in der Konfiguration ist ein Befund der Schwere ERROR,
// kein Hinweis.
func TestCheckReportsPlaintextSecretAsError(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStub(t, path)

	prop := propose(t, svc, constFlake, "node1")

	// Der Diff wird um ein Klartext-Geheimnis erweitert — so, wie es ein
	// unvorsichtiger Vorschlag taete.
	store := mustStore(t, path)
	rec := store.Proposal(prop.Proposal.ID)
	if rec == nil {
		t.Fatal("der Vorschlag fehlt in der Ablage")
	}
	rec.Diff.Files = append(rec.Diff.Files, api.FileDiff{
		Path:  "/etc/nixos/configuration.nix",
		Op:    "modify",
		Hunks: "+\tservices.postgresql.initialPassword = \"hunter2-geheim\"\n",
	})
	rec.Diff.Hash = state.HashDiff(rec.Diff)
	if err := store.Save(); err != nil {
		t.Fatalf("Ablage nicht schreibbar: %v", err)
	}

	reloaded := mustStore(t, path)
	svc2 := newStubService(t, reloaded, stub.New(reloaded))
	res := check(t, svc2, prop.Proposal.ID)

	var found bool
	for _, f := range res.Findings {
		if f.Code == "secret-im-klartext" {
			found = true
			if f.Severity != api.SeverityError {
				t.Fatalf("das Klartext-Geheimnis wird als %q gemeldet, erwartet %q", f.Severity, api.SeverityError)
			}
			mustContain(t, f.Message, "sops-nix")
			mustContain(t, f.Message, "agenix")
		}
	}
	if !found {
		t.Fatalf("kein Befund zum Klartext-Geheimnis in %v", res.Findings)
	}
	if !res.Blocked {
		t.Fatal("ein Klartext-Geheimnis sperrte den Pruefbau nicht")
	}
	if !policy.HasRestricted(res.Categories) {
		t.Fatalf("die Kategorie wurde nicht als streng erkannt: %v", res.Categories)
	}

	// Ein gesperrter Vorschlag laesst sich nicht freigeben und nicht anwenden.
	if _, err := svc2.Approve(prop.Proposal.ID, "betreiber@test", ""); err == nil {
		t.Fatal("ein Vorschlag mit Klartext-Geheimnis wurde freigegeben")
	}
	if _, err := svc2.Apply(prop.Proposal.ID); err == nil {
		t.Fatal("ein Vorschlag mit Klartext-Geheimnis wurde angewandt")
	}
	gens, err := svc2.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 0 {
		t.Fatalf("es entstand(en) %d Generation(en)", len(gens.Generations))
	}
}

// TestSopsReferenceIsNotAFinding prueft die Gegenprobe: der VORGESEHENE Weg
// darf nicht bestraft werden. Ein Verweis auf sops-nix oder agenix ist kein
// Befund.
func TestSopsReferenceIsNotAFinding(t *testing.T) {
	hunks := `+  sops.secrets."db/password" = {};
+  services.postgresql.initialPassword = config.sops.secrets."db/password".path;
+  services.foo.apiKey = config.sops.secrets."foo/key".path;
+  users.users.alice.hashedPasswordFile = config.sops.secrets."alice/pw".path;
+  environment.variables.TOKEN = builtins.getEnv "PMH_TOKEN";
`
	if line := actuation.PlaintextSecretIn(hunks); line != "" {
		t.Fatalf("der vorgesehene Weg wurde als Klartext-Geheimnis gemeldet: %q", line)
	}
	if findings := actuation.SecretFindings(api.Diff{Files: []api.FileDiff{{
		Path: "/etc/nixos/secrets/secrets.nix", Op: "modify", Hunks: hunks,
	}}}); len(findings) != 0 {
		t.Fatalf("der vorgesehene Weg erzeugte %d Befund(e)", len(findings))
	}

	// Ein privater Schluessel im Klartext bleibt ein Befund.
	if line := actuation.PlaintextSecretIn("+  -----BEGIN OPENSSH PRIVATE KEY-----\n"); line == "" {
		t.Fatal("ein eingebetteter privater Schluessel wurde nicht erkannt")
	}
	// Ebenso ein bekanntes Token-Format.
	if line := actuation.PlaintextSecretIn("+  token = \"ghp_abcdefghijklmnopqrstuvwx\"\n"); line == "" {
		t.Fatal("ein eingebettetes Token wurde nicht erkannt")
	}
	// Und ein entferntes Geheimnis ist kein neues Geheimnis.
	if line := actuation.PlaintextSecretIn("-  adminPassword = \"alt-geheim\"\n"); line != "" {
		t.Fatalf("eine entfernte Zeile wurde als Befund gemeldet: %q", line)
	}
}

// TestRestrictedCategoryNeedsExplicitApproval prueft Betreiber-Vorgabe G3: die
// drei Kategorien Netzwerk, Nutzerrechte und Geheimnisse bekommen eine EIGENE,
// strengere Stufe. Ohne ausdrueckliche Freigabe laeuft dort nichts — die
// allgemeine Branch-Regel genuegt nicht.
func TestRestrictedCategoryNeedsExplicitApproval(t *testing.T) {
	cases := []struct {
		name  string
		path  string
		hunks string
		want  api.Category
	}{
		{"netzwerk", "/etc/nixos/networking.nix", "+\tnetworking.firewall.allowedTCPPorts = [ 22 ];\n", api.CategoryNetwork},
		{"nutzer", "/etc/nixos/users.nix", "+\tusers.users.agent = { isNormalUser = true; };\n", api.CategoryUsers},
		{"geheimnis", "/etc/nixos/secrets/db.nix", "+\tsops.secrets.\"db\" = {};\n", api.CategorySecrets},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "pmh-nix.json")
			svc := newStub(t, path)

			prop := propose(t, svc, constFlake, "node1")
			// Der Diff wird auf die strenge Kategorie umgebogen.
			store := mustStore(t, path)
			rec := store.Proposal(prop.Proposal.ID)
			rec.Diff.Files = []api.FileDiff{{Path: c.path, Op: "modify", Hunks: c.hunks}}
			rec.Diff.Hash = state.HashDiff(rec.Diff)
			if err := store.Save(); err != nil {
				t.Fatalf("Ablage nicht schreibbar: %v", err)
			}
			reloaded := mustStore(t, path)
			svc2 := newStubService(t, reloaded, stub.New(reloaded))

			res := check(t, svc2, prop.Proposal.ID)
			if !policy.HasRestricted(res.Categories) {
				t.Fatalf("die Kategorie wurde nicht erkannt: %v", res.Categories)
			}
			if len(res.Restricted) == 0 || res.Restricted[0] != c.want {
				t.Fatalf("die strenge Kategorie ist %v, erwartet %s", res.Restricted, c.want)
			}
			if res.Blocked {
				t.Fatalf("die strenge Kategorie sperrte wie ein Fehler: %v", res.Findings)
			}

			// 1. Ohne Freigabe: abgelehnt, mit dem Grund der strengen Stufe.
			_, err := svc2.Apply(prop.Proposal.ID)
			if err == nil {
				t.Fatalf("%s wurde ohne Freigabe angewandt", c.name)
			}
			var denied *policy.Denied
			if !errors.As(err, &denied) {
				t.Fatalf("%s scheiterte aus anderem Grund als der Policy: %v", c.name, err)
			}
			if !hasReason(denied.Decision.Reasons, policy.ReasonNoApproval) {
				t.Fatalf("%s: Gruende %v, erwartet %q", c.name, denied.Decision.Reasons, policy.ReasonNoApproval)
			}
			if !hasReason(denied.Decision.Reasons, policy.ReasonRestrictedCategory) {
				t.Fatalf("%s: die strengere Stufe wurde nicht benannt: %v", c.name, denied.Decision.Reasons)
			}
			mustContain(t, denied.Decision.Message, "Freigabe")

			gens, err := svc2.Generations()
			if err != nil {
				t.Fatalf("generations scheiterte: %v", err)
			}
			if len(gens.Generations) != 0 {
				t.Fatalf("%s: es entstand(en) %d Generation(en)", c.name, len(gens.Generations))
			}

			// 2. Mit ausdruecklicher Freigabe: erlaubt. Die strenge Stufe
			// verlangt eine Freigabe, sie verbietet die Aenderung nicht.
			approve(t, svc2, prop.Proposal.ID, "betreiber@test")
			applied, err := svc2.Apply(prop.Proposal.ID)
			if err != nil {
				t.Fatalf("%s: apply nach Freigabe scheiterte: %v", c.name, err)
			}
			if applied.Generation.ID == "" {
				t.Fatalf("%s: keine Generation entstanden", c.name)
			}
		})
	}
}

// TestRestrictedCategoriesAreNamedInTheCheck prueft, dass der Pruefbau die
// strenge Kategorie sichtbar macht, statt sie stillschweigend zu fuehren.
func TestRestrictedCategoriesAreNamedInTheCheck(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStub(t, path)

	prop := propose(t, svc, constFlake, "node1")
	store := mustStore(t, path)
	rec := store.Proposal(prop.Proposal.ID)
	rec.Diff.Files = []api.FileDiff{{Path: "/etc/nixos/networking.nix", Op: "modify", Hunks: "+\tnetworking.hostName = \"pi5\";\n"}}
	rec.Diff.Hash = state.HashDiff(rec.Diff)
	if err := store.Save(); err != nil {
		t.Fatalf("Ablage nicht schreibbar: %v", err)
	}
	reloaded := mustStore(t, path)
	svc2 := newStubService(t, reloaded, stub.New(reloaded))

	res := check(t, svc2, prop.Proposal.ID)
	var named bool
	for _, f := range res.Findings {
		if f.Code == "strengere-kategorie" {
			named = true
			mustContain(t, f.Message, "network")
		}
	}
	if !named {
		t.Fatalf("die strenge Kategorie wurde im Pruefbau nicht benannt: %v", res.Findings)
	}
	mustContain(t, res.Message, "network")
	// Die Aufzeichnung traegt die Kategorien, damit die Politik sie ohne
	// erneutes Lesen des Diffs sieht.
	if len(res.Checked.Categories) == 0 {
		t.Fatal("die Aufzeichnung traegt keine Kategorien")
	}
}

// TestModeLocalAndRemote verhalten sich gleich im Vertrag und verschieden im
// Ort: local arbeitet auf dem Flake im Repository, remote auf einem Branch im
// Git-Repository mit Push.
func TestModeLocalAndRemote(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStub(t, path)

	local := proposeIn(t, svc, api.ModeLocal, constFlake, "node1")
	if local.Proposal.Mode != api.ModeLocal {
		t.Fatalf("die Betriebsart ist %q, erwartet %q", local.Proposal.Mode, api.ModeLocal)
	}
	if local.Branch.Push {
		t.Fatal("die lokale Betriebsart pusht")
	}
	if !strings.HasPrefix(local.Branch.Name, "local/") {
		t.Fatalf("der lokale Branch heisst %q", local.Branch.Name)
	}

	remote := proposeIn(t, svc, api.ModeRemote, constFlake, "pi5")
	if remote.Proposal.Mode != api.ModeRemote {
		t.Fatalf("die Betriebsart ist %q, erwartet %q", remote.Proposal.Mode, api.ModeRemote)
	}
	if !remote.Branch.Push {
		t.Fatal("die entfernte Betriebsart pusht nicht")
	}
	if !strings.HasPrefix(remote.Branch.Name, "agent/nixos-") {
		t.Fatalf("der entfernte Branch heisst %q", remote.Branch.Name)
	}
	if remote.Branch.Base != "main" {
		t.Fatalf("der entfernte Branch zweigt von %q ab, erwartet main", remote.Branch.Base)
	}

	// Beide Betriebsarten laufen durch dasselbe Interface und denselben
	// Vertrag.
	for _, prop := range []service.ProposeResult{local, remote} {
		checkAndApprove(t, svc, prop.Proposal.ID)
		if _, err := svc.Apply(prop.Proposal.ID); err != nil {
			t.Fatalf("%s: apply scheiterte: %v", prop.Proposal.Mode, err)
		}
	}
	gens, err := svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 2 {
		t.Fatalf("erwartet 2 Generationen, bekommen %d", len(gens.Generations))
	}
	modes := map[api.Mode]bool{}
	for _, g := range gens.Generations {
		modes[g.Mode] = true
	}
	if !modes[api.ModeLocal] || !modes[api.ModeRemote] {
		t.Fatalf("die Generationen tragen die Betriebsarten nicht: %v", modes)
	}
}

// TestApprovalIsInvalidatedByNewCheck prueft, dass eine Freigabe genau fuer die
// freigegebenen Bytes gilt: ein neuer Pruefbau ueber einen anderen Diff nimmt
// sie zurueck.
func TestApprovalIsInvalidatedByNewCheck(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStub(t, path)

	prop := propose(t, svc, constFlake, "node1")
	checkAndApprove(t, svc, prop.Proposal.ID)

	// Der Diff wird ausgetauscht, dann erneut geprueft.
	store := mustStore(t, path)
	rec := store.Proposal(prop.Proposal.ID)
	rec.Diff.Files[0].Hunks += "\n+ # nach der Freigabe ergaenzt\n"
	rec.Diff.Hash = state.HashDiff(rec.Diff)
	if err := store.Save(); err != nil {
		t.Fatalf("Ablage nicht schreibbar: %v", err)
	}
	reloaded := mustStore(t, path)
	svc2 := newStubService(t, reloaded, stub.New(reloaded))

	if res := check(t, svc2, prop.Proposal.ID); res.Blocked {
		t.Fatalf("der Pruefbau sperrte unerwartet: %v", res.Findings)
	}
	rec2 := reloaded.Proposal(prop.Proposal.ID)
	if rec2.Approval != nil {
		t.Fatalf("die Freigabe ueberlebte einen Pruefbau ueber einen anderen Diff: %+v", rec2.Approval)
	}

	_, err := svc2.Apply(prop.Proposal.ID)
	if err == nil {
		t.Fatal("apply ohne gueltige Freigabe gelang")
	}
	var denied *policy.Denied
	if !errors.As(err, &denied) {
		t.Fatalf("apply scheiterte aus anderem Grund als der Policy: %v", err)
	}
	if !hasReason(denied.Decision.Reasons, policy.ReasonNoApproval) {
		t.Fatalf("Gruende %v, erwartet %q", denied.Decision.Reasons, policy.ReasonNoApproval)
	}
}

// TestApplyRejectsStaleBaseGeneration prueft, dass eine Anwendung fail-closed
// ablehnt, wenn die Basisgeneration nicht mehr aktiv ist: der Vorschlag ist
// dann auf einem veralteten Stand gebaut.
func TestApplyRejectsStaleBaseGeneration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStub(t, path)

	// Erste Generation erzeugen: sie ist danach die Basis des zweiten
	// Vorschlags.
	first := propose(t, svc, constFlake, "node1")
	checkAndApprove(t, svc, first.Proposal.ID)
	appliedFirst, err := svc.Apply(first.Proposal.ID)
	if err != nil {
		t.Fatalf("erste Anwendung scheiterte: %v", err)
	}

	second := propose(t, svc, constFlake, "node2")
	if second.Proposal.BaseGeneration != appliedFirst.Generation.ID {
		t.Fatalf("die Basis des zweiten Vorschlags ist %q, erwartet %q",
			second.Proposal.BaseGeneration, appliedFirst.Generation.ID)
	}
	checkAndApprove(t, svc, second.Proposal.ID)

	// Eine dritte Generation entsteht und wird angewandt: der Zustand des
	// Systems hat sich damit gegenueber der Basis des zweiten Vorschlags
	// bewegt.
	third := propose(t, svc, constFlake, "node3")
	checkAndApprove(t, svc, third.Proposal.ID)
	appliedThird, err := svc.Apply(third.Proposal.ID)
	if err != nil {
		t.Fatalf("dritte Anwendung scheiterte: %v", err)
	}

	// Zurueck auf die erste Generation — die dritte bleibt aufgezeichnet.
	if _, err := svc.Rollback(appliedFirst.Generation.ID); err != nil {
		t.Fatalf("rollback scheiterte: %v", err)
	}

	// Jetzt wird die Aktivierung der dritten Generation wiederhergestellt,
	// damit die Basis des zweiten Vorschlags nachweislich NICHT mehr aktiv ist.
	// (Ein Rollback auf die eigene Vorgaengergeneration waere ein Nullschritt;
	// deshalb wird hier die Schalterstellung direkt gesetzt.)
	if _, err := svc.Rollback(appliedThird.Generation.ID); err != nil {
		t.Fatalf("rollback scheiterte: %v", err)
	}
	gens, err := svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if gens.Current == second.Proposal.BaseGeneration {
		t.Fatalf("der Test stellt nichts um: aktiv ist weiterhin die Basis %q", gens.Current)
	}
	if gens.Current != appliedThird.Generation.ID {
		t.Fatalf("aktiv ist %q, erwartet %q", gens.Current, appliedThird.Generation.ID)
	}

	_, err = svc.Apply(second.Proposal.ID)
	if err == nil {
		t.Fatal("apply lief, obwohl die Basisgeneration nicht mehr aktiv ist")
	}
	var denied *policy.Denied
	if !errors.As(err, &denied) {
		t.Fatalf("apply scheiterte aus anderem Grund als der Policy: %v", err)
	}
	if !hasReason(denied.Decision.Reasons, policy.ReasonBaseGenerationChanged) {
		t.Fatalf("Gruende %v, erwartet %q", denied.Decision.Reasons, policy.ReasonBaseGenerationChanged)
	}
	mustContain(t, denied.Decision.Message, "neu gebaut")
}
