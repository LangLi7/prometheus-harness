package tests_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// binaer baut das Kommando einmal je Testlauf (sync.Once) und liefert seinen
// Pfad. Gebaut wird mit -buildvcs=false, weil das .git des Zielprojekts defekt
// ist.
var (
	bauEinmal sync.Once
	bauPfad   string
	bauOrdner string
	bauFehler error
)

// TestMain raeumt den Bau-Ordner wieder weg, damit kein Programm zurueckbleibt.
func TestMain(m *testing.M) {
	code := m.Run()
	if bauOrdner != "" {
		_ = os.RemoveAll(bauOrdner)
	}
	os.Exit(code)
}

func binaer(t *testing.T) string {
	t.Helper()
	bauEinmal.Do(func() {
		wurzel, err := modulWurzel()
		if err != nil {
			bauFehler = err
			return
		}
		// Gebaut wird in einen Unterordner des Dienstes, nicht nach %TEMP%:
		// eine Application-Control-Richtlinie dieses Rechners blockiert frisch
		// erzeugte Programme unter %TEMP%. Der Ordner wird am Ende des
		// Testlaufs wieder entfernt.
		dir, err := os.MkdirTemp(wurzel, ".bau-")
		if err != nil {
			bauFehler = err
			return
		}
		ziel := filepath.Join(dir, "pmh-attach.exe")
		cmd := exec.Command("go", "build", "-buildvcs=false", "-o", ziel, "./cmd/pmh-attach")
		cmd.Dir = wurzel
		if ausgabe, err := cmd.CombinedOutput(); err != nil {
			bauFehler = fmt.Errorf("go build: %v\n%s", err, ausgabe)
			return
		}
		bauPfad = ziel
		bauOrdner = dir
	})
	if bauFehler != nil {
		t.Errorf("Dienst nicht baubar: %v", bauFehler)
		t.FailNow()
	}
	return bauPfad
}

// modulWurzel findet den Ordner des Dienstmoduls. Gesucht wird zuerst im
// Arbeitsverzeichnis und darueber, dann in den ueblichen Nachbarordnern — so
// haengt der Test nicht daran, aus welchem Verzeichnis er gestartet wurde.
func modulWurzel() (string, error) {
	const marke = "module github.com/LangLi7/prometheus-harness/services/pmh-attach"
	kandidaten := make([]string, 0, 8)
	if wd, err := os.Getwd(); err == nil {
		kandidaten = append(kandidaten, wd, filepath.Join(wd, ".."), filepath.Join(wd, "..", ".."))
	}
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		kandidaten = append(kandidaten, dir, filepath.Join(dir, ".."), filepath.Join(dir, "..", ".."))
	}
	for _, kandidat := range kandidaten {
		abs, err := filepath.Abs(kandidat)
		if err != nil {
			continue
		}
		inhalt, err := os.ReadFile(filepath.Join(abs, "go.mod"))
		if err != nil {
			continue
		}
		if strings.Contains(string(inhalt), marke) {
			return abs, nil
		}
	}
	wd, _ := os.Getwd()
	return "", fmt.Errorf("Modulwurzel von pmh-attach nicht gefunden (Arbeitsverzeichnis %q)", wd)
}

// freierPort liefert einen Port, der gerade frei ist.
func freierPort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("kein freier Port: %v", err)
	}
	defer func() { _ = ln.Close() }()
	return ln.Addr().(*net.TCPAddr).Port
}

