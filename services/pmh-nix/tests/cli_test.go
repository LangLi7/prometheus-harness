package tests

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// pmhExit sind die Exit-Codes des Vertrags.
const (
	pmhExitOK      = 0
	pmhExitPolicy  = 1
	pmhExitUsage   = 2
	pmhExitBackend = 125
)

// pmhResponse ist die eine Antwort, die der Dienst ausgibt.
type pmhResponse struct {
	Command   string          `json:"command"`
	Backend   string          `json:"backend"`
	Schema    int             `json:"schema"`
	OK        bool            `json:"ok"`
	ExitCode  int             `json:"exit_code"`
	Error     string          `json:"error"`
	Message   string          `json:"message"`
	Data      json.RawMessage `json:"data"`
	StatePath string          `json:"state_path"`
}

// pmhRun ruft das gebaute Programm auf und liefert Ausgabe und Exit-Code.
//
// Die Tests gehen ueber die Prozessgrenze, nicht ueber einen Paketaufruf: nur
// so werden die Exit-Codes 0/1/2/125 wirklich gemessen, und genau das ist der
// Vertrag. Ein Go-Programm (package main) laesst sich nicht importieren.
func pmhRun(args ...string) (stdout, stderr string, code int) {
	cmd := exec.Command(binaryPath, args...)
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	err := cmd.Run()
	switch e := err.(type) {
	case nil:
		code = 0
	case *exec.ExitError:
		code = e.ExitCode()
	default:
		return out.String(), errBuf.String() + "\nStart fehlgeschlagen: " + err.Error(), -1
	}
	return out.String(), errBuf.String(), code
}

// pmhJSON prueft, dass bei --json GENAU EIN JSON-Objekt herauskommt, und
// liefert es zurueck.
func pmhJSON(t *testing.T, stdout string) pmhResponse {
	t.Helper()
	dec := json.NewDecoder(strings.NewReader(stdout))
	var first pmhResponse
	if err := dec.Decode(&first); err != nil {
		t.Fatalf("stdout ist kein JSON-Objekt: %v\n%s", err, stdout)
	}
	var second any
	if err := dec.Decode(&second); err == nil {
		t.Fatalf("stdout enthaelt mehr als ein JSON-Objekt:\n%s", stdout)
	}
	if strings.TrimSpace(stdout[strings.LastIndex(stdout, "}")+1:]) != "" {
		t.Fatalf("nach dem JSON-Objekt steht weiterer Text:\n%s", stdout)
	}
	return first
}

// pmhState liefert einen Ablagepfad in einem Testverzeichnis.
func pmhState(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "state", "pmh-nix.json")
}

// TestCLIDetectReportsUnavailable prueft den Unterbefehl detect.
func TestCLIDetectReportsUnavailable(t *testing.T) {
	statePath := pmhState(t)
	stdout, stderr, code := pmhRun("detect", "--json", "--state", statePath)
	if code != pmhExitOK {
		t.Fatalf("detect endete mit %d, erwartet %d (stderr: %s)", code, pmhExitOK, stderr)
	}
	res := pmhJSON(t, stdout)
	if res.Command != "detect" || res.Backend != "stub" || res.Schema != 1 {
		t.Fatalf("Antwort ist unerwartet: %+v", res)
	}
	if !res.OK || res.ExitCode != pmhExitOK {
		t.Fatalf("Antwort meldet keinen Erfolg: %+v", res)
	}
	mustContain(t, string(res.Data), `"available":false`)
	mustContain(t, string(res.Data), "kein Nix auf diesem Wirt")
	if stderr != "" {
		t.Fatalf("detect schrieb nach stderr: %s", stderr)
	}
}

