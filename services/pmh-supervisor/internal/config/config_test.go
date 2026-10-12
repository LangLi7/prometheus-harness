package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const jsonSample = `{
  "version": 1,
  "shutdown_timeout": 5,
  "health_interval": 0.5,
  "log_level": "info",
  "processes": [
    {
      "name": "store",
      "exec": "pmh-store",
      "args": ["serve", "--port", "7720"],
      "env": ["PMH_DATABASE_URL=postgres://localhost/pmh"],
      "restart": "on-failure",
      "max_restarts": 3,
      "backoff": {"initial": 0.25, "max": 5, "factor": 2, "jitter": 0.1},
      "shutdown_grace": 3
    },
    {
      "name": "cache",
      "exec": "pmh-cache",
      "optional": true,
      "restart": "never"
    }
  ]
}`

const yamlSample = `# Dienstbeschreibung
version: 1
shutdown_timeout: 10
health_interval: 1
processes:
  - name: store
    exec: pmh-store
    args: ["serve", "--port", "7720"]
    env:
      - PMH_DATABASE_URL=postgres://localhost/pmh
    restart: on-failure
    max_restarts: 3     # endlich, damit ein Fehler sichtbar wird
    backoff:
      initial: 0.25
      max: 5
      factor: 2
      jitter: 0.1
    shutdown_grace: 3
  - name: cache
    exec: pmh-cache
    optional: true
    restart: never
`

func TestParseJSON(t *testing.T) {
	cfg, err := Parse([]byte(jsonSample), ".json")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if cfg.Version != 1 {
		t.Errorf("Version = %d, erwartet 1", cfg.Version)
	}
	if got, want := cfg.EffectiveShutdownTimeout(), 5*time.Second; got != want {
		t.Errorf("Abschaltfrist = %s, erwartet %s", got, want)
	}
	if got, want := cfg.EffectiveHealthInterval(), 500*time.Millisecond; got != want {
		t.Errorf("Pruefintervall = %s, erwartet %s", got, want)
	}
	if got := cfg.Names(); len(got) != 2 || got[0] != "store" || got[1] != "cache" {
		t.Fatalf("Namen = %v", got)
	}
	store := cfg.Processes[0]
	if store.Exec != "pmh-store" || len(store.Args) != 3 {
		t.Errorf("store = %+v", store)
	}
	if got, want := store.BackoffFor().Initial, 250*time.Millisecond; got != want {
		t.Errorf("backoff.initial = %s, erwartet %s", got, want)
	}
	if got := store.MaxRestartsFor(); got != 3 {
		t.Errorf("max_restarts = %d, erwartet 3", got)
	}
	if got := store.GraceFor(DefaultShutdownTimeout); got != 3*time.Second {
		t.Errorf("shutdown_grace = %s, erwartet 3s", got)
	}
	cache := cfg.Processes[1]
	if !cache.Optional {
		t.Error("cache muss optional sein")
	}
	if got := cache.MaxRestartsFor(); got != 0 {
		t.Errorf("cache max_restarts = %d, erwartet 0 (Politik never)", got)
	}
}

func TestParseYAML(t *testing.T) {
	cfg, err := Parse([]byte(yamlSample), ".yaml")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(cfg.Processes) != 2 {
		t.Fatalf("%d Dienste, erwartet 2", len(cfg.Processes))
	}
	store := cfg.Processes[0]
	if store.Name != "store" || store.Exec != "pmh-store" {
		t.Errorf("store = %+v", store)
	}
	if len(store.Args) != 3 || store.Args[2] != "7720" {
		t.Errorf("args = %v", store.Args)
	}
	if len(store.Env) != 1 || !strings.HasPrefix(store.Env[0], "PMH_DATABASE_URL=") {
		t.Errorf("env = %v", store.Env)
	}
	if got := store.RestartPolicy(); got != RestartOnFailure {
		t.Errorf("restart = %q", got)
	}
	if got := store.MaxRestartsFor(); got != 3 {
		t.Errorf("max_restarts = %d, erwartet 3", got)
	}
	if got := store.BackoffFor().Max; got != 5*time.Second {
		t.Errorf("backoff.max = %s, erwartet 5s", got)
	}
	if got := cfg.Processes[1].RestartPolicy(); got != RestartNever {
		t.Errorf("cache restart = %q, erwartet never", got)
	}
	// Dieselbe Datei in JSON und YAML muss dieselbe Wirkung haben.
	jcfg, err := Parse([]byte(jsonSample), ".json")
	if err != nil {
		t.Fatalf("Parse JSON: %v", err)
	}
	if len(jcfg.Processes) != len(cfg.Processes) {
		t.Fatalf("JSON und YAML liefern unterschiedlich viele Dienste")
	}
	for i := range cfg.Processes {
		if cfg.Processes[i].Name != jcfg.Processes[i].Name {
			t.Errorf("Dienst %d: %q vs %q", i, cfg.Processes[i].Name, jcfg.Processes[i].Name)
		}
		if cfg.Processes[i].BackoffFor() != jcfg.Processes[i].BackoffFor() {
			t.Errorf("Dienst %d: Backoff unterschiedlich", i)
		}
	}
}

