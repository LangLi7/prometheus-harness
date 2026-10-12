// Package supervisor startet, ueberwacht und beendet die in der
// Dienstbeschreibung deklarierten Kindprozesse.
//
// Das Paket kennt weder den TypeScript-Core noch andere Dienste. Es arbeitet
// ausschliesslich mit Prozessen: exec, Argumente, Exit-Codes, Signale. Damit
// bleibt die Sprachgrenze eine Dienstgrenze (docs/stack.md).
//
// Lebenszyklus:
//
//	Start()   -> alle Dienste in Deklarationsreihenfolge starten
//	Watch()   -> nach jedem Ende entscheiden: neu starten (Backoff) oder Fehler
//	Shutdown()-> in umgekehrter Reihenfolge freundlich beenden, dann hart killen
//
// Regel 3 aus docs/concept.md ("Dienste starten mit der Harness und scheitern
// sichtbar") ist hier umgesetzt als: jedes Kind hat einen Zustand, jeder
// Fehlschlag steht in Status() und in LastError, und ein nicht optionaler
// Dienst, der sein Neustartlimit verbraucht hat, setzt den Exit-Code des
// Supervisors auf ExitServiceFailed.
package supervisor

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-supervisor/internal/config"
)

// Exit-Codes des Supervisor-Prozesses. Sie sind Teil des Vertrags: der
// aufrufende Core unterscheidet damit Ursachen (MAPPING.md §7).
const (
	// ExitOK: alle Dienste beendet, keiner davon unerwartet.
	ExitOK = 0
	// ExitUsage: falsche Aufrufparameter.
	ExitUsage = 1
	// ExitConfigInvalid: die Dienstbeschreibung ist unlesbar oder widerspruechlich.
	ExitConfigInvalid = 2
	// ExitServiceFailed: mindestens ein nicht optionaler Dienst ist gescheitert.
	ExitServiceFailed = 3
	// ExitShutdownTimeout: ein Dienst liess sich nicht innerhalb der Frist beenden.
	ExitShutdownTimeout = 4
	// ExitHTTPUnavailable: der Status-Port war nicht belegbar.
	ExitHTTPUnavailable = 5
)

// Sentinel-Fehler.
var (
	ErrAlreadyStarted  = errors.New("supervisor: laeuft bereits")
	ErrNotStarted      = errors.New("supervisor: nicht gestartet")
	ErrUnknownProcess  = errors.New("supervisor: unbekannter Dienst")
	ErrMaxRestarts     = errors.New("supervisor: Neustartlimit erreicht")
	ErrServiceFailed   = errors.New("supervisor: Dienst gescheitert")
	ErrShutdownTimeout = errors.New("supervisor: Abschaltfrist ueberschritten")
	ErrProcessExited   = errors.New("supervisor: Prozess ist beendet")
)

// State ist der Zustand eines Dienstes. Die Werte sind stabil und gehen so in
// die HTTP-Antwort.
type State string

const (
	StatePending  State = "pending"
	StateStarting State = "starting"
	StateRunning  State = "running"
	StateBackoff  State = "backoff"
	StateStopped  State = "stopped"
	StateFailed   State = "failed"
)

// ProcessStatus ist der nach aussen sichtbare Zustand eines Dienstes.
type ProcessStatus struct {
	Name      string `json:"name"`
	State     State  `json:"state"`
	PID       int    `json:"pid,omitempty"`
	Optional  bool   `json:"optional"`
	Restarts  int    `json:"restarts"`
	Failures  int    `json:"failures"`
	ExitCode  int    `json:"exit_code"`
	LastError string `json:"last_error,omitempty"`
	StartedAt string `json:"started_at,omitempty"`
	StoppedAt string `json:"stopped_at,omitempty"`
}

