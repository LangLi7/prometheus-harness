package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation/nix"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/actuation/stub"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/policy"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/service"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/state"
)

// Build-Angaben; per -ldflags -X gesetzt.
var (
	version = "0.1.0"
	commit  = ""
	built   = ""
)

// Exit-Codes des Dienstes. Sie sind Teil des Vertrags.
const (
	// ExitOK heisst: die Handlung ist gelungen.
	ExitOK = 0
	// ExitPolicy heisst: Politik oder Pruefung hat die Handlung verweigert.
	ExitPolicy = 1
	// ExitUsage heisst: der Aufruf ist fehlerhaft.
	ExitUsage = 2
	// ExitBackend heisst: das Backend oder der Start ist gescheitert.
	ExitBackend = 125
)

// usageText ist die Aufrufhilfe.
const usageText = `pmh-nix %s — Selbstaenderung des Systems als gestufter, umkehrbarer Vorgang

Aufruf:
  pmh-nix [--backend stub|nix] [--state <datei>] <unterbefehl> [flags]

Unterbefehle:
  detect                               meldet, ob echte Actuation moeglich ist
  propose --flake <pfad> [--target h]  nimmt einen Vorschlag auf und zeigt den Diff
  check   --proposal <id>              prueft statisch; Befund der Schwere error sperrt
  apply   --proposal <id>              wendet an; nur geprueft und zugelassen
  generations                          listet die Generationen, neueste zuerst
  rollback --to <generation-id>        schaltet auf eine Generation zurueck

Globale Flags:
  --backend <name>   stub (Vorgabe) oder nix; Umgebung: PMH_NIX_BACKEND
  --state <datei>    Ablage der Buchfuehrung
                     Vorgabe: PMH_HOME/state/pmh-nix.json, sonst ~/.pmh/state/pmh-nix.json
  --json             genau ein JSON-Objekt nach stdout
  --version          Version ausgeben und beenden

Exit-Codes: 0 Erfolg · 1 Politik- oder Pruefungsfehler · 2 Aufruffeher · 125 Backendfehler

Regel: das Modell empfiehlt, die Policy entscheidet — ein Modell loest niemals
einen Systemwechsel aus. Anwenden ist nur nach propose UND check moeglich.
`

// response ist die eine Antwort, die der Dienst ausgibt. Bei --json ist sie
// genau ein JSON-Objekt, nie mehr.
type response struct {
	Command   string `json:"command"`
	Backend   string `json:"backend,omitempty"`
	Schema    int    `json:"schema"`
	OK        bool   `json:"ok"`
	ExitCode  int    `json:"exit_code"`
	Error     string `json:"error,omitempty"`
	Message   string `json:"message,omitempty"`
	Data      any    `json:"data,omitempty"`
	StatePath string `json:"state_path,omitempty"`
}

// options sind die geparsten globalen Flags.
type options struct {
	backend string
	state   string
	jsonOut bool
	version bool
	help    bool
	command string
	rest    []string
}

// globalFlags sind die Flags, die vor UND nach dem Unterbefehl stehen duerfen
// und deshalb aus der ganzen Argumentliste gezogen werden. Der Rest geht an
// den Unterbefehl.
var globalFlags = map[string]bool{
	"-backend": true, "--backend": true,
	"-state": true, "--state": true,
	"-json": true, "--json": true,
	"-version": true, "--version": true,
	"-h": true, "--help": true,
}

func run(args []string, stdout, stderr io.Writer) int {
	opts, err := parseGlobal(args)
	if err != nil {
		fmt.Fprintf(stderr, "pmh-nix: %v\n", err)
		fmt.Fprint(stderr, usage(version))
		return ExitUsage
	}
	if opts.help {
		fmt.Fprint(stdout, usage(version))
		return ExitOK
	}
	if opts.version {
		fmt.Fprintf(stdout, "pmh-nix %s (%s)\n", version, orDash(commit))
		return ExitOK
	}
	if opts.command == "" {
		fmt.Fprintf(stderr, "pmh-nix: unterbefehl fehlt\n")
		fmt.Fprint(stderr, usage(version))
		return ExitUsage
	}

	// Die Buchfuehrung ist die Voraussetzung jeder Handlung. Laesst sie sich
	// nicht oeffnen, ist das ein Startfehler (125), kein Aufruffeher.
	store, err := state.Open(opts.state)
	if err != nil {
		fmt.Fprintf(stderr, "pmh-nix: %v\n", err)
		writeJSON(stdout, opts.jsonOut, response{
			Command: opts.command, Schema: api.Schema, OK: false,
			ExitCode: ExitBackend, Error: err.Error(),
		})
		return ExitBackend
	}
	backend, err := newBackend(opts.backend, store)
	if err != nil {
		fmt.Fprintf(stderr, "pmh-nix: %v\n", err)
		fmt.Fprint(stderr, usage(version))
		return ExitUsage
	}
	svc, err := service.New(store, backend)
	if err != nil {
		fmt.Fprintf(stderr, "pmh-nix: %v\n", err)
		writeJSON(stdout, opts.jsonOut, response{
			Command: opts.command, Schema: api.Schema, OK: false,
			ExitCode: ExitBackend, Error: err.Error(),
		})
		return ExitBackend
	}

	base := response{
		Command:   opts.command,
		Backend:   svc.Backend(),
		Schema:    api.Schema,
		StatePath: svc.Path(),
	}

	switch opts.command {
	case "detect":
		return doDetect(svc, opts, base, stdout, stderr)
	case "propose":
		return doPropose(svc, opts, base, stdout, stderr)
	case "check":
		return doCheck(svc, opts, base, stdout, stderr)
	case "apply":
		return doApply(svc, opts, base, stdout, stderr)
	case "generations":
		return doGenerations(svc, opts, base, stdout, stderr)
	case "rollback":
		return doRollback(svc, opts, base, stdout, stderr)
	default:
		fmt.Fprintf(stderr, "pmh-nix: unbekannter unterbefehl %q\n", opts.command)
		fmt.Fprint(stderr, usage(version))
		return ExitUsage
	}
}

