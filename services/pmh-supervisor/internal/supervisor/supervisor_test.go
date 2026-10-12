package supervisor

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-supervisor/internal/config"
)

// ---------------------------------------------------------------------------
// Fake-Kind
//
// Der Supervisor startet echte Prozesse; fuer die Tests braucht es deshalb ein
// echtes Kommando. Statt ein Hilfsbinary zu bauen, startet der Test das
// Testbinary erneut und laesst es einen markierten Zweig ausfuehren
// (os.Args[0] -test.run=TestFakeChild). Jedes Kind schreibt seine Start- und
// Ende-Zeitpunkte in <dir>/<name>.log und seine PID in <dir>/<name>.pid.
//
// Wichtig: die Ausgabe der Kinder wird in den Tests verworfen (Options.Stdout
// auf os.DevNull), sonst erben sie die Pipe von "go test" und cmd.Wait()
// blockiert, bis der letzte Enkel die Pipe schliesst.
// ---------------------------------------------------------------------------

const fakeChildEnv = "PMH_FAKE_CHILD_DIR"

func TestMain(m *testing.M) {
	if dir := os.Getenv(fakeChildEnv); dir != "" {
		os.Exit(runFakeChild(dir))
	}
	os.Exit(m.Run())
}

// TestFakeChild wird nur im Kindprozess ausgefuehrt.
func TestFakeChild(t *testing.T) {
	dir := os.Getenv(fakeChildEnv)
	if dir == "" {
		t.Skip("kein Fake-Kind")
	}
	os.Exit(runFakeChild(dir))
}

func runFakeChild(dir string) int {
	name := os.Getenv("PMH_FAKE_NAME")
	state := os.Getenv("PMH_FAKE_STATE")
	sleepMS, _ := strconv.Atoi(os.Getenv("PMH_FAKE_SLEEP_MS"))
	exitCode, _ := strconv.Atoi(os.Getenv("PMH_FAKE_EXIT"))

	appendLine(dir, name+".log", fmt.Sprintf("start %d", time.Now().UnixNano()))
	appendLine(dir, name+".pid", strconv.Itoa(os.Getpid()))

	switch state {
	case "stop", "stop-quiet":
		// Laeuft, bis der Supervisor beendet. blockForever statt select{}:
		// ein leeres select laesst den Go-Laufzeitpruefer "all goroutines are
		// asleep" feuern und beendet den Prozess mit Exit-Code 2.
		blockForever()
	case "stop-graceful":
		// Wartet auf ein Signal, dann noch 100 ms Aufraeumzeit. Auf Windows
		// kommt kein SIGTERM an, dann greift die Frist des Supervisors.
		waitForSignal()
		time.Sleep(100 * time.Millisecond)
		appendLine(dir, name+".log", fmt.Sprintf("stop %d", time.Now().UnixNano()))
		return 0
	default:
		if sleepMS > 0 {
			time.Sleep(time.Duration(sleepMS) * time.Millisecond)
		}
		appendLine(dir, name+".log", fmt.Sprintf("stop %d", time.Now().UnixNano()))
		return exitCode
	}
	return 0
}

// blockForever blockiert, ohne den Deadlock-Pruefer der Laufzeit auszuloesen.
//
// Zwei Fallen sind hier zu umgehen, und beide sind echt:
//
//  1. `select {}` ohne Faelle laesst den Laufzeitpruefer "all goroutines are
//     asleep - deadlock!" feuern; der Prozess endet dann mit Exit-Code 2.
//  2. Ein blockierender Kanal-Empfang allein genuegt NICHT: hat der Prozess
//     keine weiteren laufenden Goroutinen, greift derselbe Pruefer.
//
// Der Fall "stop" bedeutet "laeuft, bis der Supervisor hart beendet". Deshalb
// konsumiert diese Funktion zusaetzlich alle freundlichen Signale und bleibt am
// Leben, bis ein SIGKILL kommt. Genau das braucht TestShutdownGraceThenKill,
// und es ist die ehrliche Nachbildung eines Dienstes, der auf ein freundliches
// Signal nicht reagiert.
//
// `signal.Notify(ch, ...)` mit einer leeren Signal-Liste faengt **alle**
// Signale ab. Der Kanal ist gepuffert: `go vet` beanstandet einen ungepufferten
// Signal-Kanal zu Recht als "misuse of unbuffered os.Signal channel", weil
// `os/signal` nicht blockierend zustellt und ein voller ungepufferter Kanal
// Signale verlieren kann. Ein verlorenes Signal waere hier gleichbedeutend mit
// einem vorzeitigen Prozessende — also genau der Fehler, den die Funktion
// vermeiden soll. Die empfangenen Werte werden verworfen; der Puffer fuellt sich
// nur, wenn mehr als 32 Signale eintreffen.
func blockForever() {
	ch := make(chan os.Signal, 32)
	signal.Notify(ch)
	for range ch {
	}
}

