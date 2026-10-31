// Package kette ist die Recherche-Kette: Metasuche ueber SearXNG, Extraktion
// ueber Firecrawl, Rueckfall auf einen nackten Abruf.
//
// # Die eine Regel dieses Pakets
//
// Ein Anbieter, der scheitert, wird **genannt** — nicht verschwiegen. Der Bericht
// fuehrt jeden Versuch mit Dauer und Fehlertext; „keine Treffer" ist damit eine
// Aussage ueber alle Anbieter und nicht eine ueber den ersten.
//
// # Was hier absichtlich NICHT geschieht
//
// Kein Anbieter wird „still" uebersprungen: faellt SearXNG aus und liefert
// Firecrawl, steht das im Bericht — ein Nutzer, der die Quelle nicht kennt,
// kann das Ergebnis nicht einordnen.
//
// Kein Ergebnis wird zusammengefuehrt, sortiert nach Relevanz oder „verbessert".
// Eine Kette, die die Treffer mehrerer Anbieter mischt, erfindet eine Rangfolge,
// die keiner der Anbieter behauptet hat.
package kette

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"
)

// Treffer ist ein einzelnes Suchergebnis — immer mit seiner Herkunft.
type Treffer struct {
	Titel string `json:"titel"`
	URL   string `json:"url"`
	Auszug string `json:"auszug,omitempty"`
	// Herkunft nennt den Anbieter, der diesen Treffer geliefert hat. Ohne sie
	// waere ein Ergebnis nicht einzuordnen — und bei mehreren Anbietern nicht
	// unterscheidbar.
	Herkunft string `json:"herkunft"`
}

// Versuch ist der Nachweis eines einzelnen Anbieteraufrufs.
type Versuch struct {
	Anbieter string `json:"anbieter"`
	DauerMS  int64  `json:"dauerMs"`
	// Fehler ist leer, wenn der Anbieter geantwortet hat. Ein Anbieter, der
	// geantwortet und **nichts** gefunden hat, ist kein Fehler — das ist der
	// Unterschied zwischen „kaputt" und „leer", und er wird nicht verwischt.
	Fehler  string `json:"fehler,omitempty"`
	Treffer int    `json:"treffer"`
}

// Suchbericht ist das Ergebnis einer Metasuche.
type Suchbericht struct {
	Suchanfrage string    `json:"suchanfrage"`
	Treffer     []Treffer `json:"treffer"`
	Versuche    []Versuch `json:"versuche"`
	// Herkunft ist der Anbieter, der geliefert hat; leer, wenn keiner lieferte.
	Herkunft string `json:"herkunft,omitempty"`
}

// Seitenbericht ist das Ergebnis eines Abrufs.
type Seitenbericht struct {
	Ziel     string    `json:"ziel"`
	URL      string    `json:"url"`
	Titel    string    `json:"titel,omitempty"`
	Text     string    `json:"text"`
	Bytes    int64     `json:"bytes"`
	Versuche []Versuch `json:"versuche"`
	Herkunft string    `json:"herkunft,omitempty"`
}

// Seite ist eine abgerufene Seite, wie ein Anbieter sie liefert.
type Seite struct {
	URL   string
	Titel string
	Text  string
	Bytes int64
}

// SucheAnbieter ist die Schnittstelle einer Metasuche.
type SucheAnbieter interface {
	Name() string
	Suche(ctx context.Context, anfrage string, grenze int) ([]Treffer, error)
}

// HoleAnbieter ist die Schnittstelle einer Extraktion.
type HoleAnbieter interface {
	Name() string
	Hole(ctx context.Context, ziel string, maxBytes int64) (Seite, error)
}

// ErrNichtsGeliefert heisst: jeder Anbieter wurde versucht und keiner lieferte.
// Der Bericht daneben sagt, woran es lag — die Fehlermeldung allein taete es nicht.
var ErrNichtsGeliefert = errors.New("kein Anbieter lieferte ein Ergebnis")