// parseGlobal zieht die globalen Flags aus der ganzen Argumentliste, egal ob
// sie vor oder nach dem Unterbefehl stehen. Was uebrig bleibt, geht an den
// Unterbefehl.
func parseGlobal(args []string) (options, error) {
	opts := options{backend: "stub"}
	if v := envOr("PMH_NIX_BACKEND", ""); v != "" {
		opts.backend = v
	}
	if v := envOr("PMH_NIX_STATE", ""); v != "" {
		opts.state = v
	}
	var rest []string
	for i := 0; i < len(args); i++ {
		arg := args[i]
		name, value, hasValue := splitFlag(arg)
		if !globalFlags[name] {
			rest = append(rest, arg)
			continue
		}
		takeValue := func() (string, error) {
			if hasValue {
				return value, nil
			}
			if i+1 < len(args) {
				i++
				return args[i], nil
			}
			return "", fmt.Errorf("flag %s braucht einen Wert", name)
		}
		switch name {
		case "-backend", "--backend":
			v, err := takeValue()
			if err != nil {
				return opts, err
			}
			opts.backend = v
		case "-state", "--state":
			v, err := takeValue()
			if err != nil {
				return opts, err
			}
			opts.state = v
		case "-json", "--json":
			if hasValue {
				opts.jsonOut = isTrue(value)
			} else {
				opts.jsonOut = true
			}
		case "-version", "--version":
			opts.version = true
		case "-h", "--help":
			opts.help = true
		}
	}
	// Der Unterbefehl ist das erste Argument, das kein Flag ist.
	for i, arg := range rest {
		if !strings.HasPrefix(arg, "-") {
			opts.command = arg
			opts.rest = append(append([]string{}, rest[:i]...), rest[i+1:]...)
			return opts, nil
		}
	}
	opts.rest = rest
	return opts, nil
}

// splitFlag zerlegt "--name=wert" in Name und Wert.
func splitFlag(arg string) (name, value string, hasValue bool) {
	if !strings.HasPrefix(arg, "-") {
		return arg, "", false
	}
	if i := strings.Index(arg, "="); i >= 0 {
		return arg[:i], arg[i+1:], true
	}
	return arg, "", false
}

func isTrue(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

func envOr(name, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(name)); v != "" {
		return v
	}
	return fallback
}

func newBackend(name string, store *state.Store) (actuation.Backend, error) {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "", stub.Name:
		return stub.New(store), nil
	case nix.Name:
		// Das echte Backend ist vorhanden, aber inert: ohne nix auf dem
		// Suchpfad scheitert jeder Aufruf laut (fail-closed).
		return nix.New(), nil
	default:
		return nil, fmt.Errorf("unbekanntes Backend %q (erlaubt: %s, %s)", name, stub.Name, nix.Name)
	}
}

// subFlags baut einen Flagsatz fuer einen Unterbefehl.
func subFlags(command string, quiet bool) *flag.FlagSet {
	fs := flag.NewFlagSet("pmh-nix "+command, flag.ContinueOnError)
	if quiet {
		fs.SetOutput(io.Discard)
	}
	return fs
}

// finish schreibt die Antwort und liefert den Exit-Code.
//
// Der Fehler geht IMMER nach stderr mit dem Praefix "pmh-nix: ", auch bei
// --json: der Exit-Code und der stderr-Text sind der Vertrag, das JSON-Objekt
// auf stdout ist die maschinenlesbare Fassung derselben Antwort.
func finish(w io.Writer, jsonOut bool, r response, stdout io.Writer, stderr io.Writer) int {
	r.Schema = api.Schema
	r.OK = r.ExitCode == ExitOK
	if r.Error != "" {
		fmt.Fprintf(stderr, "pmh-nix: %s\n", r.Error)
	} else if !jsonOut && r.Message != "" {
		fmt.Fprintf(stdout, "%s\n", r.Message)
	}
	writeJSON(w, jsonOut, r)
	return r.ExitCode
}

// writeJSON gibt bei --json genau ein Objekt aus.
func writeJSON(w io.Writer, jsonOut bool, r response) {
	if !jsonOut {
		return
	}
	r.Schema = api.Schema
	r.OK = r.ExitCode == ExitOK
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(r); err != nil {
		fmt.Fprintf(w, "{\"ok\":false,\"error\":%q}\n", err.Error())
	}
}

// exitCodeFor bildet einen Fehler auf den Exit-Code des Vertrags ab.
func exitCodeFor(err error) int {
	var denied *policy.Denied
	if errors.As(err, &denied) {
		return ExitPolicy
	}
	if errors.Is(err, actuation.ErrNotAvailable) {
		// Fail-closed: das Backend kann nicht, also scheitert der Aufruf
		// laut und mit eigenem Code. Es wird nie Erfolg gemeldet.
		return ExitBackend
	}
	if errors.Is(err, actuation.ErrNoGeneration) || errors.Is(err, actuation.ErrUnsupported) {
		return ExitPolicy
	}
	return ExitBackend
}

func orDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}

func usage(v string) string { return fmt.Sprintf(usageText, v) }
