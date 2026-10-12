package main

import (
	"errors"
	"flag"
	"fmt"
	"io"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/policy"
	"github.com/LangLi7/prometheus-harness/services/pmh-nix/internal/service"
)

// doDetect meldet ehrlich, ob echte Actuation auf diesem Wirt moeglich ist.
// Detect veraendert nichts; auch die Antwort "nicht verfuegbar" ist ein
// gelungener Aufruf (Exit 0), denn sie ist die Wahrheit.
func doDetect(svc *service.Service, opts options, base response, stdout, stderr io.Writer) int {
	fs := subFlags("detect", true)
	_ = fs.Parse(opts.rest)

	cap, err := svc.Detect()
	if err != nil {
		base.ExitCode = exitCodeFor(err)
		base.Error = err.Error()
		return finish(stdout, opts.jsonOut, base, stdout, stderr)
	}
	base.ExitCode = ExitOK
	base.Data = cap
	base.Message = fmt.Sprintf("backend %s: verfuegbar=%t — %s", cap.Backend, cap.Available, cap.Reason)
	return finish(stdout, opts.jsonOut, base, stdout, stderr)
}

// doPropose nimmt einen Vorschlag auf und zeigt den Diff. Das ist die einzige
// Handlung, die ein Modell ausloesen darf.
func doPropose(svc *service.Service, opts options, base response, stdout, stderr io.Writer) int {
	fs := subFlags("propose", true)
	flake := fs.String("flake", "", "Pfad zum Nix-Flake der Systembeschreibung (erforderlich)")
	target := fs.String("target", "", "Zielrechner; leer heisst der lokale Wirt")
	summary := fs.String("summary", "", "Kurzfassung des Vorschlags")
	if err := fs.Parse(opts.rest); err != nil {
		return usageError(base, stdout, stderr, opts.jsonOut, err)
	}
	if *flake == "" {
		return usageError(base, stdout, stderr, opts.jsonOut, errors.New("propose: --flake fehlt"))
	}

	res, err := svc.Propose(*flake, *target, *summary)
	if err != nil {
		base.ExitCode = exitCodeFor(err)
		base.Error = err.Error()
		return finish(stdout, opts.jsonOut, base, stdout, stderr)
	}
	base.ExitCode = ExitOK
	base.Data = res
	base.Message = fmt.Sprintf("vorschlag %s aufgenommen — anwenden erst nach check --proposal %s",
		res.Proposal.ID, res.Proposal.ID)
	return finish(stdout, opts.jsonOut, base, stdout, stderr)
}

// doCheck prueft statisch. Sperrt ein Befund der Schwere error, ist das ein
// Politikfehler: Exit 1.
func doCheck(svc *service.Service, opts options, base response, stdout, stderr io.Writer) int {
	fs := subFlags("check", true)
	proposal := fs.String("proposal", "", "Kennung aus propose (erforderlich)")
	if err := fs.Parse(opts.rest); err != nil {
		return usageError(base, stdout, stderr, opts.jsonOut, err)
	}
	if *proposal == "" {
		return usageError(base, stdout, stderr, opts.jsonOut, errors.New("check: --proposal fehlt"))
	}

	res, err := svc.Check(*proposal)
	if err != nil {
		base.ExitCode = exitCodeFor(err)
		base.Error = err.Error()
		return finish(stdout, opts.jsonOut, base, stdout, stderr)
	}
	base.Data = res
	base.Message = res.Message
	if res.Blocked {
		base.ExitCode = ExitPolicy
		base.Error = fmt.Sprintf("pruefung von %s ergab %d sperrende Befund(e)",
			res.ProposalID, len(policy.BlockingFindings(res.Findings)))
	} else {
		base.ExitCode = ExitOK
	}
	return finish(stdout, opts.jsonOut, base, stdout, stderr)
}

// doApply wendet einen geprueften, zugelassenen Vorschlag an. Es gibt keinen
// Weg an propose und check vorbei.
func doApply(svc *service.Service, opts options, base response, stdout, stderr io.Writer) int {
	fs := subFlags("apply", true)
	proposal := fs.String("proposal", "", "Kennung aus propose (erforderlich)")
	if err := fs.Parse(opts.rest); err != nil {
		return usageError(base, stdout, stderr, opts.jsonOut, err)
	}
	if *proposal == "" {
		return usageError(base, stdout, stderr, opts.jsonOut, errors.New("apply: --proposal fehlt"))
	}

	res, err := svc.Apply(*proposal)
	if err != nil {
		base.ExitCode = exitCodeFor(err)
		base.Error = err.Error()
		return finish(stdout, opts.jsonOut, base, stdout, stderr)
	}
	base.ExitCode = ExitOK
	base.Data = res
	base.Message = res.Message
	return finish(stdout, opts.jsonOut, base, stdout, stderr)
}

// doGenerations listet die Generationen, neueste zuerst.
func doGenerations(svc *service.Service, opts options, base response, stdout, stderr io.Writer) int {
	fs := subFlags("generations", true)
	_ = fs.Parse(opts.rest)

	res, err := svc.Generations()
	if err != nil {
		base.ExitCode = exitCodeFor(err)
		base.Error = err.Error()
		return finish(stdout, opts.jsonOut, base, stdout, stderr)
	}
	base.ExitCode = ExitOK
	base.Data = res
	base.Message = res.Message
	return finish(stdout, opts.jsonOut, base, stdout, stderr)
}

// doRollback schaltet auf eine vorhandene Generation zurueck.
func doRollback(svc *service.Service, opts options, base response, stdout, stderr io.Writer) int {
	fs := subFlags("rollback", true)
	to := fs.String("to", "", "Kennung der Zielgeneration (erforderlich)")
	if err := fs.Parse(opts.rest); err != nil {
		return usageError(base, stdout, stderr, opts.jsonOut, err)
	}
	if *to == "" {
		return usageError(base, stdout, stderr, opts.jsonOut, errors.New("rollback: --to fehlt"))
	}

	res, err := svc.Rollback(*to)
	if err != nil {
		base.ExitCode = exitCodeFor(err)
		base.Error = err.Error()
		return finish(stdout, opts.jsonOut, base, stdout, stderr)
	}
	base.ExitCode = ExitOK
	base.Data = res
	base.Message = res.Message
	return finish(stdout, opts.jsonOut, base, stdout, stderr)
}

// usageError meldet einen fehlerhaften Aufruf: Exit 2, Meldung nach stderr.
func usageError(base response, stdout, stderr io.Writer, jsonOut bool, err error) int {
	base.ExitCode = ExitUsage
	base.Error = err.Error()
	if errors.Is(err, flag.ErrHelp) {
		base.ExitCode = ExitOK
		base.Error = ""
	}
	return finish(stdout, jsonOut, base, stdout, stderr)
}