func TestParseRejectsBadInput(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		ext  string
		want error
	}{
		{"leere Liste", `{"processes": []}`, ".json", ErrNoProcesses},
		{"ohne Kommando", `{"processes": [{"name": "a"}]}`, ".json", ErrMissingCommand},
		{"doppelter Name", `{"processes": [{"name": "a", "exec": "x"}, {"name": "a", "exec": "y"}]}`, ".json", ErrDuplicateName},
		{"unbekanntes Feld", `{"processes": [{"name": "a", "exec": "x", "tippfehler": 1}]}`, ".json", ErrInvalidConfig},
		{"unbekannte Politik", `{"processes": [{"name": "a", "exec": "x", "restart": "manchmal"}]}`, ".json", ErrInvalidConfig},
		{"kaputtes env", `{"processes": [{"name": "a", "exec": "x", "env": ["ohne-gleich"]}]}`, ".json", ErrInvalidConfig},
		{"negatives Limit", `{"processes": [{"name": "a", "exec": "x", "max_restarts": -5}]}`, ".json", ErrInvalidConfig},
		{"kein JSON", `nicht json`, ".json", ErrInvalidConfig},
		{"yaml Tabulator", "processes:\n\t- name: a\n", ".yaml", ErrYAMLSubset},
		{"yaml unbekannt", "processes:\n  - name: a\n    exec: x\n    quatsch: 1\n", ".yaml", ErrUnknownField},
		{"yaml Blocktext", "log_level: |\n  info\n", ".yaml", ErrYAMLSubset},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Parse([]byte(tc.raw), tc.ext)
			if err == nil {
				t.Fatalf("Parse akzeptierte %q", tc.raw)
			}
			if !errors.Is(err, tc.want) {
				t.Fatalf("Fehler = %v, erwartet %v", err, tc.want)
			}
		})
	}
}

func TestLoadMissingFile(t *testing.T) {
	if _, err := Load(""); !errors.Is(err, ErrNoConfigPath) {
		t.Fatalf("Load(\"\") = %v, erwartet ErrNoConfigPath", err)
	}
	missing := filepath.Join(t.TempDir(), "nicht-da.json")
	if _, err := Load(missing); !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("Load(fehlend) = %v, erwartet ErrInvalidConfig", err)
	}
}

func TestLoadFromDisk(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "services.yaml")
	if err := os.WriteFile(path, []byte(yamlSample), 0o600); err != nil {
		t.Fatalf("schreiben: %v", err)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(cfg.Processes) != 2 {
		t.Fatalf("%d Dienste, erwartet 2", len(cfg.Processes))
	}
}

func TestBackoffDefaults(t *testing.T) {
	p := Process{Name: "a", Exec: "x"}
	b := p.BackoffFor()
	if b.Initial != DefaultBackoffInitial || b.Max != DefaultBackoffMax {
		t.Errorf("Vorgaben nicht angewandt: %+v", b)
	}
	if b.Factor != DefaultBackoffFactor || b.Jitter != DefaultBackoffJitter {
		t.Errorf("Faktor/Jitter falsch: %+v", b)
	}
	// Max kleiner als Initial wird angehoben.
	p.Backoff = Backoff{Initial: 10 * time.Second, Max: time.Second}
	if got := p.BackoffFor().Max; got != 10*time.Second {
		t.Errorf("Max = %s, erwartet 10s", got)
	}
}

func TestRestartValid(t *testing.T) {
	for _, r := range []Restart{RestartNever, RestartOnFailure, RestartAlways} {
		if !r.Valid() {
			t.Errorf("%q muss gueltig sein", r)
		}
	}
	if Restart("vielleicht").Valid() {
		t.Error("unbekannte Politik darf nicht gueltig sein")
	}
	if got := (Process{}).RestartPolicy(); got != DefaultRestart {
		t.Errorf("Vorgabepolitik = %q, erwartet %q", got, DefaultRestart)
	}
}

func TestSortNames(t *testing.T) {
	got := SortNames([]string{"b", "a", "c"})
	if got[0] != "a" || got[2] != "c" {
		t.Fatalf("SortNames = %v", got)
	}
}
