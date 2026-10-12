// Command pmh-attach ist der Anhaengepunkt der Harness-Oberflaeche: ein
// HTTP- und WebSocket-Gateway, an das sich mehrere Clients und mehrere
// Ansichten desselben Inhalts anhaengen.
//
// Es ist KEIN Ersatz fuer den Web-Server der Harness. Der TypeScript-Host
// liefert die Oberflaeche weiter aus; pmh-attach tritt daneben und verteilt
// einen Upstream-Strom auf viele Sichten
// (docs/decisions/hybrid-then-self-build.md §3.3, docs/stack.md).
//
//	pmh-attach                                  # nur mit Attrappe, ohne Harness
//	pmh-attach --host 127.0.0.1 --port 8090
//	pmh-attach --upstream http://127.0.0.1:8080 # Strom aus dem Harness
//	pmh-attach --json-logs
//
// Exit-Codes (dieselbe Skala wie pmh-supervisor):
//
//	0 sauber beendet
//	1 Aufruf- oder Adressfehler (auch der Wildcard-Bind ohne --allow-wildcard)
//	2 Konfigurationsfehler
//	3 Port belegt oder Server nicht startbar
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-attach/internal/attach"
)

// Build-Angaben; per -ldflags -X gesetzt.
var (
	version = "0.1.0"
	commit  = ""
	built   = ""
)

// Exit-Codes; sie sind Teil des Vertrags und stehen in der README.
const (
	ExitOK = 0
	// ExitUsage meldet einen Aufruf- oder Adressfehler.
	ExitUsage = 1
	// ExitConfig meldet einen Konfigurationsfehler.
	ExitConfig = 2
	// ExitUnavailable meldet einen nicht startbaren Server.
	ExitUnavailable = 3
)

const (
	defaultHost = "127.0.0.1"
	defaultPort = 8090
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("pmh-attach", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() {
		fmt.Fprintf(stderr, "pmh-attach %s — Anhaengepunkt der Harness-Oberflaeche\n\n", version)
		fmt.Fprintf(stderr, "Aufruf:\n  pmh-attach [--host 127.0.0.1] [--port 8090] [--upstream <url>] [--json-logs]\n\n")
		fs.PrintDefaults()
	}

	var (
		host          = envString(fs, "host", defaultHost, "Bind-Adresse (Wildcard nur mit --allow-wildcard)")
		port          = envInt(fs, "port", defaultPort, "Port des Anhaengepunkts")
		upstream      = envString(fs, "upstream", "", "Upstream des Harness (leer = Attrappe im eigenen Prozess)")
		jsonLogs      = fs.Bool("json-logs", false, "Protokoll als JSON statt als Text")
		allowWildcard = fs.Bool("allow-wildcard", false, "Bind an 0.0.0.0 bzw. :: ausdruecklich erlauben")
		queue         = fs.Int("queue", envIntFallback("queue", attach.DefaultQueue), "Warteschlange je Client in Rahmen")
		history       = fs.Int("history", envIntFallback("history", attach.DefaultHistory), "vorgehaltene Rahmen je Strom fuer resync")
		pingInterval  = fs.Duration("ping-interval", envDurationFallback("ping-interval", 2*time.Second), "Abstand der Herzschlag-Pings (0 schaltet sie ab)")
		versionOnly   = fs.Bool("version", false, "Version ausgeben und beenden")
	)
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return ExitOK
		}
		fmt.Fprintf(stderr, "pmh-attach: %v\n", err)
		return ExitUsage
	}

	if *versionOnly {
		fmt.Fprintf(stdout, "pmh-attach %s (%s %s/%s, commit %s)\n",
			version, runtime.Version(), runtime.GOOS, runtime.GOARCH, orDash(commit))
		return ExitOK
	}

	logger := newLogger(*jsonLogs, stderr)

	addr, err := attach.Adresse(*host, *port, *allowWildcard)
	if err != nil {
		logger.Error("Bind-Adresse abgelehnt", "host", *host, "port", *port, "fehler", err,
			"hinweis", "ein Wildcard-Bind gibt es nur mit --allow-wildcard")
		return ExitUsage
	}
	if attach.IstWildcard(*host) {
		logger.Warn("Anhaengepunkt ist von aussen erreichbar", "adresse", addr)
	}

	if *queue < 1 {
		logger.Error("Warteschlange muss mindestens 1 sein", "queue", *queue)
		return ExitConfig
	}
	if *history < 0 {
		logger.Error("History darf nicht negativ sein", "history", *history)
		return ExitConfig
	}
	if *pingInterval < 0 {
		logger.Error("Ping-Abstand darf nicht negativ sein", "ping-interval", pingInterval.String())
		return ExitConfig
	}

	// Endpunkt: Attrappe im eigenen Prozess oder der echte Harness. Ein
	// nicht erreichbarer Upstream wird beim Start GEMELDET und beendet den
	// Dienst nicht — /healthz muss ohne Harness laufen. Beim Anhaengen
	// scheitert er dann sichtbar.
	var endpoint attach.Endpoint
	upstreamStatus := "memory (Attrappe im eigenen Prozess, kein Harness noetig)"
	if strings.TrimSpace(*upstream) != "" {
		remote, err := attach.NewRemote(*upstream, logger)
		if err != nil {
			logger.Error("Upstream-Adresse unbrauchbar", "upstream", *upstream, "fehler", err)
			return ExitConfig
		}
		endpoint = remote
		upstreamStatus = remote.Name()
		probeCtx, cancel := context.WithTimeout(context.Background(), attach.ProbeTimeout)
		probeErr := remote.WarteAufUpstream(probeCtx)
		cancel()
		if probeErr != nil {
			logger.Warn("Upstream antwortet nicht; /healthz laeuft trotzdem, Anhaengen scheitert sichtbar",
				"upstream", *upstream, "fehler", probeErr)
		} else {
			logger.Info("Upstream erreichbar", "upstream", *upstream)
		}
	} else {
		endpoint = attach.NewMemory(logger)
	}

	hub := attach.New(endpoint, attach.Config{Queue: *queue, History: *history}, logger)
	server := attach.NewServer(hub, attach.ServerConfig{
		Hub:          attach.Config{Queue: *queue, History: *history},
		PingInterval: *pingInterval,
	}, attach.Build{Version: version, Commit: commit, Built: built}, logger)

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		logger.Error("Port nicht bindbar", "adresse", addr, "fehler", err)
		return ExitUnavailable
	}
	actual := ln.Addr().String()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	logger.Info("Anhaengepunkt startet",
		"version", version, "go", runtime.Version(),
		"adresse", "http://"+actual,
		"healthz", api.HealthPath, "attach", api.AttachPath,
		"upstream", upstreamStatus,
		"queue", *queue, "history", *history, "ping_interval_s", pingInterval.Seconds())

	serveErr := make(chan error, 1)
	go func() { serveErr <- attach.ServeListener(ctx, ln, server, logger) }()

	exit := ExitOK
	select {
	case err := <-serveErr:
		if err != nil {
			logger.Error("Server beendet", "fehler", err)
			exit = ExitUnavailable
		}
	case <-ctx.Done():
		logger.Info("Signal empfangen, Anhaengepunkt wird beendet")
		hub.Shutdown()
		if err := <-serveErr; err != nil {
			logger.Error("Server beendet", "fehler", err)
			exit = ExitUnavailable
		}
	}
	hub.Shutdown()
	logger.Info("Anhaengepunkt beendet", "exit_code", exit)
	return exit
}