// Status ist die vollstaendige Auskunft des Supervisors.
type Status struct {
	Started   bool            `json:"started"`
	Shutdown  bool            `json:"shutting_down"`
	Degraded  bool            `json:"degraded"`
	PID       int             `json:"pid"`
	StartedAt string          `json:"started_at,omitempty"`
	UptimeS   float64         `json:"uptime_s"`
	Processes []ProcessStatus `json:"processes"`
}

// ChildError meldet das unerwartete Ende eines nicht optionalen Dienstes.
type ChildError struct {
	Name     string
	ExitCode int
	Err      error
}

func (e *ChildError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Name, e.Err)
	}
	return fmt.Sprintf("%s: mit Exit-Code %d beendet", e.Name, e.ExitCode)
}

func (e *ChildError) Unwrap() error { return e.Err }

// Options steuert den Supervisor, ohne die Konfiguration zu ersetzen.
type Options struct {
	// Logger ist optional; ohne Logger wird verworfen.
	Logger *slog.Logger
	// Stdout/Stderr der Kinder. Leer = Ausgabe des Supervisors erben.
	Stdout io.Writer
	Stderr io.Writer
	// OnProcessExit wird nach jedem Ende eines Kindes aufgerufen (Tests,
	// Protokollierung). Es darf nicht blockieren.
	OnProcessExit func(name string, code int, restarts int, willRestart bool)
	// RunThreshold ist die Laufzeit, ab der ein beendeter Dienst als stabil
	// gilt und der Fehlerzaehler zurueckgesetzt wird. 0 = Vorgabe.
	RunThreshold time.Duration
	// Ready wird einmal geschlossen, nachdem alle Dienste gestartet wurden.
	Ready chan<- struct{}
}

type child struct {
	cfg config.Process

	mu         sync.Mutex
	state      State
	cmd        *exec.Cmd
	pid        int
	exitCode   int
	lastErr    error
	restarts   int
	failures   int
	startedAt  time.Time
	stoppedAt  time.Time
	done       chan struct{}
	stopping   bool
}

// Supervisor haelt alle Kinder.
type Supervisor struct {
	cfg  config.Config
	opts Options
	log  *slog.Logger

	mu      sync.Mutex
	order   []string
	byName  map[string]*child
	started bool
	stopped bool
	startAt time.Time
	now     func() time.Time
}

