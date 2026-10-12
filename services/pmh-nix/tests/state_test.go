package tests

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation/stub"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/state"
)

// TestConcurrentWritesLeaveReadableState prueft, dass gleichzeitige
// Schreibvorgaenge die Ablage nicht zerreissen: das atomare Umbenennen haelt
// die Datei zu jedem Zeitpunkt lesbar.
func TestConcurrentWritesLeaveReadableState(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "pmh-nix.json")

	const writers = 8
	var wg sync.WaitGroup
	errs := make(chan error, writers)
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			store, err := state.Open(path)
			if err != nil {
				errs <- err
				return
			}
			if _, err := store.AddGeneration(api.Generation{Label: "gleichzeitig"}); err != nil {
				errs <- err
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("gleichzeitiges Schreiben scheiterte: %v", err)
	}

	// Die Ablage ist lesbar, gueltiges JSON, und es liegen keine Reste herum.
	store, err := state.Open(path)
	if err != nil {
		t.Fatalf("nach gleichzeitigem Schreiben ist die Ablage kaputt: %v", err)
	}
	if store.Current() == "" {
		t.Fatal("nach gleichzeitigem Schreiben ist keine Generation aktiv")
	}
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatalf("Ablageordner nicht lesbar: %v", err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Fatalf("ein Rest der atomaren Schreibweise blieb liegen: %s", e.Name())
		}
	}
}

// TestStubBackendIsBehindTheProcessBoundary haelt die Architekturregel fest:
// der Dienst ist ein eigenes Programm hinter einer Prozessgrenze, kein Teil
// des TypeScript-Kerns. Der Test prueft, dass der Quellbaum keine
// Kern-Interna importiert.
func TestStubBackendIsBehindTheProcessBoundary(t *testing.T) {
	root := serviceRoot(t)
	modulePath := modulePathOf(t, root)

	var violations []string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, line := range strings.Split(string(raw), "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "\"") || !strings.Contains(line, "/") {
				continue
			}
			imp := strings.Trim(line, "\"")
			if !strings.Contains(imp, "/prometheus-harness/") {
				continue
			}
			if !strings.HasPrefix(imp, modulePath) {
				violations = append(violations, path+" importiert ausserhalb des Dienstes: "+imp)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("Quellbaum nicht lesbar: %v", err)
	}
	if len(violations) > 0 {
		t.Fatalf("der Dienst greift ueber die Prozessgrenze: %v", violations)
	}
}

// TestFullCycleLeavesNoFilesBehind prueft den wichtigsten Nachweis dieses
// Arbeitspakets: ein vollstaendiger Umlauf der Attrappe laesst ausserhalb der
// Ablage nichts entstehen.
func TestFullCycleLeavesNoFilesBehind(t *testing.T) {
	dir := t.TempDir()
	work := filepath.Join(dir, "work")
	if err := os.MkdirAll(work, 0o755); err != nil {
		t.Fatalf("Arbeitsordner nicht anlegbar: %v", err)
	}
	statePath := filepath.Join(dir, "state", "pmh-nix.json")

	runExe := func(args ...string) (string, int) {
		cmd := exec.Command(binaryPath, args...)
		cmd.Dir = work
		var out, errBuf bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &errBuf
		err := cmd.Run()
		code := 0
		if ee, ok := err.(*exec.ExitError); ok {
			code = ee.ExitCode()
		} else if err != nil {
			t.Fatalf("Start von %v scheiterte: %v", args, err)
		}
		return out.String() + errBuf.String(), code
	}

	if _, code := runExe("detect", "--json", "--state", statePath); code != 0 {
		t.Fatalf("detect endete mit %d", code)
	}
	if _, code := runExe("propose", "--flake", constFlake, "--target", "node1", "--json", "--state", statePath); code != 0 {
		t.Fatalf("propose endete mit %d", code)
	}
	if _, code := runExe("check", "--proposal", "prop-0001", "--json", "--state", statePath); code != 0 {
		t.Fatalf("check endete mit %d", code)
	}
	out, code := runExe("apply", "--proposal", "prop-0001", "--json", "--state", statePath)
	if code != 0 {
		t.Fatalf("apply endete mit %d: %s", code, out)
	}
	mustContain(t, out, stub.System)

	// Im Arbeitsordner darf nichts entstanden sein.
	entries, err := os.ReadDir(work)
	if err != nil {
		t.Fatalf("Arbeitsordner nicht lesbar: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("der Umlauf hinterliess %d Eintrag/Eintraege im Arbeitsordner", len(entries))
	}
}

// serviceRoot findet das Dienstverzeichnis.
func serviceRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Arbeitsverzeichnis nicht lesbar: %v", err)
	}
	root := filepath.Dir(wd)
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("Dienstverzeichnis nicht gefunden (von %s aus): %v", wd, err)
	}
	return root
}

// modulePathOf liest den Modulpfad aus go.mod.
func modulePathOf(t *testing.T, root string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(root, "go.mod"))
	if err != nil {
		t.Fatalf("go.mod nicht lesbar: %v", err)
	}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "module ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "module "))
		}
	}
	t.Fatal("go.mod nennt keinen Modulpfad")
	return ""
}
