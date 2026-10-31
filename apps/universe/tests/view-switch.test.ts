/**
 * **Ein Ansichtswechsel ist erst vollstaendig, wenn er gemerkt *und* umgeblendet wurde.**
 *
 * **Warum das geprueft wird und nicht nur behauptet.** Genau hier lag ein Fehler mit Folge: die
 * Eintraege der Dynamic Island riefen nur `setMode` — die Einstellung `interface.mode` blieb stehen,
 * und **sie gewinnt beim naechsten Laden** gegen den Raum-Speicher (`main.ts`, Abschnitt 2 des
 * Starts). Wer ueber die Insel in den Chat wechselte und die Seite neu lud, stand wieder im
 * Universum. Im Bild ist das nicht zu sehen — man sieht es erst beim naechsten Laden, und dann sieht
 * es aus wie ein vergessener Klick.
 *
 * Deshalb bekommt `wechsleAnsicht` seine Wirkungen **uebergeben** und wird hier mit zwei Zaehlern
 * nachgestellt: der Test misst die Reihenfolge und die Vollstaendigkeit, nicht das Aussehen.
 */
import { expect, test } from 'bun:test'
import { alsEinstellung, wechsleAnsicht } from '../src/view-switch'
import type { Ansicht } from '../src/camera'

/** Ein Zaehler — er merkt sich, **in welcher Reihenfolge** was geschah. */
function zaehler(): { readonly rufe: string[]; readonly an: { setze: (z: Ansicht) => void; merke: (z: Ansicht) => void } } {
  const rufe: string[] = []
  return {
    rufe,
    an: {
      merke: (ziel) => rufe.push(`merken:${ziel}`),
      setze: (ziel) => rufe.push(`setzen:${ziel}`),
    },
  }
}

test('der Wechsel merkt die Wahl UND blendet um', () => {
  const { rufe, an } = zaehler()
  wechsleAnsicht(an, 'chat')
  // **Beides, und in dieser Reihenfolge.** Nur „umblenden" waere der alte Fehler; nur „merken" waere
  // ein Wechsel, den man nicht sieht.
  expect(rufe).toEqual(['merken:chat', 'setzen:chat'])
})

test('der Wechsel gilt fuer jede Ansicht — nicht nur fuer den Chat', () => {
  for (const ziel of ['chat', 'web', 'os'] as const) {
    const { rufe, an } = zaehler()
    wechsleAnsicht(an, ziel)
    expect(rufe, `Ansicht ${ziel} wurde nicht vollstaendig gewechselt`).toEqual([
      `merken:${ziel}`,
      `setzen:${ziel}`,
    ])
  }
})

test('erst merken, dann umblenden — die Meldung darf den letzten Ruf nicht ueberholen', () => {
  // Die Aenderung der Einstellung ruft ihrerseits `setMode` (siehe `onSettingChanged`). Stuende das
  // Umblenden zuerst, gaebe es zwei Wechsel in zwei Richtungen — im Bild ein kurzes Zucken.
  const { rufe, an } = zaehler()
  wechsleAnsicht(an, 'os')
  expect(rufe[0]).toBe('merken:os')
  expect(rufe[rufe.length - 1]).toBe('setzen:os')
})

test('die Einstellung heisst anders als der Speicher — und die Umrechnung steht an einer Stelle', () => {
  // Im Befehl und im Raum-Speicher heisst die Welt `os`, in den Einstellungen `world`. Vorher stand
  // diese Umrechnung an jeder Schreibstelle einzeln.
  expect(alsEinstellung('os')).toBe('world')
  expect(alsEinstellung('chat')).toBe('chat')
  expect(alsEinstellung('web')).toBe('web')
})
