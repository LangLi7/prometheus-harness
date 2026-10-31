/**
 * `/bild` — ein Bild aus einer Zeile, mit den Stellschrauben der Bild-API.
 *
 * ## Warum ein Befehl, obwohl das Werkzeug schon da ist
 *
 * Das Werkzeug `image_generate` ist für **mich** da: das Modell entscheidet, wann es zeichnet. Ein
 * Befehl ist für **den Menschen** da: er tippt, was er will, und es wird gezeichnet — ohne daß ein
 * Modell vorher noch etwas entscheidet. Das ist der Unterschied zwischen „kannst du mal" und „mach".
 *
 * ## Die Form
 *
 * ```text
 * /bild --stil icon ein Flammenlogo für Prometheus
 * /bild --format 16:9 --auflösung 2K ein Fuchs im Schnee, fotografisch
 * /bild --pfad assets/logo/neu.png --stil icon ein Dreieck
 * ```
 *
 * **Unbekannte Flags sind ein Fehler, kein stiller Zusatz.** Ein Tippfehler wie `--auflösung` statt
 * `--aufloesung` (oder umgekehrt) darf nicht dazu führen, daß das Wort im Prompt landet und das
 * Bild etwas anderes zeigt, als bestellt war.
 *
 * @module @prometheus-harness/command-bild
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { baueKette, schluesselquelle } from '@prometheus-harness/ai-capabilities'
import { endungFuer, zielPfad } from '@prometheus-harness/ai-capabilities'
import { schaetzeBildkosten } from '@prometheus-harness/usage-ansicht'
import type { ZeichenOptionen } from '@prometheus-harness/capabilities'

/** Der stabile Plugin-Name. */
export const name = 'pmh-command-bild'

/**
 * Kein harter `inject`.
 *
 * **Warum nicht `inject: ['commands']`.** Fehlt der Dienst, bleibt ein Plugin mit hartem `inject`
 * **still** inaktiv — kein Fehler, keine Zeile, kein Befehl. Genau das war am 21.10.2026 der
 * Zustand: das Paket ließ sich laden und anmelden, aber im Menü war nichts. Jetzt wird der Dienst
 * gesucht, und wenn er fehlt, sagt das Plugin es **laut**.
 */
export const inject: readonly string[] = []

/** Der Befehlsname ohne Schrägstrich — je nach Sprache. */
export const BEFEHL = { de: 'bild', en: 'image' } as const

/**
 * Liest die eingestellte Sprache.
 *
 * **Warum das hier steht und nicht im Kern.** Der Befehl ist ein Text für Menschen; welcher Text
 * paßt, weiß nur die Einstellung. Die Reihenfolge: Einstellungsdienst, `PMH_SPRACHE`, Deutsch.
 *
 * @param ctx - der Plugin-Kontext
 * @returns die Sprache
 */
function sprache(ctx: Context): 'de' | 'en' {
  const dienst = ctx.get('settings') as { get?: (schluessel: string) => unknown } | undefined
  for (const feld of ['locale', 'language', 'sprache']) {
    const wert = dienst?.get?.(feld)
    if (typeof wert === 'string' && wert.trim() !== '') {
      return wert.toLowerCase().startsWith('en') ? 'en' : 'de'
    }
  }
  const ausUmgebung = process.env['PMH_SPRACHE']
  return ausUmgebung !== undefined && ausUmgebung.toLowerCase().startsWith('en') ? 'en' : 'de'
}

/** Die Stile, die der Befehl kennt — jeder hängt einen gemessenen Zusatz an den Prompt. */
export type Stil = 'foto' | 'illustration' | 'icon'

/**
 * Was ein Stil dem Auftrag anhängt.
 *
 * **Warum angehängt und nicht vorangestellt.** Steht der Stil vorn („flat vector icon of …"),
 * bestimmt er das ganze Bild. Hinten steht er als Angabe, und das Motiv bleibt das Motiv.
 */