// New prueft die Konfiguration und baut den Supervisor. Es wird noch kein
// Prozess gestartet.
func New(cfg config.Config, opts Options) (*Supervisor, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if opts.Logger == nil {
		opts.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if opts.RunThreshold <= 0 {
		opts.RunThreshold = config.DefaultRunThreshold
	}
	s := &Supervisor{
		cfg:    cfg,
		opts:   opts,
		log:    opts.Logger,
		order:  make([]string, 0, len(cfg.Processes)),
		byName: make(map[string]*child, len(cfg.Processes)),
		now:    time.Now,
	}
	for _, p := range cfg.Processes {
		s.order = append(s.order, p.Name)
		s.byName[p.Name] = &child{cfg: p, state: StatePending}
	}
	return s, nil
}

// Names liefert die Dienstnamen in Startreihenfolge.
func (s *Supervisor) Names() []string {
	return append([]string(nil), s.order...)
}

// Start startet alle Dienste in Deklarationsreihenfolge. Der erste Dienst, der
// sich nicht starten laesst, beendet den Vorgang mit einem Fehler; bereits
// gestartete Kinder werden dabei nicht automatisch beendet (der Aufrufer ruft
// Shutdown, damit auch dieser Fall sauber bleibt).
func (s *Supervisor) Start() error {
	s.mu.Lock()
	if s.started {
		s.mu.Unlock()
		return ErrAlreadyStarted
	}
	s.started = true
	s.startAt = s.now()
	s.mu.Unlock()

	defer func() {
		if s.opts.Ready != nil {
			close(s.opts.Ready)
		}
	}()

	for _, name := range s.order {
		c := s.byName[name]
		if err := s.launch(c); err != nil {
			if !c.cfg.Optional {
				return fmt.Errorf("%w: %w", ErrServiceFailed, err)
			}
			s.log.Warn("optionaler Dienst startet nicht", "dienst", name, "fehler", err)
		}
	}
	return nil
}

// launch startet genau einen Kindprozess und beginnt dessen Ueberwachung.
func (s *Supervisor) launch(c *child) error {
	c.mu.Lock()
	if c.stopping {
		c.mu.Unlock()
		return fmt.Errorf("%w: %s", ErrProcessExited, c.cfg.Name)
	}
	cmd := exec.Command(c.cfg.Exec, c.cfg.Args...)
	cmd.Dir = c.cfg.Dir
	if len(c.cfg.Env) > 0 {
		cmd.Env = append(cmd.Environ(), c.cfg.Env...)
	}
	// Prozessgruppe des Kindes (POSIX): ein hartes Beenden trifft auch Enkel.
	cmd.SysProcAttr = sysProcAttr()
	if s.opts.Stdout != nil {
		cmd.Stdout = s.opts.Stdout
	} else {
		// Leer = Ausgabe des Supervisors erben. Damit ist die Ausgabe des
		// Kindes ohne Zusatzarbeit sichtbar (Regel 3: sichtbar scheitern).
		cmd.Stdout = os.Stdout
	}
	if s.opts.Stderr != nil {
		cmd.Stderr = s.opts.Stderr
	} else {
		cmd.Stderr = os.Stderr
	}
	c.state = StateStarting
	if err := cmd.Start(); err != nil {
		c.state = StateFailed
		c.lastErr = err
		c.failures++
		c.stoppedAt = s.now()
		c.mu.Unlock()
		return fmt.Errorf("start von %q (%s): %w", c.cfg.Name, c.cfg.Exec, err)
	}
	c.cmd = cmd
	c.pid = cmd.Process.Pid
	c.state = StateRunning
	c.startedAt = s.now()
	c.stoppedAt = time.Time{}
	c.done = make(chan struct{})
	done := c.done
	c.mu.Unlock()

	s.log.Info("Dienst gestartet", "dienst", c.cfg.Name, "pid", c.pid)
	go func() {
		err := cmd.Wait()
		code := exitCodeOf(cmd, err)
		c.mu.Lock()
		c.exitCode = code
		if err != nil {
			c.lastErr = err
		} else {
			c.lastErr = nil
		}
		c.stoppedAt = s.now()
		runtimeS := c.stoppedAt.Sub(c.startedAt)
		stopping := c.stopping
		c.mu.Unlock()
		close(done)
		s.onExit(c, code, runtimeS, stopping)
	}()
	return nil
}

// onExit entscheidet nach dem Ende eines Kindes ueber das weitere Vorgehen.
func (s *Supervisor) onExit(c *child, code int, runtimeS time.Duration, stopping bool) {
	c.mu.Lock()
	if stopping {
		c.state = StateStopped
		c.restarts = 0
		c.mu.Unlock()
		s.log.Info("Dienst beendet", "dienst", c.cfg.Name, "exit_code", code)
		return
	}
	if runtimeS >= s.opts.RunThreshold {
		// Stabil gelaufen: der Fehlerzaehler beginnt von vorn.
		c.failures = 0
	}
	failed := code != 0
	if failed {
		c.failures++
	}
	policy := c.cfg.RestartPolicy()
	maxRestarts := c.cfg.MaxRestartsFor()
	limitReached := maxRestarts >= 0 && c.restarts >= maxRestarts

	willRestart := !limitReached
	switch policy {
	case config.RestartNever:
		willRestart = false
	case config.RestartOnFailure:
		willRestart = willRestart && failed
	case config.RestartAlways:
	default:
		willRestart = false
	}
	if !failed && policy == config.RestartAlways {
		// Sauberes Ende, aber "always": als regulaerer Neustart zaehlen.
		c.failures = 0
	}
	if willRestart {
		c.restarts++
		c.state = StateBackoff
	} else if failed || policy == config.RestartNever {
		if limitReached && failed {
			c.lastErr = fmt.Errorf("%w (%d)", ErrMaxRestarts, maxRestarts)
		}
		c.state = StateFailed
	} else {
		c.state = StateStopped
	}
	restarts := c.restarts
	c.mu.Unlock()

	s.log.Info("Dienst beendet", "dienst", c.cfg.Name, "exit_code", code,
		"laufzeit_s", runtimeS.Seconds(), "neustart", willRestart, "versuche", restarts)
	if s.opts.OnProcessExit != nil {
		s.opts.OnProcessExit(c.cfg.Name, code, restarts, willRestart)
	}

	if !willRestart {
		return
	}
	delay := BackoffDelay(c.cfg.BackoffFor(), restarts)
	s.log.Info("Neustart geplant", "dienst", c.cfg.Name, "warte_s", delay.Seconds())
	time.Sleep(delay)

	c.mu.Lock()
	if c.stopping {
		c.mu.Unlock()
		return
	}
	c.mu.Unlock()
	if err := s.launch(c); err != nil {
		s.log.Error("Neustart fehlgeschlagen", "dienst", c.cfg.Name, "fehler", err)
		// Kein weiterer Versuch: der Fehler bleibt sichtbar im Status.
		c.mu.Lock()
		c.state = StateFailed
		c.mu.Unlock()
	}
}

// BackoffDelay berechnet die Wartezeit vor dem n-ten Neustart
// (n = 1, 2, ...). Exponential mit Deckel und relativem Jitter.
func BackoffDelay(b config.Backoff, n int) time.Duration {
	if n < 1 {
		n = 1
	}
	d := float64(b.Initial)
	for i := 1; i < n; i++ {
		d *= b.Factor
		if d >= float64(b.Max) {
			d = float64(b.Max)
			break
		}
	}
	if d > float64(b.Max) {
		d = float64(b.Max)
	}
	if b.Jitter > 0 {
		// Relativer Jitter: +/- jitter um den Nennwert.
		delta := d * b.Jitter
		d = d - delta + rand.Float64()*2*delta
	}
	if d < 0 {
		d = 0
	}
	return time.Duration(d)
}

// Watch laeuft, bis ctx beendet wird, und ueberwacht dabei alle Kinder.
//
// Der Supervisor pollt nicht, er wartet auf das Ende einzelner Kinder. Ein
// Kind, das sein Neustartlimit verbraucht hat, wird als Fehler gemeldet: der
// erste nicht optionale Fehler beendet Watch mit ErrServiceFailed und dem
// betroffenen Dienst. Optionale Dienste bleiben im Status sichtbar, beenden
// Watch aber nicht.
func (s *Supervisor) Watch(ctx context.Context) error {
	s.mu.Lock()
	if !s.started {
		s.mu.Unlock()
		return ErrNotStarted
	}
	s.mu.Unlock()

	ticker := time.NewTicker(s.cfg.EffectiveHealthInterval())
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if name, err := s.firstFatal(); err != nil {
				return &ChildError{Name: name, Err: err}
			}
		}
	}
}