// TestWildcardBindIsRejectedWithoutFlag prueft den Wildcard-Bind auf
// Prozessebene: der Dienst startet nicht, meldet den Grund und laesst den Port
// unberuehrt.
func TestWildcardBindIsRejectedWithoutFlag(t *testing.T) {
	port := freierPort(t)
	cmd := exec.Command(binaer(t), "--host", "0.0.0.0", "--port", fmt.Sprint(port))
	cmd.Dir = ".."
	ausgabe, err := cmd.CombinedOutput()
	if err == nil {
		t.Fatalf("der Dienst ist mit einem Wildcard-Bind gestartet:\n%s", ausgabe)
	}
	var exit *exec.ExitError
	if !errors.As(err, &exit) {
		t.Fatalf("unerwarteter Fehler: %v", err)
	}
	if exit.ExitCode() != 1 {
		t.Errorf("Exit-Code = %d, erwartet 1 (Aufruf-/Adressfehler)\n%s", exit.ExitCode(), ausgabe)
	}
	text := string(ausgabe)
	if !strings.Contains(text, "--allow-wildcard") {
		t.Errorf("Meldung nennt das Flag nicht:\n%s", text)
	}
	if !strings.Contains(text, "jede Schnittstelle") {
		t.Errorf("Meldung erklaert die Folge nicht:\n%s", text)
	}
	// Der Port darf nicht gebunden worden sein.
	if conn, derr := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 300*time.Millisecond); derr == nil {
		_ = conn.Close()
		t.Errorf("der Port %d ist trotz Ablehnung belegt", port)
	}
}

// TestWildcardBindAcceptedWithFlag prueft, dass der Wildcard-Bind mit
// ausdruecklicher Erlaubnis startet und lebendig ist.
func TestWildcardBindAcceptedWithFlag(t *testing.T) {
	port := freierPort(t)
	d := starteDienst(t, "--host", "0.0.0.0", "--allow-wildcard", "--port", fmt.Sprint(port))
	defer d.stoppen()

	antwort := warteAufHealthz(t, fmt.Sprintf("http://127.0.0.1:%d/healthz", port), 15*time.Second)
	var body map[string]any
	if err := json.Unmarshal(antwort, &body); err != nil {
		t.Fatalf("Antwort ist kein JSON: %v (%s)", err, antwort)
	}
	if body["status"] != "ok" {
		t.Errorf("status = %v", body["status"])
	}
}

// TestServiceStartsWithoutHarnessAndAnswersHealthz ist der Nachweis, dass der
// Dienst ohne Harness laeuft: Start auf einem freien Port, /healthz antwortet
// 200 mit dem erwarteten JSON, dann wird er beendet.
func TestServiceStartsWithoutHarnessAndAnswersHealthz(t *testing.T) {
	port := freierPort(t)
	d := starteDienst(t, "--host", "127.0.0.1", "--port", fmt.Sprint(port), "--json-logs")
	defer d.stoppen()

	antwort := warteAufHealthz(t, fmt.Sprintf("http://127.0.0.1:%d/healthz", port), 15*time.Second)
	text := string(antwort)
	for _, want := range []string{`"status":"ok"`, `"service":"pmh-attach"`} {
		if !strings.Contains(text, want) {
			t.Errorf("Antwort enthaelt %s nicht: %s", want, text)
		}
	}
	var body map[string]any
	if err := json.Unmarshal(antwort, &body); err != nil {
		t.Fatalf("Antwort ist kein JSON: %v", err)
	}
	// Ohne --upstream arbeitet der Dienst mit der Attrappe im eigenen Prozess:
	// ein fehlender Harness ist kein Fehler fuer /healthz.
	if upstream, _ := body["upstream"].(string); !strings.Contains(upstream, "memory") {
		t.Errorf("upstream = %v, erwartet die Attrappe", body["upstream"])
	}
	// Die Protokollzeilen sind JSON, wenn --json-logs gesetzt ist.
	if ausgabe := d.ausgabe(); !strings.Contains(ausgabe, `"msg"`) {
		t.Errorf("--json-logs schreibt kein JSON:\n%s", ausgabe)
	}
}

