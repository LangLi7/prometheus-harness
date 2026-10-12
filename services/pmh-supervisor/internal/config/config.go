// Package config liest die Dienstbeschreibung des Supervisors.
//
// Der Supervisor selbst kennt keine Dienste. Er liest eine Konfigurationsdatei
// (JSON oder YAML-Teilmenge) und startet, was dort steht. Damit bleibt er ein
// Prozess hinter einer Prozessgrenze: der JS-Core ruft ihn mit einem Pfad auf
// und liest seinen Status ueber HTTP oder stdout.
//
// Alle Zeiten in der Datei sind Sekunden (Ganzzahl oder Fliesskomma); "-1"
// bedeutet "kein Neustart-Limit".
package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Sentinel-Fehler. Aufrufer (und Tests) unterscheiden damit Ursachen, ohne
// Fehlertexte zu vergleichen.
var (
	ErrNoConfigPath   = errors.New("supervisor: kein Konfigurationspfad angegeben")
	ErrInvalidConfig  = errors.New("supervisor: ungueltige Konfiguration")
	ErrNoProcesses    = errors.New("supervisor: Konfiguration enthaelt keine Dienste")
	ErrDuplicateName  = errors.New("supervisor: doppelter Dienstname")
	ErrMissingCommand = errors.New("supervisor: Dienst ohne Kommando")
	ErrUnknownField   = errors.New("supervisor: unbekanntes Feld in der Konfiguration")
	ErrYAMLSubset     = errors.New("supervisor: YAML-Teilmenge nicht unterstuetzt")
)

// Defaults (aus docs/stack.md abgeleitet: Dienste starten mit der Harness und
// scheitern sichtbar, also sind die Vorgaben geduldig, aber endlich).
const (
	DefaultShutdownTimeout = 15 * time.Second
	DefaultHealthInterval  = 5 * time.Second
	DefaultBackoffInitial  = 500 * time.Millisecond
	DefaultBackoffMax      = 30 * time.Second
	DefaultBackoffFactor   = 2.0
	DefaultBackoffJitter   = 0.2
	// DefaultMaxRestarts ist bewusst endlich: ein Dienst, der immer wieder
	// stirbt, darf nicht ewig neu starten, sonst wird der Fehler unsichtbar.
	DefaultMaxRestarts = 5
	DefaultRestart     = RestartOnFailure
	// DefaultRunThreshold ist die Laufzeit, ab der ein beendeter Dienst als
	// "stabil gelaufen" gilt: sie setzt den Fehlerzaehler zurueck.
	DefaultRunThreshold = 10 * time.Second
)

// Restart beschreibt die Neustartpolitik eines Dienstes.
type Restart string

const (
	// RestartNever startet den Dienst nicht neu. Ein Ende ist ein Fehler.
	RestartNever Restart = "never"
	// RestartOnFailure startet nur nach ungleich null beendeten Laeufen neu.
	RestartOnFailure Restart = "on-failure"
	// RestartAlways startet auch nach einem sauberen Ende neu.
	RestartAlways Restart = "always"
)

// Valid prueft, ob die Politik bekannt ist.
func (r Restart) Valid() bool {
	switch r {
	case RestartNever, RestartOnFailure, RestartAlways:
		return true
	default:
		return false
	}
}

// Backoff beschreibt das Warteverhalten zwischen zwei Startversuchen.
//
// Achtung: Jitter = 0 heisst "nicht gesetzt" und wird von BackoffFor auf
// DefaultBackoffJitter gehoben. Wer den Jitter abschalten will, setzt ihn
// ausdruecklich auf JitterOff (nur in Tests sinnvoll).
type Backoff struct {
	Initial time.Duration `json:"-"`
	Max     time.Duration `json:"-"`
	Factor  float64       `json:"-"`
	Jitter  float64       `json:"-"`
}

// JitterOff schaltet den Zufallsanteil des Backoffs ab.
const JitterOff = -1.0

