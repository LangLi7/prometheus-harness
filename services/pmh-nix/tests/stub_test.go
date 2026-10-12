package tests

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation/stub"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/state"
)

// TestStubDetectReportsUnavailableHonestly prueft, dass die Attrappe die
// Wahrheit sagt: echte Actuation ist hier nicht moeglich, und sie nennt den
// Grund.
func TestStubDetectReportsUnavailableHonestly(t *testing.T) {
	store := open(t, filepath.Join(t.TempDir(), "pmh-nix.json"))
	backend := stub.New(store)
	backend.LookPath = func(string) (string, error) { return "", os.ErrNotExist }

	cap, err := backend.Detect()
	if err != nil {
		t.Fatalf("detect scheiterte: %v", err)
	}
	if cap.Available {
		t.Fatal("die Attrappe meldet sich als verfuegbar — sie aendert aber nichts")
	}
	if cap.Reason != stub.ReasonNoNix {
		t.Fatalf("Grund ist %q, erwartet %q", cap.Reason, stub.ReasonNoNix)
	}
	if cap.Backend != stub.Name {
		t.Fatalf("Backend ist %q, erwartet %q", cap.Backend, stub.Name)
	}
	if len(cap.Details) == 0 {
		t.Fatal("detect nennt keine Einzelheiten")
	}
	mustContain(t, strings.Join(cap.Details, " | "), "aendert nichts am System")
}

// TestStubNeverAppliesDuringDetect prueft, dass Detect nichts veraendert: die
// Ablage bleibt unberuehrt.
func TestStubNeverAppliesDuringDetect(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state", "pmh-nix.json")
	store := open(t, path)
	backend := stub.New(store)
	backend.LookPath = func(string) (string, error) { return "", os.ErrNotExist }

	for i := 0; i < 3; i++ {
		if _, err := backend.Detect(); err != nil {
			t.Fatalf("detect scheiterte: %v", err)
		}
	}
	if _, err := backend.Generations(); err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("die Ablage wurde angelegt (%v) — detect und generations sind lesend", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("Verzeichnis nicht lesbar: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("es sind Dateien entstanden: %v", entries)
	}
}

// TestStubRunsTheWholeContract ist der Nachweis, dass der Vertrag ohne
// installiertes Nix vollstaendig durchlaeuft: Vorschlag -> Pruefung ->
// Anwendung -> Generation -> Rueckweg.
func TestStubRunsTheWholeContract(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "pmh-nix.json")
	svc := newStub(t, path)

	// 1. Vorschlag.
	first := propose(t, svc, constFlake, "node1")
	if first.Diff.Hash == "" {
		t.Fatal("der Diff traegt keinen Fingerabdruck")
	}
	if len(first.Diff.Files) == 0 || !strings.Contains(first.Diff.Files[0].Hunks, "nicht angewandt") {
		t.Fatalf("der Diff beschreibt die Aenderung nicht: %+v", first.Diff)
	}

	// 2. Pruefung.
	checked := check(t, svc, first.Proposal.ID)
	if checked.Blocked {
		t.Fatalf("die Simulationsbetriebsart sperrte: %v", checked.Findings)
	}
	if countSeverity(checked.Findings, api.SeverityError) != 0 {
		t.Fatalf("die Simulation lieferte einen sperrenden Befund: %v", checked.Findings)
	}
	if countSeverity(checked.Findings, api.SeverityInfo) < 1 {
		t.Fatalf("die Simulation meldet nicht, dass sie nichts anwendet: %v", checked.Findings)
	}

	// 3. Anwendung.
	applied, err := svc.Apply(first.Proposal.ID)
	if err != nil {
		t.Fatalf("apply scheiterte: %v", err)
	}
	if applied.Generation.ID == "" {
		t.Fatal("apply lieferte keine Generation")
	}
	if !stub.IsSimulatedGeneration(applied.Generation) {
		t.Fatalf("die Generation ist nicht als Attrappe gekennzeichnet: %+v", applied.Generation)
	}
	mustContain(t, applied.Generation.Note, "nur Buchfuehrung")

	// 4. Zweite Generation.
	second := propose(t, svc, constFlake, "node2")
	check(t, svc, second.Proposal.ID)
	applied2, err := svc.Apply(second.Proposal.ID)
	if err != nil {
		t.Fatalf("zweites apply scheiterte: %v", err)
	}

	// 5. Generationen: neueste zuerst, genau eine aktiv.
	gens, err := svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens.Generations) != 2 {
		t.Fatalf("erwartet 2 Generationen, bekommen %d", len(gens.Generations))
	}
	if gens.Generations[0].ID != applied2.Generation.ID {
		t.Fatalf("die neueste Generation steht nicht vorn: %v", gens.Generations)
	}
	current := 0
	for _, g := range gens.Generations {
		if g.Current {
			current++
		}
	}
	if current != 1 {
		t.Fatalf("es sind %d Generationen als aktiv markiert, erwartet 1", current)
	}
	if gens.Current != applied2.Generation.ID {
		t.Fatalf("aktiv ist %q, erwartet %q", gens.Current, applied2.Generation.ID)
	}

	// 6. Rueckweg: ein Umschalten, keine Wiederherstellung.
	back, err := svc.Rollback(applied.Generation.ID)
	if err != nil {
		t.Fatalf("rollback scheiterte: %v", err)
	}
	if back.From != applied2.Generation.ID {
		t.Fatalf("der Rueckweg nennt als Ausgang %q, erwartet %q", back.From, applied2.Generation.ID)
	}
	if back.Generation.ID != applied.Generation.ID || !back.Generation.Current {
		t.Fatalf("der Rueckweg landete nicht auf der Zielgeneration: %+v", back)
	}
	gens, err = svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if gens.Current != applied.Generation.ID {
		t.Fatalf("nach dem Rueckweg ist %q aktiv, erwartet %q", gens.Current, applied.Generation.ID)
	}
	if len(gens.Generations) != 2 {
		t.Fatalf("der Rueckweg veraenderte die Zahl der Generationen: %d", len(gens.Generations))
	}
}