func appendLine(dir, file, line string) {
	f, err := os.OpenFile(filepath.Join(dir, file), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = fmt.Fprintln(f, line)
}

// readPIDs liest die PIDs aus <dir>/<name>.pid: eine Zeile je Start.
func readPIDs(t *testing.T, dir, name string) []int {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(dir, name+".pid"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatalf("pid-Datei lesen: %v", err)
	}
	var out []int
	for _, line := range strings.Fields(string(raw)) {
		pid, err := strconv.Atoi(line)
		if err != nil {
			t.Fatalf("PID %q unlesbar: %v", line, err)
		}
		out = append(out, pid)
	}
	return out
}

func waitForStart(t *testing.T, dir, name string, timeout time.Duration) int {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if pids := readPIDs(t, dir, name); len(pids) > 0 {
			return pids[len(pids)-1]
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("%q wurde nicht gestartet", name)
	return 0
}

func logTimes(t *testing.T, dir, file, prefix string) []int64 {
	t.Helper()
	f, err := os.Open(filepath.Join(dir, file))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatalf("log oeffnen: %v", err)
	}
	defer f.Close()
	var out []int64
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) != 2 || fields[0] != prefix {
			continue
		}
		ns, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			continue
		}
		out = append(out, ns)
	}
	return out
}