// firstFatal liefert den ersten nicht optionalen Dienst in einem
// Fehlerzustand, der nicht mehr neu startet.
func (s *Supervisor) firstFatal() (string, error) {
	for _, name := range s.order {
		c := s.byName[name]
		c.mu.Lock()
		state, optional, err := c.state, c.cfg.Optional, c.lastErr
		c.mu.Unlock()
		if state == StateFailed && !optional {
			if err == nil {
				return name, ErrServiceFailed
			}
			return name, fmt.Errorf("%w: %w", ErrServiceFailed, err)
		}
	}
	return "", nil
}

// Shutdown beendet alle Dienste und meldet, ob irgendwo die Frist
// ueberschritten wurde (ErrShutdownTimeout mit den hart beendeten Namen).
//
// Die Dienste werden in umgekehrter Startreihenfolge **freundlich signalisiert**,
// aber **gemeinsam** — nicht einer nach dem anderen. Das ist der Unterschied
// zwischen "alle haben eine Frist" und "jeder hat nacheinander eine Frist": bei
// n Diensten mit Frist f dauerte das sequenzielle Verfahren n*f, und ein Dienst,
// der noch gar nicht hochgekommen war, lief Gefahr, nur noch als Leiche
// signalisiert zu werden. Deshalb: erst alle Signale zustellen, dann einmal
// gemeinsam auf die Frist warten, dann die Verbliebenen hart beenden.
func (s *Supervisor) Shutdown() error {
	s.mu.Lock()
	if !s.started {
		s.mu.Unlock()
		return ErrNotStarted
	}
	if s.stopped {
		s.mu.Unlock()
		return nil
	}
	s.stopped = true
	// Kopie der Reihenfolge, damit die Goroutinen nicht unter der Sperre laufen.
	order := append([]string(nil), s.order...)
	s.mu.Unlock()

	// Phase 1: freundliches Signal an alle, in umgekehrter Startreihenfolge.
	// Die Reihenfolge ist Vertrag (zuletzt gestartet, zuerst beendet); dass die
	// Signale unmittelbar nacheinander zugestellt werden, verletzt sie nicht —
	// beobachtbar ist die Reihenfolge, in der die Dienste ihre Arbeit einstellen.
	type pending struct {
		name string
		c    *child
	}
	targets := make([]pending, 0, len(order))
	for i := len(order) - 1; i >= 0; i-- {
		c := s.byName[order[i]]
		if s.signalStop(c) {
			targets = append(targets, pending{name: order[i], c: c})
		}
	}

	// Phase 2: gemeinsam auf die Frist warten und die Verbliebenen hart beenden.
	// Die Goroutine-Schleife ist bewusst explizit: `for _, t := range targets`
	// mit einem `go`-Aufruf darin wuerde t in allen Goroutinen teilen, und ab
	// Go 1.22 ist das zwar nicht mehr falsch, aber die Absicht ist so
	// unmissverstaendlich.
	var wg sync.WaitGroup
	killed := make([]bool, len(targets))
	for i := range targets {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			t := targets[idx]
			hard, err := s.reapChild(t.c)
			if err != nil {
				s.log.Warn("Dienst liess sich nicht sauber beenden", "dienst", t.name, "fehler", err)
			}
			killed[idx] = hard
		}(i)
	}
	wg.Wait()

	var hardKilled []string
	for i, hard := range killed {
		if hard {
			hardKilled = append(hardKilled, targets[i].name)
		}
	}
	if len(hardKilled) > 0 {
		return fmt.Errorf("%w: %v", ErrShutdownTimeout, hardKilled)
	}
	return nil
}