// TestServiceReportsUnreachableUpstreamAtStart prueft, dass ein nicht
// erreichbarer Upstream beim Start SICHTBAR gemeldet wird, /healthz aber
// weiterlaeuft (docs/concept.md Regel 3).
func TestServiceReportsUnreachableUpstreamAtStart(t *testing.T) {
	port := freierPort(t)
	toterPort := freierPort(t)
	d := starteDienst(t, "--host", "127.0.0.1", "--port", fmt.Sprint(port),
		"--upstream", fmt.Sprintf("http://127.0.0.1:%d", toterPort))
	defer d.stoppen()

	antwort := warteAufHealthz(t, fmt.Sprintf("http://127.0.0.1:%d/healthz", port), 15*time.Second)
	var body map[string]any
	if err := json.Unmarshal(antwort, &body); err != nil {
		t.Fatalf("Antwort ist kein JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("status = %v, erwartet ok — der Dienst selbst lebt", body["status"])
	}
	// Der fehlende Upstream steht sichtbar im Protokoll.
	ausgabe := d.ausgabe()
	if !strings.Contains(ausgabe, "Upstream") {
		t.Errorf("das Protokoll nennt den Upstream nicht:\n%s", ausgabe)
	}
	// Und er steht sichtbar im Status.
	if upstream, _ := body["upstream"].(string); !strings.Contains(upstream, "remote") {
		t.Errorf("upstream = %v, erwartet den konfigurierten Endpunkt", body["upstream"])
	}
}

// TestVersionFlagExitsZero prueft --version: Ausgabe auf stdout, Exit 0.
func TestVersionFlagExitsZero(t *testing.T) {
	cmd := exec.Command(binaer(t), "--version")
	cmd.Dir = ".."
	ausgabe, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("--version endete mit Fehler: %v\n%s", err, ausgabe)
	}
	if !strings.Contains(string(ausgabe), "pmh-attach 0.1.0") {
		t.Errorf("Ausgabe = %q", ausgabe)
	}
}

// ---- Hilfen ----------------------------------------------------------------

// dienst buendelt Prozess, Protokolldatei und Ende.
type dienst struct {
	t     *testing.T
	cmd   *exec.Cmd
	datei *os.File
	mu    sync.Mutex
}

// starteDienst startet das Kommando und leitet seine Ausgabe in eine Datei.
func starteDienst(t *testing.T, args ...string) *dienst {
	t.Helper()
	datei, err := os.CreateTemp("", "pmh-attach-log")
	if err != nil {
		t.Fatalf("Protokolldatei nicht anlegbar: %v", err)
	}
	cmd := exec.Command(binaer(t), args...)
	cmd.Dir = ".."
	cmd.Stdout = datei
	cmd.Stderr = datei
	if err := cmd.Start(); err != nil {
		_ = datei.Close()
		t.Fatalf("Start fehlgeschlagen: %v", err)
	}
	return &dienst{t: t, cmd: cmd, datei: datei}
}

// ausgabe liefert die bisher geschriebene Ausgabe.
func (d *dienst) ausgabe() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	b, err := os.ReadFile(d.datei.Name())
	if err != nil {
		return ""
	}
	return string(b)
}

// stoppen beendet den Prozess und raeumt die Protokolldatei weg. Der Dienst
// bleibt nicht zurueck.
func (d *dienst) stoppen() {
	if d.cmd.Process == nil {
		return
	}
	_ = d.cmd.Process.Kill()
	_, _ = d.cmd.Process.Wait()
	d.mu.Lock()
	_ = d.datei.Close()
	_ = os.Remove(d.datei.Name())
	d.mu.Unlock()
}

// warteAufHealthz fragt /healthz, bis es 200 antwortet.
func warteAufHealthz(t *testing.T, url string, frist time.Duration) []byte {
	t.Helper()
	ende := time.Now().Add(frist)
	var letzter error
	for time.Now().Before(ende) {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			cancel()
			t.Fatalf("Anfrage nicht baubar: %v", err)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			cancel()
			letzter = err
			time.Sleep(50 * time.Millisecond)
			continue
		}
		body, rerr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		cancel()
		if rerr == nil && resp.StatusCode == http.StatusOK {
			return body
		}
		letzter = fmt.Errorf("Status %d", resp.StatusCode)
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("/healthz antwortete nicht innerhalb von %s: %v", frist, letzter)
	return nil
}