// Process ist ein Dienst, den der Supervisor startet und ueberwacht.
type Process struct {
	Name string   `json:"name"`
	Exec string   `json:"exec"`
	Args []string `json:"args,omitempty"`

	// Dir ist das Arbeitsverzeichnis des Kindes. Leer = Arbeitsverzeichnis
	// des Supervisors.
	Dir string `json:"dir,omitempty"`
	// Env sind zusaetzliche Umgebungsvariablen. Sie werden ueber die Umgebung
	// des Supervisors gelegt, nicht gegen sie getauscht.
	Env []string `json:"env,omitempty"`

	// Optional: ein optionaler Dienst darf fehlen oder scheitern, ohne die
	// gesamte Harness in einen Fehlerzustand zu bringen. Er wird weiterhin
	// sichtbar als Fehler gemeldet.
	Optional bool `json:"optional,omitempty"`

	Restart Restart `json:"restart,omitempty"`
	// MaxRestarts < 0 bedeutet "unbegrenzt". 0 oder fehlend = Vorgabe.
	MaxRestarts int     `json:"max_restarts,omitempty"`
	Backoff     Backoff `json:"backoff,omitzero"`

	// ShutdownGrace ist die Frist zwischen freundlichem Signal und dem
	// harten Beenden. Null = Vorgabe des Supervisors.
	ShutdownGrace time.Duration `json:"-"`
}

// BackoffFor liefert die effektive Backoff-Konfiguration inklusive Vorgaben.
func (p Process) BackoffFor() Backoff {
	b := p.Backoff
	if b.Initial <= 0 {
		b.Initial = DefaultBackoffInitial
	}
	if b.Max <= 0 {
		b.Max = DefaultBackoffMax
	}
	if b.Factor < 1 {
		b.Factor = DefaultBackoffFactor
	}
	if b.Jitter == 0 {
		b.Jitter = DefaultBackoffJitter
	}
	if b.Jitter < 0 {
		b.Jitter = 0
	}
	if b.Jitter > 1 {
		b.Jitter = 1
	}
	if b.Max < b.Initial {
		b.Max = b.Initial
	}
	return b
}

// RestartPolicy liefert die effektive Neustartpolitik.
func (p Process) RestartPolicy() Restart {
	if p.Restart == "" {
		return DefaultRestart
	}
	return p.Restart
}

// MaxRestartsFor liefert das effektive Neustartlimit. -1 heisst unbegrenzt.
func (p Process) MaxRestartsFor() int {
	switch {
	case p.RestartPolicy() == RestartNever:
		return 0
	case p.MaxRestarts < 0:
		return -1
	case p.MaxRestarts > 0:
		return p.MaxRestarts
	default:
		return DefaultMaxRestarts
	}
}

// GraceFor liefert die effektive Abschaltfrist.
func (p Process) GraceFor(fallback time.Duration) time.Duration {
	if p.ShutdownGrace > 0 {
		return p.ShutdownGrace
	}
	if fallback <= 0 {
		return DefaultShutdownTimeout
	}
	return fallback
}

// Config ist die gesamte Dienstbeschreibung.
type Config struct {
	Version         int           `json:"version,omitempty"`
	ShutdownTimeout time.Duration `json:"-"`
	HealthInterval  time.Duration `json:"-"`
	LogLevel        string        `json:"log_level,omitempty"`
	Processes       []Process     `json:"processes"`
}

// EffectiveShutdownTimeout liefert die Frist fuer das gesamte Herunterfahren.
func (c Config) EffectiveShutdownTimeout() time.Duration {
	if c.ShutdownTimeout > 0 {
		return c.ShutdownTimeout
	}
	return DefaultShutdownTimeout
}

// EffectiveHealthInterval liefert das Intervall der Zustandspruefung.
func (c Config) EffectiveHealthInterval() time.Duration {
	if c.HealthInterval > 0 {
		return c.HealthInterval
	}
	return DefaultHealthInterval
}