// newLogger baut das Protokoll: Text oder JSON.
func newLogger(jsonLogs bool, w io.Writer) *slog.Logger {
	opts := &slog.HandlerOptions{Level: slog.LevelInfo}
	if jsonLogs {
		return slog.New(slog.NewJSONHandler(w, opts))
	}
	return slog.New(slog.NewTextHandler(w, opts))
}

// ---------------------------------------------------------------------------
// Flags mit Umgebungsrueckfall
// ---------------------------------------------------------------------------

// Muster wie in pmh-supervisor (internal/env): jeder Wert hat ein Flag und
// eine Umgebungsvariable PMH_ATTACH_<NAME>. Das Flag gewinnt, dann die
// Umgebung, dann die Vorgabe.

func envName(name string) string {
	return "PMH_ATTACH_" + strings.ToUpper(strings.ReplaceAll(name, "-", "_"))
}

func envString(fs *flag.FlagSet, name, fallback, usage string) *string {
	def := fallback
	if v, ok := os.LookupEnv(envName(name)); ok && strings.TrimSpace(v) != "" {
		def = strings.TrimSpace(v)
	}
	return fs.String(name, def, usage+" (Umgebung: "+envName(name)+")")
}

func envInt(fs *flag.FlagSet, name string, fallback int, usage string) *int {
	return fs.Int(name, envIntFallback(name, fallback), usage+" (Umgebung: "+envName(name)+")")
}

func envIntFallback(name string, fallback int) int {
	if v, ok := os.LookupEnv(envName(name)); ok {
		if parsed, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return parsed
		}
	}
	return fallback
}

func envDurationFallback(name string, fallback time.Duration) time.Duration {
	if v, ok := os.LookupEnv(envName(name)); ok {
		if parsed, err := time.ParseDuration(strings.TrimSpace(v)); err == nil {
			return parsed
		}
	}
	return fallback
}

func orDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}
