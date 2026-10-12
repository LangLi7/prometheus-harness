// Package env liest Konfigurationswerte aus Flags mit PMH_-Umgebungsvariablen
// als Rueckfall.
//
// Muster (gilt fuer alle Go-Dienste dieses Projekts): jeder Wert hat einen
// Namen, ein Flag und eine Umgebungsvariable PMH_<NAME>. Das Flag gewinnt,
// dann die Umgebungsvariable, dann die Vorgabe. Fehlt ein Pflichtwert, gibt es
// einen klaren Fehler — nie einen stillen Start mit halber Konfiguration.
package env

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// ErrMissing ist der Sentinel fuer fehlende Pflichtwerte.
var ErrMissing = errors.New("fehlende Konfiguration")

// Lookup liefert den Wert aus Flag, sonst aus PMH_<NAME>, sonst empty.
func Lookup(name string) string {
	if v, ok := os.LookupEnv(Prefixed(name)); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

// Prefixed baut den Umgebungsvariablennamen.
func Prefixed(name string) string { return "PMH_" + strings.ToUpper(name) }

// Required liefert einen Pflichtwert oder einen Fehler, der die Quelle nennt.
func Required(name, flagValue string) (string, error) {
	if v := strings.TrimSpace(flagValue); v != "" {
		return v, nil
	}
	if v := Lookup(name); v != "" {
		return v, nil
	}
	return "", fmt.Errorf("%w: %s fehlt (Flag --%s oder %s)",
		ErrMissing, name, strings.ReplaceAll(name, "_", "-"), Prefixed(name))
}

// Optional liefert Flag, dann Umgebung, dann den Vorgabewert.
func Optional(name, flagValue, fallback string) string {
	if v := strings.TrimSpace(flagValue); v != "" {
		return v
	}
	if v := Lookup(name); v != "" {
		return v
	}
	return fallback
}

// Duration liest eine Dauer als Flag mit Umgebungs-Rueckfall und Vorgabe.
func Duration(fs *flag.FlagSet, name string, fallback time.Duration, usage string) *time.Duration {
	def := fallback
	if v := Lookup(name); v != "" {
		if parsed, err := time.ParseDuration(v); err == nil {
			def = parsed
		}
	}
	return fs.Duration(name, def, usage+" (Umgebung: "+Prefixed(name)+")")
}

// String liest einen String als Flag mit Umgebungs-Rueckfall und Vorgabe.
func String(fs *flag.FlagSet, name, fallback, usage string) *string {
	def := fallback
	if v := Lookup(name); v != "" {
		def = v
	}
	return fs.String(name, def, usage+" (Umgebung: "+Prefixed(name)+")")
}

// Bool liest einen Schalter als Flag mit Umgebungs-Rueckfall und Vorgabe.
func Bool(fs *flag.FlagSet, name string, fallback bool, usage string) *bool {
	def := fallback
	if v := Lookup(name); v != "" {
		switch strings.ToLower(v) {
		case "1", "true", "yes", "on":
			def = true
		case "0", "false", "no", "off":
			def = false
		}
	}
	return fs.Bool(name, def, usage+" (Umgebung: "+Prefixed(name)+")")
}

// IntFallback liefert eine Zahl aus der Umgebung oder den Vorgabewert. Fuer
// Faelle, in denen das Flag bereits mit fs.Int angelegt ist.
func IntFallback(name string, fallback int) int {
	if v := Lookup(name); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			return parsed
		}
	}
	return fallback
}