// Names liefert die Dienstnamen in Startreihenfolge.
func (c Config) Names() []string {
	out := make([]string, 0, len(c.Processes))
	for _, p := range c.Processes {
		out = append(out, p.Name)
	}
	return out
}

// Validate prueft die Konfiguration vollstaendig, bevor irgendein Prozess
// startet. Regel 3 verlangt sichtbare Fehler: ein Tippfehler in der
// Konfiguration darf nicht zu einem stillen Nichtstart fuehren.
func (c Config) Validate() error {
	if len(c.Processes) == 0 {
		return fmt.Errorf("%w: %w", ErrInvalidConfig, ErrNoProcesses)
	}
	seen := make(map[string]struct{}, len(c.Processes))
	for i, p := range c.Processes {
		if strings.TrimSpace(p.Name) == "" {
			return fmt.Errorf("%w: processes[%d]: Name fehlt", ErrInvalidConfig, i)
		}
		where := "processes[" + p.Name + "]"
		if _, dup := seen[p.Name]; dup {
			return fmt.Errorf("%w: %q", ErrDuplicateName, p.Name)
		}
		seen[p.Name] = struct{}{}
		if strings.TrimSpace(p.Exec) == "" {
			return fmt.Errorf("%w: %s", ErrMissingCommand, where)
		}
		if !p.RestartPolicy().Valid() {
			return fmt.Errorf("%w: %s: unbekannte Neustartpolitik %q", ErrInvalidConfig, where, p.Restart)
		}
		if p.MaxRestarts < -1 {
			return fmt.Errorf("%w: %s: max_restarts darf nur -1 (unbegrenzt) oder >= 0 sein", ErrInvalidConfig, where)
		}
		for j, kv := range p.Env {
			if !strings.Contains(kv, "=") {
				return fmt.Errorf("%w: %s: env[%d] ist kein NAME=WERT-Paar", ErrInvalidConfig, where, j)
			}
		}
	}
	return nil
}

// durationSecond is a duration serialised as seconds in the config file.
// Es akzeptiert eine Zahl (Sekunden) oder einen Go-Dauerstring ("250ms").
type durationSecond time.Duration

func (d *durationSecond) UnmarshalJSON(raw []byte) error {
	s := strings.TrimSpace(string(raw))
	if s == "null" || s == `""` {
		*d = 0
		return nil
	}
	if strings.HasPrefix(s, `"`) {
		var lit string
		if err := json.Unmarshal(raw, &lit); err != nil {
			return err
		}
		parsed, err := time.ParseDuration(lit)
		if err != nil {
			return fmt.Errorf("Dauer %q: %w", lit, err)
		}
		*d = durationSecond(parsed)
		return nil
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return fmt.Errorf("Dauer %q ist keine Zahl in Sekunden: %w", s, err)
	}
	*d = durationSecond(time.Duration(f * float64(time.Second)))
	return nil
}

func (d durationSecond) MarshalJSON() ([]byte, error) {
	return json.Marshal(float64(time.Duration(d)) / float64(time.Second))
}

type backoffJSON struct {
	Initial *durationSecond `json:"initial,omitempty"`
	Max     *durationSecond `json:"max,omitempty"`
	Factor  float64         `json:"factor,omitempty"`
	Jitter  *float64        `json:"jitter,omitempty"`
}

type processJSON struct {
	Name          string       `json:"name"`
	Exec          string       `json:"exec"`
	Args          []string     `json:"args,omitempty"`
	Dir           string       `json:"dir,omitempty"`
	Env           []string     `json:"env,omitempty"`
	Optional      bool         `json:"optional,omitempty"`
	Restart       Restart      `json:"restart,omitempty"`
	MaxRestarts   *int         `json:"max_restarts,omitempty"`
	Backoff       *backoffJSON `json:"backoff,omitempty"`
	ShutdownGrace *durationSecond `json:"shutdown_grace,omitempty"`
}