// TestCLIProposeThenCheckThenApplyThenRollback fuehrt den vollen Vertrag ueber
// die Kommandozeile: sechs Unterbefehle, genau ein JSON-Objekt je Aufruf.
func TestCLIProposeThenCheckThenApplyThenRollback(t *testing.T) {
	statePath := pmhState(t)

	stdout, stderr, code := pmhRun("propose", "--flake", constFlake, "--target", "node1", "--json", "--state", statePath)
	if code != pmhExitOK {
		t.Fatalf("propose endete mit %d (stderr: %s)", code, stderr)
	}
	proposeRes := pmhJSON(t, stdout)
	mustContain(t, string(proposeRes.Data), `"id":"prop-0001"`)
	mustContain(t, string(proposeRes.Data), `"hash":"sha256:`)

	stdout, stderr, code = pmhRun("check", "--proposal", "prop-0001", "--json", "--state", statePath)
	if code != pmhExitOK {
		t.Fatalf("check endete mit %d (stderr: %s)", code, stderr)
	}
	checkRes := pmhJSON(t, stdout)
	mustContain(t, string(checkRes.Data), `"blocked":false`)

	stdout, stderr, code = pmhRun("apply", "--proposal", "prop-0001", "--json", "--state", statePath)
	if code != pmhExitOK {
		t.Fatalf("apply endete mit %d (stderr: %s)", code, stderr)
	}
	applyRes := pmhJSON(t, stdout)
	mustContain(t, string(applyRes.Data), `"generation"`)
	mustContain(t, string(applyRes.Data), `"system":"attrappe"`)

	stdout, stderr, code = pmhRun("generations", "--json", "--state", statePath)
	if code != pmhExitOK {
		t.Fatalf("generations endete mit %d (stderr: %s)", code, stderr)
	}
	gensRes := pmhJSON(t, stdout)
	mustContain(t, string(gensRes.Data), `"current":"gen-0002"`)

	stdout, stderr, code = pmhRun("rollback", "--to", "gen-0002", "--json", "--state", statePath)
	if code != pmhExitOK {
		t.Fatalf("rollback endete mit %d (stderr: %s)", code, stderr)
	}
	rollRes := pmhJSON(t, stdout)
	mustContain(t, string(rollRes.Data), `"current":true`)

	// Jeder Aufruf hat denselben Ablageort benutzt.
	if proposeRes.StatePath != statePath {
		t.Fatalf("der Aufruf nennt Ablage %q, erwartet %q", proposeRes.StatePath, statePath)
	}
}

// TestCLIApplyRejectsUncheckedProposal prueft die Sicherheitsinvariante ueber
// die Kommandozeile: ohne check kein apply.
func TestCLIApplyRejectsUncheckedProposal(t *testing.T) {
	statePath := pmhState(t)
	if _, _, code := pmhRun("propose", "--flake", constFlake, "--json", "--state", statePath); code != pmhExitOK {
		t.Fatalf("propose endete mit %d", code)
	}

	stdout, stderr, code := pmhRun("apply", "--proposal", "prop-0001", "--json", "--state", statePath)
	if code != pmhExitPolicy {
		t.Fatalf("apply endete mit %d, erwartet %d", code, pmhExitPolicy)
	}
	res := pmhJSON(t, stdout)
	if res.OK {
		t.Fatalf("apply meldete Erfolg: %+v", res)
	}
	mustContain(t, res.Error, "vorschlag-ungeprueft")
	if !strings.HasPrefix(stderr, "pmh-nix: ") {
		t.Fatalf("stderr traegt nicht das Praefix pmh-nix: %q", stderr)
	}

	// Und es gibt keine Generation.
	stdout, _, code = pmhRun("generations", "--json", "--state", statePath)
	if code != pmhExitOK {
		t.Fatalf("generations endete mit %d", code)
	}
	mustContain(t, string(pmhJSON(t, stdout).Data), `"generations":[]`)
}

// TestCLIApplyRejectsUnknownProposal prueft, dass nur eine von propose
// vergebene Kennung durchkommt.
func TestCLIApplyRejectsUnknownProposal(t *testing.T) {
	statePath := pmhState(t)
	stdout, stderr, code := pmhRun("apply", "--proposal", "prop-0042", "--json", "--state", statePath)
	if code != pmhExitPolicy {
		t.Fatalf("apply endete mit %d, erwartet %d", code, pmhExitPolicy)
	}
	mustContain(t, pmhJSON(t, stdout).Error, "vorschlag-unbekannt")
	if !strings.HasPrefix(stderr, "pmh-nix: ") {
		t.Fatalf("stderr traegt nicht das Praefix pmh-nix: %q", stderr)
	}
}

