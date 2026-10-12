package supervisor

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-supervisor/internal/config"
)

type testWriter struct{ t *testing.T }

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Logf("%s", string(p))
	return len(p), nil
}

func TestDebugRestartFlow(t *testing.T) {
	dir := t.TempDir()
	logger := slog.New(slog.NewTextHandler(testWriter{t}, &slog.HandlerOptions{Level: slog.LevelDebug}))
	p := fakeCommand(t, dir, "dbg", "stop", 0, 0)
	p.Restart = config.RestartNever
	p.ShutdownGrace = 300 * time.Millisecond
	cfg := config.Config{Processes: []config.Process{p}}
	sup, err := New(cfg, Options{Logger: logger, Stdout: io.Discard, Stderr: io.Discard})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	sup.opts.RunThreshold = time.Hour
	if err := sup.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	first := waitForStart(t, dir, "dbg", 5*time.Second)
	t.Logf("erste PID = %d", first)
	time.Sleep(200 * time.Millisecond)
	t.Logf("Status: %+v", sup.Status().Processes[0])
	raw, _ := os.ReadFile(filepath.Join(dir, "dbg.log"))
	t.Logf("log: %q", string(raw))
	if err := sup.Shutdown(); err != nil {
		t.Logf("Shutdown: %v", err)
	}
}