// TestStubRollbackRejectsUnknownGeneration prueft, dass der Rueckweg nur auf
// vorhandene Generationen fuehrt.
func TestStubRollbackRejectsUnknownGeneration(t *testing.T) {
	svc := newStub(t, filepath.Join(t.TempDir(), "pmh-nix.json"))
	_, err := svc.Rollback("gen-9999")
	if err == nil {
		t.Fatal("rollback auf eine unbekannte Generation gelang")
	}
	if !strings.Contains(err.Error(), "gen-9999") {
		t.Fatalf("der Fehler nennt die Generation nicht: %v", err)
	}
}

// TestStubStrictModeRefusesEverything prueft die zweite Betriebsart: sobald
// sich die Attrappe fuer unverfuegbar erklaert, verweigert sie jede Anwendung.
func TestStubStrictModeRefusesEverything(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	svc := newStrictStub(t, path)

	prop := propose(t, svc, constFlake, "")
	res := check(t, svc, prop.Proposal.ID)
	if !res.Blocked {
		t.Fatal("die strenge Betriebsart sperrte nicht")
	}
	if _, err := svc.Apply(prop.Proposal.ID); err == nil {
		t.Fatal("die strenge Betriebsart wandte trotzdem an")
	}

	// Die Attrappe selbst, ohne Politik: sie muss ebenfalls verweigern.
	store := open(t, path)
	backend := stub.New(store)
	backend.Strict = true
	if _, err := backend.Apply(prop.Diff); err == nil {
		t.Fatal("das Backend wandte an, obwohl seine eigene Pruefung sperrt")
	} else if !errorsIsUnavailable(err) {
		t.Fatalf("die Verweigerung ist nicht als Nichtverfuegbarkeit erkennbar: %v", err)
	}
	gens, err := backend.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	if len(gens) != 0 {
		t.Fatalf("die strenge Betriebsart erzeugte %d Generation(en)", len(gens))
	}
}

// TestStubPersistsAtomicallyAndSurvivesReload prueft die Ablage: atomar
// geschrieben, ohne Reste, und nach dem Neuladen identisch.
func TestStubPersistsAtomicallyAndSurvivesReload(t *testing.T) {
	dir := t.TempDir()
	stateDir := filepath.Join(dir, "state")
	path := filepath.Join(stateDir, "pmh-nix.json")

	svc := newStub(t, path)
	prop := propose(t, svc, constFlake, "node1")
	check(t, svc, prop.Proposal.ID)
	applied, err := svc.Apply(prop.Proposal.ID)
	if err != nil {
		t.Fatalf("apply scheiterte: %v", err)
	}

	// Genau eine Datei im Ablageordner, keine temporaere Reste.
	entries, err := os.ReadDir(stateDir)
	if err != nil {
		t.Fatalf("Ablageordner nicht lesbar: %v", err)
	}
	if len(entries) != 1 {
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("im Ablageordner liegen %d Dateien (%v), erwartet 1 — ein Rest der atomaren Schreibweise?",
			len(entries), names)
	}
	if entries[0].Name() != "pmh-nix.json" {
		t.Fatalf("die Ablage heisst %q", entries[0].Name())
	}

	// Die Datei ist gueltiges JSON und traegt die Fassung.
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Ablage nicht lesbar: %v", err)
	}
	var file map[string]any
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("Ablage ist kein JSON: %v", err)
	}
	if got, ok := file["schema"].(float64); !ok || int(got) != state.Schema {
		t.Fatalf("Ablage traegt Fassung %v, erwartet %d", file["schema"], state.Schema)
	}

	// Neu laden: derselbe Stand, dieselbe aktive Generation.
	reloaded := open(t, path)
	if reloaded.Current() != applied.Generation.ID {
		t.Fatalf("nach dem Neuladen ist %q aktiv, erwartet %q", reloaded.Current(), applied.Generation.ID)
	}
	gens := reloaded.Generations()
	if len(gens) != 1 || !gens[0].Current {
		t.Fatalf("nach dem Neuladen: %+v", gens)
	}
	rec := reloaded.Proposal(prop.Proposal.ID)
	if rec == nil {
		t.Fatal("der Vorschlag fehlt nach dem Neuladen")
	}
	if rec.Checked == nil {
		t.Fatal("das Pruefergebnis fehlt nach dem Neuladen")
	}
	if !rec.Applied {
		t.Fatal("der Anwendungsvermerk fehlt nach dem Neuladen")
	}

	// Und die Politik entscheidet danach gleich: zweimal anwenden geht nicht.
	svc2 := newStubService(t, reloaded, stub.New(reloaded))
	if _, err := svc2.Apply(prop.Proposal.ID); err == nil {
		t.Fatal("nach dem Neuladen liess sich derselbe Vorschlag erneut anwenden")
	}
}

