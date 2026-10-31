package main

import (
	"errors"
	"fmt"
	"io"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
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

// doPropose legt einen Branch mit Diff an. Das ist die einzige Handlung, die
// ein Modell ausloesen darf — und sie aktiviert nie.
func doPropose(svc *service.Service, opts options, base response, mode api.Mode, stdout, stderr io.Writer) int {
	fs := subFlags("propose", true)
	flake := fs.String("flake", "", "Pfad zum Nix-Flake der Systembeschreibung (erforderlich)")
	target := fs.String("target", "", "Zielrechner; leer heisst der lokale Wirt")
	summary := fs.String("summary", "", "Kurzfassung des Vorschlags")
	if err := fs.Parse(opts.rest); err != nil {
		return flagError(base, stdout, stderr, opts.jsonOut, err)
	}
	if *flake == "" {
		return usageError(base, stdout, stderr, opts.jsonOut, errors.New("propose: --flake fehlt"))
	}

	res, err := svc.Propose(mode, *flake, *target, *summary)
	if err != nil {
		base.ExitCode = exitCodeFor(err)
		base.Error = err.Error()
		return finish(stdout, opts.jsonOut, base, stdout, stderr)
	}
	base.ExitCode = ExitOK
	base.Data = res
	base.Message = fmt.Sprintf("vorschlag %s aufgenommen (Branch %s, Commit %s) — nichts aktiviert; "+
		"weiter mit check --proposal %s, dann approve --proposal %s --by <wer>",
		res.Proposal.ID, res.Branch.Name, res.Branch.Commit, res.Proposal.ID, res.Proposal.ID)
	return finish(stdout, opts.jsonOut, base, stdout, stderr)
}

// doCheck ist der Pruefbau ohne Aktivierung. Sperrt ein Befund der Schwere
// error, ist das ein Politikfehler: Exit 1.
func doCheck(svc *service.Service, opts options, base response, stdout, stderr io.Writer) int {
	fs := subFlags("check", true)
	proposal := fs.String("proposal", "", "Kennung aus propose (erforderlich)")
	if err := fs.Parse(opts.rest); err != nil {
		return flagError(base, stdout, stderr, opts.jsonOut, err)
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
		base.Error = fmt.Sprintf("pruefbau von %s ergab %d sperrende Befund(e)",
			res.ProposalID, len(policy.BlockingFindings(res.Findings)))
	} else {
		base.ExitCode = ExitOK
	}
	return finish(stdout, opts.jsonOut, base, stdout, stderr)
}

// doApprove zeichnet die ausdrueckliche menschliche Freigabe auf: wer, wann,
// welcher Diff, welche Basisgeneration. Ohne sie laeuft keine Anwendung.
func doApprove(svc *service.Service, opts options, base response, stdout, stderr io.Writer) int {
	fs := subFlags("approve", true)
	proposal := fs.String("proposal", "", "Kennung aus propose (erforderlich)")
	by := fs.String("by", "", "Identitaet der freigebenden Person (erforderlich)")
	note := fs.String("note", "", "Bemerkung zur Freigabe")
	if err := fs.Parse(opts.rest); err != nil {
		return flagError(base, stdout, stderr, opts.jsonOut, err)
	}
	if *proposal == "" {
		return usageError(base, stdout, stderr, opts.jsonOut, errors.New("approve: --proposal fehlt"))
	}
	if *by == "" {
		return usageError(base, stdout, stderr, opts.jsonOut,
			errors.New("approve: --by fehlt: wer freigibt, muss benannt sein"))
	}

	res, err := svc.Approve(*proposal, *by, *note)
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

// doApply ist die Activation. Es gibt keinen Weg an propose, check und
// Freigabe vorbei.
func doApply(svc *service.Service, opts options, base response, stdout, stderr io.Writer) int {
	fs := subFlags("apply", true)
	proposal := fs.String("proposal", "", "Kennung aus propose (erforderlich)")
	if err := fs.Parse(opts.rest); err != nil {
		return flagError(base, stdout, stderr, opts.jsonOut, err)
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
		return flagError(base, stdout, stderr, opts.jsonOut, err)
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

// usageError meldet einen fehlerhaften Aufruf: Exit 2, Meldung nach stderr,
// bei --json genau ein Objekt nach stdout. Sie ist die Kurzform von
// flagError fuer Aufrufe, die schon wissen, was fehlt.
func usageError(base response, stdout, stderr io.Writer, jsonOut bool, err error) int {
	return flagError(base, stdout, stderr, jsonOut, err)
}