// TestCLIApplyRejectsAlreadyAppliedProposal prueft, dass ein Vorschlag genau
// einmal wirkt.
func TestCLIApplyRejectsAlreadyAppliedProposal(t *testing.T) {
	statePath := pmhState(t)
	if _, _, code := pmhRun("propose", "--flake", constFlake, "--json", "--state", statePath); code != pmhExitOK {
		t.Fatalf("propose endete mit %d", code)
	}
	if _, _, code := pmhRun("check", "--proposal", "prop-0001", "--json", "--state", statePath); code != pmhExitOK {
		t.Fatalf("check endete mit %d", code)
	}
	if _, _, code := pmhRun("apply", "--proposal", "prop-0001", "--json", "--state", statePath); code != pmhExitOK {
		t.Fatalf("erstes apply endete mit %d", code)
	}
	stdout, _, code := pmhRun("apply", "--proposal", "prop-0001", "--json", "--state", statePath)
	if code != pmhExitPolicy {
		t.Fatalf("zweites apply endete mit %d, erwartet %d", code, pmhExitPolicy)
	}
	mustContain(t, pmhJSON(t, stdout).Error, "vorschlag-schon-angewandt")
}

// TestCLIUsageErrorsExitTwo prueft die Aufruffeher.
func TestCLIUsageErrorsExitTwo(t *testing.T) {
	statePath := pmhState(t)
	cases := [][]string{
		{"frobnicate", "--state", statePath},
		{"propose", "--state", statePath},
		{"check", "--state", statePath},
		{"apply", "--state", statePath},
		{"rollback", "--state", statePath},
		{"--backend", "quanten", "detect", "--state", statePath},
		{"--state"},
	}
	for _, args := range cases {
		_, stderr, code := pmhRun(args...)
		if code != pmhExitUsage {
			t.Fatalf("%v endete mit %d, erwartet %d (stderr: %s)", args, code, pmhExitUsage, stderr)
		}
		if !strings.HasPrefix(stderr, "pmh-nix: ") {
			t.Fatalf("%v: stderr traegt nicht das Praefix pmh-nix: %q", args, stderr)
		}
	}
}

// TestCLIBackendFailuresExitOneTwentyFive prueft, dass ein Backendfehler den
// eigenen Code 125 bekommt — und niemals 0.
func TestCLIBackendFailuresExitOneTwentyFive(t *testing.T) {
	statePath := pmhState(t)

	// detect ist der eine Aufruf, der auch ohne Nix gelingt: er MELDET die
	// Nichtverfuegbarkeit, statt an ihr zu scheitern.
	stdout, stderr, code := pmhRun("--backend", "nix", "detect", "--json", "--state", statePath)
	if code != pmhExitOK {
		t.Fatalf("detect mit dem echten Backend endete mit %d, erwartet %d (stderr: %s)",
			code, pmhExitOK, stderr)
	}
	res := pmhJSON(t, stdout)
	if !res.OK {
		t.Fatalf("detect meldete einen Fehler: %+v", res)
	}
	mustContain(t, string(res.Data), `"available":false`)

	// Jeder veraendernde oder lesende Zugriff verweigert laut. Ein Vorschlag
	// wird vorher mit der Attrappe aufgenommen, damit diese Faelle an der
	// Nichtverfuegbarkeit des Backends scheitern und nicht an einer fehlenden
	// Kennung.
	if _, _, code := pmhRun("propose", "--flake", constFlake, "--json", "--state", statePath); code != pmhExitOK {
		t.Fatalf("Vorbereitung propose endete mit %d", code)
	}
	commands := [][]string{
		{"propose", "--flake", constFlake, "--json"},
		{"check", "--proposal", "prop-0001", "--json"},
		{"apply", "--proposal", "prop-0001", "--json"},
		{"generations", "--json"},
		{"rollback", "--to", "gen-0001", "--json"},
	}
	for _, rest := range commands {
		args := append([]string{"--backend", "nix"}, rest...)
		args = append(args, "--state", statePath)
		stdout, stderr, code := pmhRun(args...)
		if code != pmhExitBackend {
			t.Fatalf("%v endete mit %d, erwartet %d (stderr: %s)", args, code, pmhExitBackend, stderr)
		}
		if !strings.HasPrefix(stderr, "pmh-nix: ") {
			t.Fatalf("%v: stderr traegt nicht das Praefix pmh-nix: %q", args, stderr)
		}
		mustContain(t, stderr, "actuation nicht verfuegbar")
		mustContain(t, pmhJSON(t, stdout).Error, "actuation nicht verfuegbar")
	}
}