// TestStateOpenRejectsUnreadableFile prueft, dass eine kaputte Ablage ein
// lauter Fehler ist und kein stiller Neuanfang.
func TestStateOpenRejectsUnreadableFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pmh-nix.json")
	if err := writeFile(path, []byte("{ das ist kein json")); err != nil {
		t.Fatalf("Ablage nicht schreibbar: %v", err)
	}
	if _, err := state.Open(path); err == nil {
		t.Fatal("eine kaputte Ablage wurde stillschweigend angenommen")
	}
}

// TestStateDefaultPathHonoursPMHHome prueft den Ablageort.
func TestStateDefaultPathHonoursPMHHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("PMH_HOME", home)
	got, err := state.DefaultPath()
	if err != nil {
		t.Fatalf("DefaultPath scheiterte: %v", err)
	}
	want := filepath.Join(home, "state", "pmh-nix.json")
	if got != want {
		t.Fatalf("Ablageort ist %q, erwartet %q", got, want)
	}

	// Ohne PMH_HOME: im Benutzerverzeichnis unter .pmh.
	t.Setenv("PMH_HOME", "")
	got, err = state.DefaultPath()
	if err != nil {
		t.Fatalf("DefaultPath ohne PMH_HOME scheiterte: %v", err)
	}
	mustContain(t, filepath.ToSlash(got), "/.pmh/state/pmh-nix.json")
}

// TestStubProposeRejectsEmptyFlake prueft, dass ohne Systembeschreibung kein
// Vorschlag entsteht.
func TestStubProposeRejectsEmptyFlake(t *testing.T) {
	svc := newStub(t, filepath.Join(t.TempDir(), "pmh-nix.json"))
	if _, err := svc.Propose("   ", "", ""); err == nil {
		t.Fatal("propose nahm einen leeren Flake-Pfad an")
	}
}

// TestStubCheckReportsUnusableTarget prueft, dass die Pruefung inhaltlich
// etwas misst und nicht nur die Nichtverfuegbarkeit meldet.
func TestStubCheckReportsUnusableTarget(t *testing.T) {
	svc := newStub(t, filepath.Join(t.TempDir(), "pmh-nix.json"))
	prop := propose(t, svc, constFlake, "kein/gueltiger/host")

	res := check(t, svc, prop.Proposal.ID)
	var found bool
	for _, f := range res.Findings {
		if f.Code == "target-unbrauchbar" && f.Severity == api.SeverityError {
			found = true
		}
	}
	if !found {
		t.Fatalf("kein Befund zum unbrauchbaren Ziel in %v", res.Findings)
	}
	if !res.Blocked {
		t.Fatal("ein Befund der Schwere error sperrte die Anwendung nicht")
	}
}

// TestGenerationsKeepSimulatedMark prueft, dass eine Attrappen-Generation nie
// wie ein echter Systemwechsel aussieht.
func TestGenerationsKeepSimulatedMark(t *testing.T) {
	svc := newStub(t, filepath.Join(t.TempDir(), "pmh-nix.json"))
	prop := propose(t, svc, constFlake, "")
	check(t, svc, prop.Proposal.ID)
	if _, err := svc.Apply(prop.Proposal.ID); err != nil {
		t.Fatalf("apply scheiterte: %v", err)
	}
	gens, err := svc.Generations()
	if err != nil {
		t.Fatalf("generations scheiterte: %v", err)
	}
	for _, g := range gens.Generations {
		if !stub.IsSimulatedGeneration(g) {
			t.Fatalf("Generation %s ist nicht als Attrappe gekennzeichnet: %+v", g.ID, g)
		}
		if g.System != stub.System {
			t.Fatalf("Generation %s nennt System %q, erwartet %q", g.ID, g.System, stub.System)
		}
	}
}

// errorsIsUnavailable prueft ueber den oeffentlichen Rand, ob ein Fehler die
// Nichtverfuegbarkeit meldet.
func errorsIsUnavailable(err error) bool {
	return err != nil && strings.Contains(err.Error(), actuation.ErrNotAvailable.Error())
}