// signalStop stellt einem laufenden Kind das freundliche Signal zu.
// Rueckgabe: true, wenn auf dieses Kind gewartet werden muss.
func (s *Supervisor) signalStop(c *child) bool {
	c.mu.Lock()
	running := c.state == StateRunning || c.state == StateStarting
	if !running {
		if c.state != StateStopped && c.state != StateFailed {
			c.state = StateStopped
		}
		c.mu.Unlock()
		return false
	}
	c.stopping = true
	cmd := c.cmd
	c.mu.Unlock()

	if cmd != nil && cmd.Process != nil {
		if err := cmd.Process.Signal(gracefulSignal()); err != nil {
			s.log.Debug("freundliches Signal nicht zustellbar", "dienst", c.cfg.Name, "fehler", err)
		}
	}
	return true
}

// reapChild wartet die Frist ab und beendet das Kind danach hart.
// Rueckgabe: true, wenn hart beendet werden musste.
func (s *Supervisor) reapChild(c *child) (bool, error) {
	c.mu.Lock()
	done := c.done
	grace := c.cfg.GraceFor(s.cfg.EffectiveShutdownTimeout())
	cmd := c.cmd
	c.mu.Unlock()

	if done == nil {
		return false, nil
	}

	timer := time.NewTimer(grace)
	defer timer.Stop()
	select {
	case <-done:
		return false, nil
	case <-timer.C:
	}

	var err error
	if cmd != nil && cmd.Process != nil {
		if killErr := cmd.Process.Kill(); killErr != nil {
			err = killErr
			s.log.Warn("hartes Beenden fehlgeschlagen", "dienst", c.cfg.Name, "fehler", killErr)
		}
	}
	<-done
	return true, err
}