// TestCLIJSONIsExactlyOneObject prueft, dass --json genau ein Objekt liefert,
// auch im Fehlerfall.
func TestCLIJSONIsExactlyOneObject(t *testing.T) {
	// A. Die zustandslosen Aufrufe.
	readOnly := [][]string{
		{"detect", "--json"},
		{"generations", "--json"},
		{"check", "--proposal", "prop-0001", "--json"},
		{"apply", "--proposal", "prop-0001", "--json"},
		{"rollback", "--to", "gen-0001", "--json"},
		{"nonsense", "--json"},
		{"propose", "--json"},
	}
	for _, args := range readOnly {
		statePath := pmhState(t)
		full := append(append([]string{}, args...), "--state", statePath)
		stdout, stderr, code := pmhRun(full...)
		res := pmhResponse{}
		if strings.TrimSpace(stdout) == "" {
			t.Fatalf("%v: kein JSON auf stdout (exit %d, stderr %q)", args, code, stderr)
		}
		decode(t, []byte(stdout), &res)
		if res.Schema != 1 {
			t.Fatalf("%v: Antwort traegt Fassung %d", args, res.Schema)
		}
		if res.Command == "" {
			t.Fatalf("%v: Antwort nennt den Unterbefehl nicht:\n%s", args, stdout)
		}
	}

	// B. Der zustandsbehaftete Umlauf, jeder Schritt mit genau einem Objekt.
	statePath := pmhState(t)
	steps := [][]string{
		{"detect", "--json", "--state", statePath},
		{"propose", "--flake", constFlake, "--json", "--state", statePath},
		{"generations", "--json", "--state", statePath},
	}
	for _, args := range steps {
		stdout, _, _ := pmhRun(args...)
		if res := pmhJSON(t, stdout); res.Schema != 1 || !res.OK {
			t.Fatalf("%v: Antwort ist unerwartet: %+v", args, res)
		}
	}
	// Nach der Aufnahme ist die Kennung bekannt.
	for _, args := range [][]string{
		{"check", "--proposal", "prop-0001", "--json", "--state", statePath},
		{"apply", "--proposal", "prop-0001", "--json", "--state", statePath},
		{"generations", "--json", "--state", statePath},
		{"apply", "--proposal", "prop-0001", "--json", "--state", statePath},
	} {
		stdout, _, _ := pmhRun(args...)
		if res := pmhJSON(t, stdout); res.Schema != 1 {
			t.Fatalf("%v: Antwort ist unerwartet: %+v", args, res)
		}
	}

	// Der Rueckweg braucht eine vorhandene Generation; die Kennung stammt aus
	// der Liste und wird nicht geraten.
	stdout, _, code := pmhRun("generations", "--json", "--state", statePath)
	if code != pmhExitOK {
		t.Fatalf("generations endete mit %d", code)
	}
	var list struct {
		Generations []struct {
			ID string `json:"id"`
		} `json:"generations"`
	}
	if err := json.Unmarshal(pmhJSON(t, stdout).Data, &list); err != nil {
		t.Fatalf("Generationenliste nicht lesbar: %v", err)
	}
	if len(list.Generations) == 0 {
		t.Fatal("nach apply gibt es keine Generation")
	}
	stdout, _, code = pmhRun("rollback", "--to", list.Generations[0].ID, "--json", "--state", statePath)
	if code != pmhExitOK {
		t.Fatalf("rollback endete mit %d", code)
	}
	if res := pmhJSON(t, stdout); !res.OK {
		t.Fatalf("rollback meldete einen Fehler: %+v", res)
	}
}

// TestCLIWithoutJSONPrintsNoJSON prueft die Gegenprobe: ohne --json kommt kein
// JSON.
func TestCLIWithoutJSONPrintsNoJSON(t *testing.T) {
	statePath := pmhState(t)
	stdout, _, code := pmhRun("detect", "--state", statePath)
	if code != pmhExitOK {
		t.Fatalf("detect endete mit %d", code)
	}
	if strings.ContainsAny(stdout, "{}") {
		t.Fatalf("ohne --json wurde JSON ausgegeben:\n%s", stdout)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Fatal("ohne --json wurde gar nichts ausgegeben")
	}
}

// TestCLIErrorsGoToStderrWithPrefix prueft, dass Fehler nach stderr gehen und
// das Praefix tragen — auch ohne --json.
func TestCLIErrorsGoToStderrWithPrefix(t *testing.T) {
	statePath := pmhState(t)
	stdout, stderr, code := pmhRun("apply", "--proposal", "nope", "--state", statePath)
	if code != pmhExitPolicy {
		t.Fatalf("apply endete mit %d, erwartet %d", code, pmhExitPolicy)
	}
	if !strings.HasPrefix(stderr, "pmh-nix: ") {
		t.Fatalf("stderr traegt nicht das Praefix: %q", stderr)
	}
	if strings.Contains(stdout, "policy") {
		t.Fatalf("die Fehlermeldung landete auf stdout:\n%s", stdout)
	}
}