export const STILZUSATZ: Readonly<Record<Stil, string>> = {
  foto: ', natural photograph, realistic lighting, high detail',
  illustration: ', painterly illustration, visible brush strokes, rich color',
  icon: ', flat vector icon, two solid colors, thick clean outline, no gradients, no shadows, plain background',
}

/** Ein gelesener Auftrag. */
export interface Bildauftrag {
  /** Der Text ohne Flags — das Motiv. */
  readonly text: string
  readonly stil?: Stil
  readonly seitenverhaeltnis?: string
  readonly aufloesung?: string
  readonly pfad?: string
  /** Nur schätzen, nicht zeichnen. */
  readonly schaetzen?: boolean
}

/**
 * Liest die Zeile nach `/bild`.
 *
 * @param roh - der Text hinter dem Befehlsnamen
 * @returns der Auftrag oder ein Fehler in Worten
 */
export function liesAuftrag(roh: string): { ok: true; auftrag: Bildauftrag } | { ok: false; fehler: string } {
  const woerter = roh.trim().split(/\s+/u).filter((w) => w !== '')
  const text: string[] = []
  let stil: Stil | undefined
  let seitenverhaeltnis: string | undefined
  let aufloesung: string | undefined
  let pfad: string | undefined
  let schaetzen = false

  for (let i = 0; i < woerter.length; i += 1) {
    const wort = woerter[i] ?? ''
    if (!wort.startsWith('--')) {
      text.push(wort)
      continue
    }
    const flag = wort.slice(2).toLowerCase()
    // **Ein Schalter ohne Wert** — er nimmt kein Argument und darf keines fressen.
    if (flag === 'schaetzen' || flag === 'schätzen') {
      schaetzen = true
      continue
    }
    const wert = woerter[i + 1]
    if (wert === undefined) return { ok: false, fehler: `Zu „${wort}" fehlt der Wert.` }
    // **Beide Schreibweisen**, weil eine Tastatur mit Umlaut nicht überall selbstverständlich ist.
    if (flag === 'stil') {
      if (wert !== 'foto' && wert !== 'illustration' && wert !== 'icon') {
        return { ok: false, fehler: `Unbekannter Stil „${wert}" — erlaubt: foto, illustration, icon.` }
      }
      stil = wert
    } else if (flag === 'format' || flag === 'seitenverhaeltnis') {
      seitenverhaeltnis = wert
    } else if (flag === 'aufloesung' || flag === 'auflösung') {
      aufloesung = wert
    } else if (flag === 'pfad') {
      pfad = wert
    } else {
      return { ok: false, fehler: `Unbekanntes Flag „${wort}".` }
    }
    i += 1
  }

  if (text.join(' ').trim() === '') {
    return { ok: false, fehler: 'Ohne Beschreibung wird nichts gezeichnet. Beispiel: /bild --stil icon ein Flammenlogo' }
  }
  return {
    ok: true,
    auftrag: {
      text: text.join(' '),
      ...(stil === undefined ? {} : { stil }),
      ...(seitenverhaeltnis === undefined ? {} : { seitenverhaeltnis }),
      ...(aufloesung === undefined ? {} : { aufloesung }),
      ...(pfad === undefined ? {} : { pfad }),
      ...(schaetzen ? { schaetzen: true } : {}),
    },
  }
}

/**
 * Baut den Prompt aus Motiv und Stil.
 *
 * @param auftrag - der gelesene Auftrag
 * @returns der Text an das Modell
 */
export function promptFuer(auftrag: Bildauftrag): string {
  return auftrag.stil === undefined ? auftrag.text : `${auftrag.text}${STILZUSATZ[auftrag.stil]}`
}

/** Ein Zeitstempel, der als Dateiname taugt. */
function stempel(): string {
  return new Date().toISOString().replace(/[:.]/gu, '-')
}

