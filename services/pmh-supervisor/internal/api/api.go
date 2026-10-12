// Package api enthaelt die nach aussen sichtbare Schnittstelle des
// Supervisors: die Antworttypen und den HTTP-Handler.
//
// Der Vertrag ist bewusst klein. Der JS-Core ruft:
//
//	GET /healthz   Lebt der Supervisor? (immer 200, solange er antwortet)
//	GET /version   Version und Build-Angaben
//	GET /status    vollstaendiger Zustand aller Dienste
//	GET /status/{name}
//
// Alles ist JSON. Fehler haben die Form {"error": {"code": ..., "message": ...}}
// damit der Aufrufer nicht Fehlertexte vergleichen muss.
package api

import "github.com/LangLi7/prometheus-harness/services/pmh-supervisor/internal/supervisor"

// Version beschreibt den laufenden Supervisor.
type Version struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Commit  string `json:"commit,omitempty"`
	Built   string `json:"built,omitempty"`
	Go      string `json:"go"`
	OS      string `json:"os"`
	Arch    string `json:"arch"`
}

// Health ist die Antwort auf GET /healthz. Sie ist auch dann 200, wenn ein
// Dienst ausgefallen ist: der Supervisor selbst lebt. Der Zustand steht in
// "ok" und "degraded" — sichtbar, aber nicht als Transportfehler.
type Health struct {
	OK       bool   `json:"ok"`
	Degraded bool   `json:"degraded"`
	Shutdown bool   `json:"shutting_down"`
	UptimeS  float64 `json:"uptime_s"`
}

// Status ist die Antwort auf GET /status.
type Status struct {
	OK        bool                      `json:"ok"`
	Degraded  bool                      `json:"degraded"`
	Started   bool                      `json:"started"`
	Shutdown  bool                      `json:"shutting_down"`
	PID       int                       `json:"pid"`
	StartedAt string                    `json:"started_at,omitempty"`
	UptimeS   float64                   `json:"uptime_s"`
	Processes []supervisor.ProcessStatus `json:"processes"`
}

// ErrorBody ist der Fehlerkoerper aller Endpunkte.
type ErrorBody struct {
	Error ErrorDetail `json:"error"`
}

// ErrorDetail benennt den Fehler maschinenlesbar.
type ErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Fehlercodes (stabil, Teil des Vertrags — MAPPING.md §7).
const (
	CodeUnknownProcess = "unknown_process"
	CodeBadRequest     = "bad_request"
	CodeNotFound       = "not_found"
	CodeMethod         = "method_not_allowed"
	CodeInternal       = "internal"
)
