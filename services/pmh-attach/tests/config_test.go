package tests_test

import (
	"strings"
	"testing"

	"github.com/LangLi7/prometheus-harness/services/pmh-attach/internal/attach"
)

// TestWildcardBindRejectedWithoutFlag prueft die Haltung des Upstream-Hosts:
// ein Wildcard-Bind ist ohne ausdrueckliche Erlaubnis ein Fehler.
func TestWildcardBindRejectedWithoutFlag(t *testing.T) {
	faelle := []string{"0.0.0.0", "::", "[::]", "0:0:0:0:0:0:0:0", " 0.0.0.0 "}
	for _, host := range faelle {
		addr, err := attach.Adresse(host, 8090, false)
		if err == nil {
			t.Errorf("Host %q wurde angenommen (%s), erwartet Ablehnung", host, addr)
			continue
		}
		if !strings.Contains(err.Error(), "--allow-wildcard") {
			t.Errorf("Host %q: Fehler nennt das Flag nicht: %v", host, err)
		}
		if !strings.Contains(err.Error(), "jede Schnittstelle") {
			t.Errorf("Host %q: Fehler erklaert die Folge nicht: %v", host, err)
		}
	}
}

// TestWildcardBindAllowedWithFlag prueft die ausdrueckliche Erlaubnis.
func TestWildcardBindAllowedWithFlag(t *testing.T) {
	addr, err := attach.Adresse("0.0.0.0", 8090, true)
	if err != nil {
		t.Fatalf("mit --allow-wildcard erwartet Erfolg, bekam %v", err)
	}
	if addr != "0.0.0.0:8090" {
		t.Errorf("Adresse = %q", addr)
	}
}

// TestLocalBindAccepted prueft die Vorgabe und weitere lokale Adressen.
func TestLocalBindAccepted(t *testing.T) {
	faelle := map[string]string{
		"127.0.0.1": "127.0.0.1:8090",
		"localhost": "localhost:8090",
		"::1":       "[::1]:8090",
	}
	for host, want := range faelle {
		addr, err := attach.Adresse(host, 8090, false)
		if err != nil {
			t.Errorf("Host %q wurde abgelehnt: %v", host, err)
			continue
		}
		if addr != want {
			t.Errorf("Host %q: Adresse = %q, erwartet %q", host, addr, want)
		}
	}
}

// TestIstWildcardErkenntNurWildcards prueft die Erkennung selbst.
func TestIstWildcardErkenntNurWildcards(t *testing.T) {
	if !attach.IstWildcard("0.0.0.0") || !attach.IstWildcard("::") {
		t.Error("Wildcard-Adressen muessen erkannt werden")
	}
	for _, host := range []string{"127.0.0.1", "::1", "localhost", "10.0.0.5"} {
		if attach.IstWildcard(host) {
			t.Errorf("Host %q ist kein Wildcard", host)
		}
	}
}

// TestInvalidPortRejected prueft die Portgrenze.
func TestInvalidPortRejected(t *testing.T) {
	for _, port := range []int{-1, 65536, 99999} {
		if _, err := attach.Adresse("127.0.0.1", port, false); err == nil {
			t.Errorf("Port %d wurde angenommen", port)
		}
	}
	// Port 0 ist erlaubt: das Betriebssystem waehlt einen freien Port.
	if _, err := attach.Adresse("127.0.0.1", 0, false); err != nil {
		t.Errorf("Port 0 muss erlaubt sein: %v", err)
	}
}

// TestEmptyHostRejected prueft den fehlenden Host.
func TestEmptyHostRejected(t *testing.T) {
	if _, err := attach.Adresse("   ", 8090, false); err == nil {
		t.Error("leerer Host wurde angenommen")
	}
}

// TestUnresolvableHostRejected prueft einen Host, der weder IP noch aufloesbar
// ist. Die Ablehnung ist sichtbar — kein Start auf einer Adresse, die es nicht
// gibt.
func TestUnresolvableHostRejected(t *testing.T) {
	if _, err := attach.Adresse("gibt.es.nicht.invalid", 8090, false); err == nil {
		t.Error("nicht aufloesbarer Host wurde angenommen")
	}
}