/**
 * Hängt den Befehl ein.
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  const spracheJetzt = sprache(ctx)
  // **Eine laute Zeile beim Laden.** Ein Plugin, das nicht geladen wird, ist unsichtbar — und
  // „der Befehl fehlt im Menü" hat zwei ganz verschiedene Ursachen: nicht geladen, oder geladen
  // und vom Client nicht angezeigt. Diese Zeile trennt die beiden Fälle im Terminal des Hosts.
  console.log(`[${name}] geladen (Sprache: ${spracheJetzt}, Befehle: ${BEFEHL[spracheJetzt]} …)`)
  ctx.effect(() => {
    const dienst = ctx.get('commands') as
      | { register?: (definition: unknown) => () => void }
      | undefined
    if (dienst === undefined || typeof dienst.register !== 'function') {
      console.log(`[${name}] KEIN Befehlsdienst gefunden — /${BEFEHL[spracheJetzt]} wurde nicht angemeldet`)
      return () => {}
    }
    const registrieren = dienst.register.bind(dienst)
    const abgemeldet = (['de', 'en'] as const).map((s) =>      registrieren({
        name: BEFEHL[s],
        description:
          s === 'en'
            ? 'Draws an image from text. Flags: --stil foto|illustration|icon, --format 16:9, ' +
              '--auflösung 2K, --pfad <file>, --schaetzen (estimate only).'
            : 'Erzeugt ein Bild aus einem Text. Flags: --stil foto|illustration|icon, --format 16:9, ' +
              '--auflösung 2K, --pfad <datei>, --schaetzen (nur schätzen).',
        input: { hint: '--stil icon ein Flammenlogo für Prometheus' },
        handler: async ({
          rawInput,
          signal,
        }: {
          rawInput: string
          signal: AbortSignal
        }): Promise<CommandResult> => {
          const gelesen = liesAuftrag(rawInput)
          if (!gelesen.ok) return { kind: 'error', text: gelesen.fehler }
          const auftrag = gelesen.auftrag
          if (signal.aborted) return { kind: 'error', text: 'Abgebrochen.' }
          try {
            const kette = await baueKette({ schluessel: schluesselquelle(ctx) })
            const anbieter = await kette.aufbau.faehigkeiten.waehle('bild')
            if (anbieter.zeichner === undefined) {
              throw new Error(`Der Anbieter „${anbieter.id}" liefert keinen Zeichner.`)
            }
            // **Erst schätzen, dann zeichnen.** Ein Aufruf, der Geld kostet, soll vorher sagen,
            // was er kostet — und `--schaetzen` zeichnet gar nicht.
            if (auftrag.schaetzen === true) {
              const modell = kette.einstellungen.wahl.bild?.modell ?? '—'
              const schaetzung = schaetzeBildkosten(modell, {
                ...(auftrag.aufloesung === undefined ? {} : { aufloesung: auftrag.aufloesung }),
              })
              return {
                kind: 'success',
                text:
                  `Schätzung für ${modell}: ` +
                  (schaetzung.usd === undefined ? 'keine Zahl' : `${schaetzung.usd.toFixed(4)} USD`) +
                  `\n${schaetzung.grund}`,
              }
            }
            const optionen: ZeichenOptionen = {
              ...(auftrag.seitenverhaeltnis === undefined ? {} : { seitenverhaeltnis: auftrag.seitenverhaeltnis }),
              ...(auftrag.aufloesung === undefined ? {} : { aufloesung: auftrag.aufloesung }),
            }
            const bild = await anbieter.zeichner.zeichne(promptFuer(auftrag), optionen)
            const ziel = zielPfad(auftrag.pfad, `assets/bilder/bild-${stempel()}.${endungFuer(bild.typ)}`)
            await mkdir(dirname(ziel), { recursive: true })
            await writeFile(ziel, bild.bytes)
            return {
              kind: 'success',
              text:
                `Bild: ${ziel}\n` +
                `${String(bild.bytes.byteLength)} Bytes, ${bild.typ}` +
                (bild.kostenUsd === undefined ? '' : `, ${String(bild.kostenUsd)} USD`),
            }
          } catch (fehler) {
            return { kind: 'error', text: fehler instanceof Error ? fehler.message : String(fehler) }
          }
        },
      }),
    )
    return () => {
      for (const ab of abgemeldet) ab()
    }
  }, `${name} /${BEFEHL[spracheJetzt]}`)
}

export default apply
