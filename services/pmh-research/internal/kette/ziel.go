// Package kette — der Schutz vor abgerufenen Zielen.
//
// # Warum das eine eigene Datei ist
//
// Ein Recherchedienst, der jede URL abruft, ist eine Waffe gegen das eigene Netz:
// „http://127.0.0.1:8080/admin" oder „http://169.254.169.254/latest/meta-data"
// sind gewoehnliche URLs, und ein Modell, das sie weiterreicht, greift damit auf
// Dienste zu, die ihm niemand geoeffnet hat (SSRF).
//
// Die Regel hier ist die vorsichtige: **privat heisst nein**, und wer es anders
// will, sagt es ausdruecklich. Das ist keine Formalie — der Unterschied zwischen
// „der Dienst kann intern lesen" und „der Dienst kann nicht intern lesen" ist
// der Unterschied zwischen einem Werkzeug und einem Einbruch.
package kette

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

// ZielFehler nennt, warum ein Ziel nicht abgerufen wird.
type ZielFehler struct {
	Grund string
	Ziel  string
}

func (f *ZielFehler) Error() string {
	return fmt.Sprintf("Ziel abgelehnt (%s): %s", f.Grund, f.Ziel)
}

// cidrListe sind die Bereiche, die niemals abgerufen werden, wenn privater
// Zugriff nicht ausdruecklich erlaubt ist.
//
// Sie steht als Text da und nicht als berechnete Liste: eine Berechnung kann
// eine Zeile verlieren, ein Text faellt beim Lesen auf.
var cidrListe = []string{
	"0.0.0.0/8",          // "dieses Netz"
	"10.0.0.0/8",         // RFC 1918
	"100.64.0.0/10",      // RFC 6598, Traeger-NAT
	"127.0.0.0/8",        // Loopback
	"169.254.0.0/16",     // Link-local — inklusive der Metadaten-Dienste der Cloud
	"172.16.0.0/12",      // RFC 1918
	"192.0.0.0/24",       // IETF-Protokollzuweisungen
	"192.168.0.0/16",     // RFC 1918
	"198.18.0.0/15",      // Benchmarking
	"224.0.0.0/4",        // Multicast
	"240.0.0.0/4",        // reserviert
	"::1/128",            // Loopback v6
	"fc00::/7",           // Unique local v6
	"fe80::/10",          // Link-local v6
	"ff00::/8",           // Multicast v6
}

var verboteneNetze = func() []*net.IPNet {
	netze := make([]*net.IPNet, 0, len(cidrListe))
	for _, eintrag := range cidrListe {
		_, netz, fehler := net.ParseCIDR(eintrag)
		if fehler != nil {
			// Ein kaputter Eintrag darf nicht stillschweigend verschwinden: er
			// wuerde die Liste kuerzer machen, ohne dass es jemand merkt.
			panic(fmt.Sprintf("kette: ungueltiger CIDR-Eintrag %q: %v", eintrag, fehler))
		}
		netze = append(netze, netz)
	}
	return netze
}()

// verboteneNamen sind Namen, die ohne Namensauflösung schon als privat gelten.
var verboteneNamen = []string{"localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"}

// PruefeZiel prueft eine Ziel-URL, bevor sie abgerufen wird.
//
// Geprueft wird: Schema, Benutzerangaben, Host, und — wenn der Host eine
// IP-Adresse ist — deren Bereich. **Nicht** geprueft wird, was ein Name
// spaeter aufloest: das waere ein zweiter Abruf mit eigener Zeit und eigener
// Wettlaufluecke (DNS-Rebinding). Bis das geloest ist, gilt der Name als
// vertrauenswuerdig, sobald er nicht `localhost` heisst — und diese Grenze steht
// im README, statt hier stillschweigend als geloest zu gelten.
func PruefeZiel(ziel string, erlaubtPrivat bool) (*url.URL, error) {
	geparst, fehler := url.Parse(strings.TrimSpace(ziel))
	if fehler != nil {
		return nil, &ZielFehler{Grund: "keine gueltige URL", Ziel: ziel}
	}
	if geparst.Scheme != "http" && geparst.Scheme != "https" {
		return nil, &ZielFehler{Grund: "nur http und https", Ziel: ziel}
	}
	if geparst.User != nil {
		return nil, &ZielFehler{Grund: "Benutzerangaben in der URL", Ziel: ziel}
	}
	host := strings.ToLower(geparst.Hostname())
	if host == "" {
		return nil, &ZielFehler{Grund: "kein Host", Ziel: ziel}
	}
	if erlaubtPrivat {
		return geparst, nil
	}
	for _, name := range verboteneNamen {
		if host == name {
			return nil, &ZielFehler{Grund: "lokaler Name", Ziel: ziel}
		}
	}
	adresse := net.ParseIP(host)
	if adresse == nil {
		// Ein Name, keine Adresse: siehe Grenze im Kommentar oben.
		return geparst, nil
	}
	for _, netz := range verboteneNetze {
		if netz.Contains(adresse) {
			return nil, &ZielFehler{
				Grund: fmt.Sprintf("privater Bereich %s", netz.String()),
				Ziel:  ziel,
			}
		}
	}
	return geparst, nil
}