// Status liefert einen konsistenten Schnappschuss aller Zustaende.
func (s *Supervisor) Status() Status {
	s.mu.Lock()
	started, stopped, startAt := s.started, s.stopped, s.startAt
	s.mu.Unlock()

	out := Status{
		Started:   started,
		Shutdown:  stopped,
		PID:       0,
		Processes: make([]ProcessStatus, 0, len(s.order)),
	}
	if started {
		out.StartedAt = startAt.Format(time.RFC3339Nano)
		out.UptimeS = s.now().Sub(startAt).Seconds()
	}
	for _, name := range s.order {
		c := s.byName[name]
		c.mu.Lock()
		ps := ProcessStatus{
			Name:     c.cfg.Name,
			State:    c.state,
			PID:      c.pid,
			Optional: c.cfg.Optional,
			Restarts: c.restarts,
			Failures: c.failures,
			ExitCode: c.exitCode,
		}
		if c.lastErr != nil {
			ps.LastError = c.lastErr.Error()
		}
		if !c.startedAt.IsZero() {
			ps.StartedAt = c.startedAt.Format(time.RFC3339Nano)
		}
		if !c.stoppedAt.IsZero() {
			ps.StoppedAt = c.stoppedAt.Format(time.RFC3339Nano)
		}
		degraded := c.state == StateFailed && !c.cfg.Optional
		if degraded {
			out.Degraded = true
		}
		c.mu.Unlock()
		out.Processes = append(out.Processes, ps)
	}
	return out
}

// Restart beendet einen einzelnen Dienst und startet ihn neu. Der Aufruf ist
// fuer den Status-Endpunkt gedacht (POST /processes/{name}/restart) und
// blockiert, bis der Dienst beendet ist.
//
// Anders als bei Shutdown wird hier genau **ein** Dienst beendet: die
// Startreihenfolge der uebrigen bleibt unberuehrt, deshalb genuegt
// signalStop + reapChild ohne die gemeinsame Fristphase.
func (s *Supervisor) Restart(name string) error {
	c, ok := s.byName[name]
	if !ok {
		return fmt.Errorf("%w: %q", ErrUnknownProcess, name)
	}
	// `stopping` wird nur gesetzt, wenn das Kind laeuft. Ein bereits beendetes
	// Kind braucht kein Signal; es wird lediglich neu gestartet.
	if s.signalStop(c) {
		if _, err := s.reapChild(c); err != nil {
			s.log.Warn("Neustart: Dienst liess sich nicht sauber beenden", "dienst", name, "fehler", err)
		}
	}
	c.mu.Lock()
	c.stopping = false
	c.restarts = 0
	c.failures = 0
	c.mu.Unlock()
	return s.launch(c)
}

// exitCodeOf liest den Exit-Code aus dem Wait-Fehler.
func exitCodeOf(cmd *exec.Cmd, err error) int {
	if cmd.ProcessState != nil {
		return cmd.ProcessState.ExitCode()
	}
	if err == nil {
		return 0
	}
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		return ee.ExitCode()
	}
	return -1
}
