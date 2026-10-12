// Command pmh-supervisor startet die in einer Dienstbeschreibung deklarierten
// Kindprozesse, ueberwacht sie, startet sie mit exponentieller Verzoegerung neu
// und beendet sie sauber in umgekehrter Reihenfolge.
//
// Es ist der erste Go-Dienst des Projekts (docs/stack.md,
// docs/decisions/open-questions.md §4: "Startup-Supervisor zuerst"). Er
// realisiert die Regel "Dienste starten mit der Harness und scheitern sichtbar".
//
//	pmh-supervisor --config services.yaml
//	pmh-supervisor --config services.yaml --check
//	pmh-supervisor --config services.yaml --listen 127.0.0.1 --port 7711
//
// Exit-Codes: siehe internal/supervisor (0 ok, 1 Aufruf, 2 Konfiguration,
// 3 Dienst gescheitert, 4 Abschaltfrist, 5 Status-Port belegt).
package main

import (
	"context"
	"encoding/json"
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
	"syscall"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-supervisor/internal/api"
	"github.com/LangLi7/prometheus-harness/services/pmh-supervisor/internal/config"
	"github.com/LangLi7/prometheus-harness/services/pmh-supervisor/internal/env"
	"github.com/LangLi7/prometheus-harness/services/pmh-supervisor/internal/supervisor"
)

// Build-Angaben; per -ldflags -X gesetzt.
var (
	version = "0.1.0"
	commit  = ""
	built   = ""
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("pmh-supervisor", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() {
		fmt.Fprintf(stderr, "pmh-supervisor %s — startet und ueberwacht Dienste\n\n", version)
		fmt.Fprintf(stderr, "Aufruf:\n  pmh-supervisor --config <datei> [--check] [--port 7711]\n\n")
		fs.PrintDefaults()
	}

	var (
		configPath  = env.String(fs, "config", "", "Pfad zur Dienstbeschreibung (JSON oder YAML-Teilmenge)")
		listenHost  = env.String(fs, "listen", "127.0.0.1", "Bind-Adresse des Status-Endpunkts")
		port        = fs.Int("port", env.IntFallback("port", 7711), "Port des Status-Endpunkts (Umgebung: PMH_PORT)")
		allowRemote = env.Bool(fs, "allow-remote", false, "Bind an 0.0.0.0 erlauben (sonst Fehler)")
		logLevel    = env.String(fs, "log-level", "info", "Log-Stufe: debug, info, warn, error")
		checkOnly   = fs.Bool("check", false, "Konfiguration nur pruefen, nichts starten")
		showVersion = fs.Bool("version", false, "Version ausgeben und beenden")
		noHTTP      = fs.Bool("no-http", false, "ohne Status-Endpunkt laufen")
	)
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return supervisor.ExitOK
		}
		fmt.Fprintf(stderr, "pmh-supervisor: %v\n", err)
		return supervisor.ExitUsage
	}

	if *showVersion {
		fmt.Fprintf(stdout, "pmh-supervisor %s (%s %s/%s, commit %s)\n",
			version, runtime.Version(), runtime.GOOS, runtime.GOARCH, orDash(commit))
		return supervisor.ExitOK
	}

	path, err := env.Required("config", *configPath)
	if err != nil {
		fmt.Fprintf(stderr, "pmh-supervisor: %v\n", err)
		return supervisor.ExitUsage
	}

	logger := newLogger(*logLevel, stderr)

	cfg, err := config.Load(path)
	if err != nil {
		logger.Error("Dienstbeschreibung unlesbar", "pfad", path, "fehler", err)
		return supervisor.ExitConfigInvalid
	}
	logger.Info("Dienstbeschreibung gelesen", "pfad", path,
		"dienste", len(cfg.Processes), "namen", cfg.Names(),
		"abschaltfrist_s", cfg.EffectiveShutdownTimeout().Seconds())
	if *checkOnly {
		logger.Info("Konfiguration in Ordnung, nichts gestartet")
		return supervisor.ExitOK
	}

	addr := net.JoinHostPort(*listenHost, strconv.Itoa(*port))
	if *listenHost != "127.0.0.1" && *listenHost != "localhost" && *listenHost != "::1" {
		if !*allowRemote {
			logger.Error("Bind-Adresse ist nicht lokal", "adresse", *listenHost,
				"hinweis", "mit --allow-remote ausdruecklich erlauben")
			return supervisor.ExitUsage
		}
		logger.Warn("Status-Endpunkt ist von aussen erreichbar", "adresse", addr)
	}

	sup, err := supervisor.New(cfg, supervisor.Options{Logger: logger})
	if err != nil {
		logger.Error("Supervisor nicht baubar", "fehler", err)
		return supervisor.ExitConfigInvalid
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Status-Endpunkt nebenher; er laeuft bis zum Ende dieses Aufrufs.
	cancelHTTP := func() {}
	if *noHTTP {
		logger.Info("Status-Endpunkt abgeschaltet (--no-http)")
	} else {
		httpCtx, httpCancel := context.WithCancel(ctx)
		cancelHTTP = httpCancel
		handler := api.New(sup, api.Build{Version: version, Commit: commit, Built: built}, logger)
		serveErr := make(chan error, 1)
		serveDone := make(chan struct{})
		go func() {
			defer close(serveDone)
			serveErr <- api.Serve(httpCtx, addr, handler, logger)
		}()
		select {
		case err := <-serveErr:
			if err != nil {
				logger.Error("Status-Endpunkt nicht verfuegbar", "adresse", addr, "fehler", err)
				_ = sup.Shutdown()
				return supervisor.ExitHTTPUnavailable
			}
		case <-time.After(100 * time.Millisecond):
			// Kein Fehler in der Anlaufzeit: der Port ist belegt, der Server
			// laeuft bis zum Ende dieses Aufrufs weiter.
		}
		defer func() {
			cancelHTTP()
			<-serveDone
		}()
	}

	startErr := sup.Start()
	status := sup.Status()
	logger.Info("Startlauf beendet", "gestartet", status.Started, "dienste", len(status.Processes))

	var watchErr error
	if startErr == nil {
		watchErr = sup.Watch(ctx)
	}

	shutdownErr := sup.Shutdown()
	final := sup.Status()
	if b, err := json.Marshal(final); err == nil {
		logger.Info("Endzustand", "status", string(b))
	}

	exit := supervisor.ExitOK
	for _, p := range final.Processes {
		if p.State == supervisor.StateFailed && !p.Optional {
			exit = supervisor.ExitServiceFailed
		}
	}
	switch {
	case startErr != nil:
		logger.Error("Start fehlgeschlagen", "fehler", startErr)
		exit = supervisor.ExitServiceFailed
	case watchErr != nil:
		logger.Error("Dienst gescheitert", "fehler", watchErr)
		exit = supervisor.ExitServiceFailed
	}
	if shutdownErr != nil {
		logger.Error("Herunterfahren unvollstaendig", "fehler", shutdownErr)
		if exit == supervisor.ExitOK {
			exit = supervisor.ExitShutdownTimeout
		}
	}
	logger.Info("Supervisor beendet", "exit_code", exit)
	return exit
}

func newLogger(level string, w io.Writer) *slog.Logger {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewTextHandler(w, &slog.HandlerOptions{Level: lvl}))
}

func orDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}