// TestCLIBackendFlagBeforeAndAfterSubcommand prueft, dass globale Flags an
// beiden Stellen greifen.
func TestCLIBackendFlagBeforeAndAfterSubcommand(t *testing.T) {
	statePath := pmhState(t)

	_, _, before := pmhRun("--backend", "nix", "generations", "--state", statePath)
	_, _, after := pmhRun("generations", "--backend", "nix", "--state", statePath)
	if before != pmhExitBackend || after != pmhExitBackend {
		t.Fatalf("Exit-Codes vor/nach dem Unterbefehl: %d/%d, erwartet %d/%d",
			before, after, pmhExitBackend, pmhExitBackend)
	}

	stdout, _, code := pmhRun("--backend=stub", "generations", "--json", "--state="+statePath)
	if code != pmhExitOK {
		t.Fatalf("--backend=stub endete mit %d", code)
	}
	mustContain(t, pmhJSON(t, stdout).Backend, "stub")
}

// TestCLIBackendFlagFromEnvironment prueft die Umgebungsvariable.
func TestCLIBackendFlagFromEnvironment(t *testing.T) {
	statePath := pmhState(t)
	t.Setenv("PMH_NIX_BACKEND", "nix")
	stdout, _, code := pmhRun("generations", "--json", "--state", statePath)
	if code != pmhExitBackend {
		t.Fatalf("PMH_NIX_BACKEND=nix endete mit %d, erwartet %d", code, pmhExitBackend)
	}
	mustContain(t, pmhJSON(t, stdout).Backend, "nix")
}

// TestCLINoSubcommandIsUsageError prueft den Aufruf ohne Unterbefehl.
func TestCLINoSubcommandIsUsageError(t *testing.T) {
	_, stderr, code := pmhRun()
	if code != pmhExitUsage {
		t.Fatalf("Aufruf ohne Unterbefehl endete mit %d, erwartet %d", code, pmhExitUsage)
	}
	mustContain(t, stderr, "unterbefehl fehlt")
	mustContain(t, stderr, "pmh-nix: ")
}

// TestCLIUsageListsAllSubcommands prueft, dass die Hilfe alle sechs
// Unterbefehle nennt.
func TestCLIUsageListsAllSubcommands(t *testing.T) {
	stdout, _, code := pmhRun("--help")
	if code != pmhExitOK {
		t.Fatalf("--help endete mit %d", code)
	}
	for _, sub := range []string{"detect", "propose", "check", "apply", "generations", "rollback"} {
		mustContain(t, stdout, sub)
	}
	mustContain(t, stdout, "das Modell empfiehlt, die Policy entscheidet")
}

// TestCLIUnreadableStateExitsBackend prueft, dass eine kaputte Ablage ein
// Backendfehler ist (125) und kein stiller Neuanfang.
func TestCLIUnreadableStateExitsBackend(t *testing.T) {
	statePath := pmhState(t)
	if err := os.MkdirAll(filepath.Dir(statePath), 0o755); err != nil {
		t.Fatalf("Ablageordner nicht anlegbar: %v", err)
	}
	if err := os.WriteFile(statePath, []byte("{ kaputt"), 0o644); err != nil {
		t.Fatalf("Ablage nicht schreibbar: %v", err)
	}
	stdout, stderr, code := pmhRun("detect", "--json", "--state", statePath)
	if code != pmhExitBackend {
		t.Fatalf("detect mit kaputter Ablage endete mit %d, erwartet %d", code, pmhExitBackend)
	}
	if !strings.HasPrefix(stderr, "pmh-nix: ") {
		t.Fatalf("stderr traegt nicht das Praefix: %q", stderr)
	}
	mustContain(t, string(pmhJSON(t, stdout).Error), "unlesbar")
}

// TestCLIVersionAndHelpAreSuccessful prueft die beiden Sonderfaelle.
func TestCLIVersionAndHelpAreSuccessful(t *testing.T) {
	stdout, _, code := pmhRun("--version")
	if code != pmhExitOK {
		t.Fatalf("--version endete mit %d", code)
	}
	mustContain(t, stdout, "pmh-nix ")

	stdout, _, code = pmhRun("--help")
	if code != pmhExitOK {
		t.Fatalf("--help endete mit %d", code)
	}
	mustContain(t, stdout, "Exit-Codes")
}