// newTestSupervisor baut einen Supervisor mit verworfenem Kinder-Ausgang und
// protokollierten Enden.
func newTestSupervisor(t *testing.T, cfg config.Config, record *[]string, mu *sync.Mutex) *Supervisor {
	t.Helper()
	sup, err := New(cfg, Options{
		Stdout: io.Discard,
		Stderr: io.Discard,
		OnProcessExit: func(name string, code int, restarts int, willRestart bool) {
			mu.Lock()
			defer mu.Unlock()
			*record = append(*record, name)
		},
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return sup
}

// fakeCommand baut einen Dienst, der das Testbinary als Fake-Kind startet.
func fakeCommand(t *testing.T, dir, name, state string, sleepMS, exitCode int) config.Process {
	t.Helper()
	_ = t
	return config.Process{
		Name: name,
		Exec: os.Args[0],
		Args: []string{"-test.run=TestFakeChild"},
		Env: []string{
			fakeChildEnv + "=" + dir,
			"PMH_FAKE_NAME=" + name,
			"PMH_FAKE_STATE=" + state,
			"PMH_FAKE_SLEEP_MS=" + strconv.Itoa(sleepMS),
			"PMH_FAKE_EXIT=" + strconv.Itoa(exitCode),
		},
		Dir: dir,
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TestStartRestartAndBackoff prueft: ein Dienst, der sofort mit Fehler endet,
// wird mit wachsender Verzoegerung neu gestartet, und nach dem Neustartlimit
// ist Schluss (sichtbarer Fehler statt Endlosschleife).
func TestStartRestartAndBackoff(t *testing.T) {
	dir := t.TempDir()
	p := fakeCommand(t, dir, "flaky", "", 0, 1)
	p.Restart = config.RestartOnFailure
	p.MaxRestarts = 2
	p.Backoff = config.Backoff{
		Initial: 30 * time.Millisecond,
		Max:     120 * time.Millisecond,
		Factor:  2,
		Jitter:  config.JitterOff,
	}

	var mu sync.Mutex
	var record []string
	sup := newTestSupervisor(t, config.Config{HealthInterval: 20 * time.Millisecond, Processes: []config.Process{p}}, &record, &mu)
	// Die Laufschwelle hoch setzen: der Dienst laeuft nie stabil.
	sup.opts.RunThreshold = time.Hour

	if err := sup.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	watchErr := sup.Watch(ctx)
	if watchErr == nil {
		t.Fatal("Watch muss einen Fehler liefern, wenn das Neustartlimit erschoepft ist")
	}
	if !errors.Is(watchErr, ErrServiceFailed) {
		t.Fatalf("Watch-Fehler = %v, erwartet ErrServiceFailed", watchErr)
	}
	if err := sup.Shutdown(); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}

	starts := logTimes(t, dir, "flaky.log", "start")
	if len(starts) != 3 {
		t.Fatalf("%d Starts, erwartet 3 (1 Start + 2 Neustarts)", len(starts))
	}
	// Die Wartezeit muss wachsen: 30 ms, dann 60 ms.
	wait1 := time.Duration(starts[1]-starts[0]) * time.Nanosecond
	wait2 := time.Duration(starts[2]-starts[1]) * time.Nanosecond
	if wait1 < 25*time.Millisecond || wait1 > 500*time.Millisecond {
		t.Errorf("erste Wartezeit = %s, erwartet ~30 ms", wait1)
	}
	if wait2 < 55*time.Millisecond {
		t.Errorf("zweite Wartezeit = %s, erwartet mindestens ~60 ms (Verdopplung)", wait2)
	}
	if wait2 <= wait1 {
		t.Errorf("Backoff waechst nicht: %s dann %s", wait1, wait2)
	}

	st := sup.Status()
	if len(st.Processes) != 1 {
		t.Fatalf("%d Prozesse im Status, erwartet 1", len(st.Processes))
	}
	got := st.Processes[0]
	if got.State != StateFailed {
		t.Errorf("Zustand = %q, erwartet %q", got.State, StateFailed)
	}
	if got.Restarts != 2 {
		t.Errorf("Neustarts = %d, erwartet 2", got.Restarts)
	}
	if got.LastError == "" {
		t.Error("LastError ist leer; der Fehler muss sichtbar sein")
	}
	if !st.Degraded {
		t.Error("Status muss degraded sein")
	}
}

// TestBackoffDelay prueft die reine Rechenfunktion inklusive Deckel und Jitter.
func TestBackoffDelay(t *testing.T) {
	b := config.Backoff{Initial: 100 * time.Millisecond, Max: 400 * time.Millisecond, Factor: 2, Jitter: config.JitterOff}
	want := []time.Duration{
		100 * time.Millisecond,
		200 * time.Millisecond,
		400 * time.Millisecond,
		400 * time.Millisecond, // gedeckelt
	}
	for i, w := range want {
		if got := BackoffDelay(b, i+1); got != w {
			t.Errorf("BackoffDelay(#%d) = %s, erwartet %s", i+1, got, w)
		}
	}
	withJitter := config.Backoff{Initial: 100 * time.Millisecond, Max: 100 * time.Millisecond, Factor: 2, Jitter: 0.2}
	for i := 0; i < 200; i++ {
		got := BackoffDelay(withJitter, 1)
		if got < 80*time.Millisecond || got > 120*time.Millisecond {
			t.Fatalf("Jitter ausserhalb von +/-20%%: %s", got)
		}
	}
	// Faktor 1: konstante Wartezeit.
	flat := config.Backoff{Initial: 50 * time.Millisecond, Max: 50 * time.Millisecond, Factor: 1, Jitter: config.JitterOff}
	if got := BackoffDelay(flat, 5); got != 50*time.Millisecond {
		t.Errorf("BackoffDelay(faktor 1, #5) = %s, erwartet 50ms", got)
	}
}

// TestShutdownReverseOrder prueft: beendet wird in umgekehrter Start-
// reihenfolge (zuletzt gestartet, zuerst beendet).
func TestShutdownReverseOrder(t *testing.T) {
	dir := t.TempDir()
	names := []string{"alpha", "beta", "gamma"}
	procs := make([]config.Process, 0, len(names))
	for _, n := range names {
		p := fakeCommand(t, dir, n, "stop", 0, 0)
		p.Restart = config.RestartNever
		procs = append(procs, p)
	}

	var mu sync.Mutex
	var record []string
	sup := newTestSupervisor(t, config.Config{HealthInterval: 20 * time.Millisecond, Processes: procs}, &record, &mu)
	if err := sup.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	for _, n := range names {
		waitForStart(t, dir, n, 5*time.Second)
	}
	if err := sup.Shutdown(); err != nil {
		t.Logf("Shutdown meldete: %v", err)
	}

	mu.Lock()
	got := append([]string(nil), record...)
	mu.Unlock()
	want := []string{"gamma", "beta", "alpha"}
	if len(got) != len(want) {
		t.Fatalf("beendete Dienste = %v, erwartet %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("Abschaltreihenfolge = %v, erwartet %v (umgekehrte Startreihenfolge)", got, want)
		}
	}

	st := sup.Status()
	if st.Processes[0].State != StateStopped || st.Processes[1].State != StateStopped || st.Processes[2].State != StateStopped {
		t.Errorf("nicht alle Dienste sind beendet: %+v", st.Processes)
	}
}

// TestShutdownGraceThenKill prueft die Frist: ein Dienst, der das freundliche
// Signal ignoriert, wird nach der Frist hart beendet. Shutdown meldet das
// ueber ErrShutdownTimeout.
func TestShutdownGraceThenKill(t *testing.T) {
	dir := t.TempDir()
	p := fakeCommand(t, dir, "stur", "stop", 0, 0)
	p.Restart = config.RestartNever
	p.ShutdownGrace = 300 * time.Millisecond

	var mu sync.Mutex
	var record []string
	sup := newTestSupervisor(t, config.Config{HealthInterval: 20 * time.Millisecond, Processes: []config.Process{p}}, &record, &mu)
	if err := sup.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	waitForStart(t, dir, "stur", 5*time.Second)

	began := time.Now()
	shutdownErr := sup.Shutdown()
	elapsed := time.Since(began)

	if shutdownErr == nil {
		t.Fatal("Shutdown muss ErrShutdownTimeout melden, wenn hart beendet wurde")
	}
	if !errors.Is(shutdownErr, ErrShutdownTimeout) {
		t.Fatalf("Shutdown-Fehler = %v, erwartet ErrShutdownTimeout", shutdownErr)
	}
	if elapsed < 300*time.Millisecond {
		t.Errorf("Shutdown dauerte %s, die Frist von 300 ms wurde nicht abgewartet", elapsed)
	}
	if elapsed > 5*time.Second {
		t.Errorf("Shutdown dauerte %s, zu lang", elapsed)
	}
	if st := sup.Status(); st.Processes[0].State != StateStopped {
		t.Errorf("Zustand = %q, erwartet %q", st.Processes[0].State, StateStopped)
	}
}

// TestUnknownProcess prueft die Sentinel-Fehler des Einzelneustarts.
func TestUnknownProcess(t *testing.T) {
	dir := t.TempDir()
	var mu sync.Mutex
	var record []string
	cfg := config.Config{Processes: []config.Process{fakeCommand(t, dir, "eins", "stop", 0, 0)}}
	sup := newTestSupervisor(t, cfg, &record, &mu)
	if err := sup.Restart("gibtsnicht"); !errors.Is(err, ErrUnknownProcess) {
		t.Fatalf("Restart-Fehler = %v, erwartet ErrUnknownProcess", err)
	}
	if err := sup.Shutdown(); !errors.Is(err, ErrNotStarted) {
		t.Fatalf("Shutdown vor Start = %v, erwartet ErrNotStarted", err)
	}
	if err := sup.Watch(context.Background()); !errors.Is(err, ErrNotStarted) {
		t.Fatalf("Watch vor Start = %v, erwartet ErrNotStarted", err)
	}
}

// TestOptionalServiceDoesNotStopWatch prueft: ein optionaler Dienst, der
// endgueltig scheitert, macht die Harness nicht kaputt — er bleibt aber
// sichtbar als Fehler.
func TestOptionalServiceDoesNotStopWatch(t *testing.T) {
	dir := t.TempDir()
	dying := fakeCommand(t, dir, "optional", "", 0, 7)
	dying.Restart = config.RestartNever
	dying.Optional = true
	alive := fakeCommand(t, dir, "pflicht", "stop", 0, 0)
	alive.Restart = config.RestartNever

	var mu sync.Mutex
	var record []string
	cfg := config.Config{HealthInterval: 10 * time.Millisecond, Processes: []config.Process{dying, alive}}
	sup := newTestSupervisor(t, cfg, &record, &mu)
	if err := sup.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	waitForStart(t, dir, "pflicht", 5*time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	if err := sup.Watch(ctx); err != nil {
		t.Fatalf("Watch = %v, erwartet nil (optionaler Dienst scheitert)", err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if sup.Status().Processes[0].State == StateFailed {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	st := sup.Status()
	if st.Processes[0].State != StateFailed {
		t.Errorf("optionaler Dienst: Zustand = %q, erwartet %q", st.Processes[0].State, StateFailed)
	}
	if st.Processes[0].ExitCode != 7 {
		t.Errorf("Exit-Code = %d, erwartet 7", st.Processes[0].ExitCode)
	}
	if st.Degraded {
		t.Error("ein optionaler Fehler darf den Status nicht als degraded melden")
	}
	if err := sup.Shutdown(); err != nil {
		t.Logf("Shutdown meldete: %v", err)
	}
}

// TestRestartAlwaysRestartsAfterCleanExit prueft die Politik "always".
func TestRestartAlwaysRestartsAfterCleanExit(t *testing.T) {
	dir := t.TempDir()
	p := fakeCommand(t, dir, "zyklisch", "", 30, 0)
	p.Restart = config.RestartAlways
	p.Backoff = config.Backoff{Initial: 10 * time.Millisecond, Max: 20 * time.Millisecond, Factor: 2, Jitter: config.JitterOff}
	cfg := config.Config{HealthInterval: 20 * time.Millisecond, Processes: []config.Process{p}}

	var mu sync.Mutex
	var record []string
	sup := newTestSupervisor(t, cfg, &record, &mu)
	if err := sup.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	first := waitForStart(t, dir, "zyklisch", 5*time.Second)
	// Auf den Neustart warten.
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		pids := readPIDs(t, dir, "zyklisch")
		if len(pids) >= 2 && pids[len(pids)-1] != first {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if pids := readPIDs(t, dir, "zyklisch"); len(pids) < 2 {
		t.Fatalf("%d Starts, erwartet mindestens 2", len(pids))
	}
	if err := sup.Shutdown(); err != nil {
		t.Logf("Shutdown meldete: %v", err)
	}
}

// TestStatusSnapshotBeforeStart prueft die Statusausgabe vor dem Start.
func TestStatusSnapshotBeforeStart(t *testing.T) {
	dir := t.TempDir()
	var mu sync.Mutex
	var record []string
	cfg := config.Config{Processes: []config.Process{fakeCommand(t, dir, "x", "stop", 0, 0)}}
	sup := newTestSupervisor(t, cfg, &record, &mu)
	st := sup.Status()
	if st.Started {
		t.Error("Status meldet started vor dem Start")
	}
	if len(st.Processes) != 1 || st.Processes[0].State != StatePending {
		t.Errorf("Status = %+v, erwartet einen pending-Dienst", st.Processes)
	}
	if st.Processes[0].Name != "x" {
		t.Errorf("Name = %q", st.Processes[0].Name)
	}
}

// TestNewRejectsInvalidConfig prueft, dass ein Konfigurationsfehler nicht zu
// einem halben Start fuehrt.
func TestNewRejectsInvalidConfig(t *testing.T) {
	_, err := New(config.Config{}, Options{})
	if err == nil {
		t.Fatal("New mit leerer Konfiguration muss fehlschlagen")
	}
	if !errors.Is(err, config.ErrInvalidConfig) {
		t.Fatalf("Fehler = %v, erwartet ErrInvalidConfig", err)
	}
}

// TestExecMissingFailsVisibly prueft: ein nicht startbares Kommando ist ein
// sichtbarer Fehler, kein stiller Nichtstart.
func TestExecMissingFailsVisibly(t *testing.T) {
	var mu sync.Mutex
	var record []string
	cfg := config.Config{Processes: []config.Process{{
		Name:    "fehlt",
		Exec:    filepath.Join(t.TempDir(), "gibt-es-nicht"),
		Restart: config.RestartNever,
	}}}
	sup := newTestSupervisor(t, cfg, &record, &mu)
	startErr := sup.Start()
	if startErr == nil {
		t.Fatal("Start muss fehlschlagen")
	}
	if !errors.Is(startErr, ErrServiceFailed) {
		t.Fatalf("Fehler = %v, erwartet ErrServiceFailed", startErr)
	}
	st := sup.Status()
	if st.Processes[0].State != StateFailed {
		t.Errorf("Zustand = %q, erwartet %q", st.Processes[0].State, StateFailed)
	}
	if st.Processes[0].LastError == "" {
		t.Error("LastError muss den Startfehler nennen")
	}
}

// TestSingleRestartStartetNeu prueft den Einzelneustart ueber die API.
func TestSingleRestartStartetNeu(t *testing.T) {
	dir := t.TempDir()
	p := fakeCommand(t, dir, "sanft", "stop", 0, 0)
	p.Restart = config.RestartNever
	p.ShutdownGrace = 400 * time.Millisecond

	var mu sync.Mutex
	var record []string
	cfg := config.Config{Processes: []config.Process{p}}
	sup := newTestSupervisor(t, cfg, &record, &mu)
	if err := sup.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	first := waitForStart(t, dir, "sanft", 5*time.Second)
	if err := sup.Restart("sanft"); err != nil {
		t.Fatalf("Restart: %v", err)
	}
	second := waitForStart(t, dir, "sanft", 5*time.Second)
	if second == first {
		t.Fatalf("PID blieb gleich (%d); der Dienst wurde nicht neu gestartet", first)
	}
	mu.Lock()
	n := len(record)
	mu.Unlock()
	if n != 1 {
		t.Errorf("%d Enden protokolliert, erwartet 1", n)
	}
	if err := sup.Shutdown(); err != nil {
		t.Logf("Shutdown meldete: %v", err)
	}
}

// TestSignalPathIsUsed prueft, dass ein Kind mit Aufraeumzeit die Ende-Marke
// selbst schreibt, wenn es ein Signal bekommt. Auf Windows kommt kein SIGTERM
// an, deshalb prueft der Test dort nur, dass der Supervisor die Frist nutzt.
func TestSignalPathIsUsed(t *testing.T) {
	if _, err := exec.LookPath("go"); err != nil {
		t.Log("go nicht im Pfad; Test laeuft trotzdem")
	}
	dir := t.TempDir()
	p := fakeCommand(t, dir, "sanft2", "stop-graceful", 0, 0)
	p.Restart = config.RestartNever
	p.ShutdownGrace = 700 * time.Millisecond

	var mu sync.Mutex
	var record []string
	cfg := config.Config{Processes: []config.Process{p}}
	sup := newTestSupervisor(t, cfg, &record, &mu)
	if err := sup.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	waitForStart(t, dir, "sanft2", 5*time.Second)

	shutdownErr := sup.Shutdown()
	if shutdownErr == nil {
		// Ein freundliches Signal kam an: das Kind hat selbst aufgeraeumt.
		if times := logTimes(t, dir, "sanft2.log", "stop"); len(times) != 1 {
			t.Fatalf("%d Aufraeum-Marken, erwartet 1", len(times))
		}
		return
	}
	// Kein freundliches Signal moeglich (Windows): harter Abbruch nach Frist.
	if !errors.Is(shutdownErr, ErrShutdownTimeout) {
		t.Fatalf("Shutdown-Fehler = %v, erwartet ErrShutdownTimeout oder nil", shutdownErr)
	}
	t.Log("kein freundliches Signal zustellbar: Frist und hartes Beenden genutzt")
}

// TestStartTwiceFails prueft, dass ein zweiter Start abgelehnt wird.
func TestStartTwiceFails(t *testing.T) {
	dir := t.TempDir()
	var mu sync.Mutex
	var record []string
	p := fakeCommand(t, dir, "einmal", "stop", 0, 0)
	p.Restart = config.RestartNever
	cfg := config.Config{Processes: []config.Process{p}}
	sup := newTestSupervisor(t, cfg, &record, &mu)
	if err := sup.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	waitForStart(t, dir, "einmal", 5*time.Second)
	if err := sup.Start(); !errors.Is(err, ErrAlreadyStarted) {
		t.Fatalf("zweiter Start = %v, erwartet ErrAlreadyStarted", err)
	}
	if err := sup.Shutdown(); err != nil {
		t.Logf("Shutdown meldete: %v", err)
	}
	if err := sup.Shutdown(); err != nil {
		t.Fatalf("zweiter Shutdown = %v, erwartet nil (idempotent)", err)
	}
}