// Kette ist die geordnete Folge der Anbieter.
//
// Die Reihenfolge ist bindend und wird nicht neu bewertet: erst was der
// Betreiber eingestellt hat, dann der naechste. Eine automatische Umsortierung
// nach „wie schnell war es letztes Mal" waere eine Rangfolge ohne Beleg.
type Kette struct {
	SucheAnbieter []SucheAnbieter
	HoleAnbieter  []HoleAnbieter
}

// Suche fragt die Anbieter der Reihe nach, bis einer Treffer liefert.
//
// Der Fehler ist genau dann gesetzt, wenn **keiner** lieferte. Ein Anbieter, der
// mit einem Fehler endet, haelt die Kette nicht an: der naechste ist dran.
func (k *Kette) Suche(ctx context.Context, anfrage string, grenze int) (Suchbericht, error) {
	bericht := Suchbericht{Suchanfrage: anfrage, Treffer: []Treffer{}, Versuche: []Versuch{}}
	if len(k.SucheAnbieter) == 0 {
		return bericht, fmt.Errorf("%w: kein Suchanbieter eingerichtet", ErrNichtsGeliefert)
	}
	for _, anbieter := range k.SucheAnbieter {
		start := time.Now()
		treffer, fehler := anbieter.Suche(ctx, anfrage, grenze)
		dauer := time.Since(start).Milliseconds()
		if fehler != nil {
			bericht.Versuche = append(bericht.Versuche, Versuch{
				Anbieter: anbieter.Name(), DauerMS: dauer, Fehler: fehler.Error(),
			})
			continue
		}
		for index := range treffer {
			treffer[index].Herkunft = anbieter.Name()
		}
		bericht.Versuche = append(bericht.Versuche, Versuch{
			Anbieter: anbieter.Name(), DauerMS: dauer, Treffer: len(treffer),
		})
		if len(treffer) == 0 {
			continue
		}
		bericht.Treffer = treffer
		bericht.Herkunft = anbieter.Name()
		return bericht, nil
	}
	return bericht, fmt.Errorf("%w (%d Anbieter versucht, siehe Bericht)", ErrNichtsGeliefert, len(k.SucheAnbieter))
}

// Hole ruft die Anbieter der Reihe nach, bis einer Text liefert.
func (k *Kette) Hole(ctx context.Context, ziel string, maxBytes int64) (Seitenbericht, error) {
	bericht := Seitenbericht{Ziel: ziel, Versuche: []Versuch{}}
	if len(k.HoleAnbieter) == 0 {
		return bericht, fmt.Errorf("%w: kein Abrufanbieter eingerichtet", ErrNichtsGeliefert)
	}
	for _, anbieter := range k.HoleAnbieter {
		start := time.Now()
		seite, fehler := anbieter.Hole(ctx, ziel, maxBytes)
		dauer := time.Since(start).Milliseconds()
		if fehler != nil {
			bericht.Versuche = append(bericht.Versuche, Versuch{
				Anbieter: anbieter.Name(), DauerMS: dauer, Fehler: fehler.Error(),
			})
			continue
		}
		if seite.Text == "" {
			bericht.Versuche = append(bericht.Versuche, Versuch{
				Anbieter: anbieter.Name(), DauerMS: dauer, Fehler: "leerer Text",
			})
			continue
		}
		bericht.Versuche = append(bericht.Versuche, Versuch{
			Anbieter: anbieter.Name(), DauerMS: dauer, Treffer: 1,
		})
		bericht.URL = seite.URL
		bericht.Titel = seite.Titel
		bericht.Text = seite.Text
		bericht.Bytes = seite.Bytes
		bericht.Herkunft = anbieter.Name()
		return bericht, nil
	}
	return bericht, fmt.Errorf("%w (%d Anbieter versucht, siehe Bericht)", ErrNichtsGeliefert, len(k.HoleAnbieter))
}

// NeuerKlient liefert den HTTP-Klienten, den alle Anbieter teilen.
//
// **Warum ein eigener Klient und nicht http.DefaultClient:** der Vorgabe-Klient
// hat keine Frist. Ein Anbieter, der nicht antwortet, haengt sonst an der
// Anfrage des Nutzers — und der Nutzer sieht keinen Fehler, sondern wartet.
func NeuerKlient(frist time.Duration) *http.Client {
	return &http.Client{Timeout: frist}
}