type configJSON struct {
	Version         int             `json:"version,omitempty"`
	ShutdownTimeout *durationSecond `json:"shutdown_timeout,omitempty"`
	HealthInterval  *durationSecond `json:"health_interval,omitempty"`
	LogLevel        string          `json:"log_level,omitempty"`
	Processes       []processJSON   `json:"processes"`
}

// UnmarshalJSON liest die Dateiform: Zeiten als Sekunden, backoff als Objekt.
func (c *Config) UnmarshalJSON(raw []byte) error {
	var cj configJSON
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&cj); err != nil {
		return fmt.Errorf("%w: JSON: %w", ErrInvalidConfig, err)
	}
	if dec.More() {
		return fmt.Errorf("%w: zusaetzliche Daten nach dem JSON-Objekt", ErrInvalidConfig)
	}
	c.Version = cj.Version
	c.LogLevel = cj.LogLevel
	if cj.ShutdownTimeout != nil {
		c.ShutdownTimeout = time.Duration(*cj.ShutdownTimeout)
	}
	if cj.HealthInterval != nil {
		c.HealthInterval = time.Duration(*cj.HealthInterval)
	}
	c.Processes = make([]Process, 0, len(cj.Processes))
	for _, pj := range cj.Processes {
		p := Process{
			Name:     pj.Name,
			Exec:     pj.Exec,
			Args:     pj.Args,
			Dir:      pj.Dir,
			Env:      pj.Env,
			Optional: pj.Optional,
			Restart:  pj.Restart,
		}
		if pj.MaxRestarts != nil {
			p.MaxRestarts = *pj.MaxRestarts
		}
		if pj.ShutdownGrace != nil {
			p.ShutdownGrace = time.Duration(*pj.ShutdownGrace)
		}
		if pj.Backoff != nil {
			if pj.Backoff.Initial != nil {
				p.Backoff.Initial = time.Duration(*pj.Backoff.Initial)
			}
			if pj.Backoff.Max != nil {
				p.Backoff.Max = time.Duration(*pj.Backoff.Max)
			}
			p.Backoff.Factor = pj.Backoff.Factor
			if pj.Backoff.Jitter != nil {
				p.Backoff.Jitter = *pj.Backoff.Jitter
			}
		}
		c.Processes = append(c.Processes, p)
	}
	return nil
}

// Load liest die Konfiguration von path. Das Format wird an der Endung
// erkannt: .yaml/.yml als YAML-Teilmenge, alles andere als JSON.
func Load(path string) (Config, error) {
	if strings.TrimSpace(path) == "" {
		return Config{}, ErrNoConfigPath
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("%w: %s: %w", ErrInvalidConfig, path, err)
	}
	cfg, err := Parse(raw, filepath.Ext(path))
	if err != nil {
		return Config{}, fmt.Errorf("%w: %s: %w", ErrInvalidConfig, path, err)
	}
	return cfg, nil
}

// Parse liest die Konfiguration aus bytes. ext entscheidet das Format.
func Parse(raw []byte, ext string) (Config, error) {
	var cfg Config
	switch strings.ToLower(ext) {
	case ".yaml", ".yml":
		doc, err := ParseYAMLSubset(raw)
		if err != nil {
			return Config{}, err
		}
		normalized, err := json.Marshal(doc)
		if err != nil {
			return Config{}, fmt.Errorf("YAML: %w", err)
		}
		if err := json.Unmarshal(normalized, &cfg); err != nil {
			return Config{}, fmt.Errorf("YAML: %w", err)
		}
	default:
		if err := json.Unmarshal(raw, &cfg); err != nil {
			return Config{}, fmt.Errorf("%w: JSON: %w", ErrInvalidConfig, err)
		}
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// SortNames ist eine Hilfe fuer stabile Ausgaben.
func SortNames(names []string) []string {
	out := append([]string(nil), names...)
	sort.Strings(out)
	return out
}
