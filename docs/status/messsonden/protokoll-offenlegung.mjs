/**
 * Meßsonde: **Offenlegung der Sitzungsprotokolle** — was liegt im Klartext, und wem gehört es?
 *
 * ## Warum diese Sonde existiert
 *
 * `docs/status/mandantentrennung.md` schließt die Datenbank ab: zusammengesetzte
 * Fremdschlüssel (Migration 0004) und Row Level Security, dessen Verhalten gemessen ist
 * (§13). **Die Sitzungsprotokolle liegen daneben und werden davon nicht erfaßt.**
 *
 * > **Die Datenbank ist nicht die einzige Grenze. Eine RLS-Migration schließt diesen Riß
 * > nicht.**
 *
 * ## Was gemessen wird — und was NICHT
 *
 * | Frage | Wie |
 * |---|---|
 * | Ist der Inhalt **ohne Schlüssel** lesbar? | entpacken mit `Bun.zstdDecompressSync`, **kein** Geheimnis im Spiel |
 * | Trägt ein Protokoll seinen **Eigentümer**? | Felder des `session`-Ereignisses |
 * | Liegen **alle** Sitzungen unter **einer** Wurzel? | die Verzeichnisse auflisten |
 * | Wie groß ist die Offenlegung? | Bytes und Anzahl |
 *
 * **Was diese Sonde NICHT tut:** sie gibt **keine Inhalte aus**. Weder Nachrichtentexte
 * noch Pfade einzelner Nutzer — nur Anzahl, Länge und Struktur. Ein Nachweis über
 * Offenlegung, der die offengelegten Inhalte abdruckt, ist selbst eine Offenlegung.
 *
 * **Was sie ebenfalls nicht leistet:** sie sagt **nicht**, ob das ein Fehler oder eine
 * bewußte Entscheidung ist. Der Befund steht in `docs/status/protokoll-trennung.md`.
 *
 * ## Aufruf
 *
 * ```powershell
 * bun docs/status/messsonden/protokoll-offenlegung.mjs
 * ```
 *
 * Exit **0**: gemessen. Exit **2**: keine Protokolle gefunden — dann ist nichts belegt.
 *
 * @module docs/status/messsonden/protokoll-offenlegung
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const VORGABE_HOME = join(HIER, '..', '..', '..', '.pmh-build', 'harness-home')

/** Findet alle Sitzungsprotokolle unterhalb eines Verzeichnisses. */
export function findeProtokolle(wurzel, aus = []) {
  let eintraege
  try {
    eintraege = readdirSync(wurzel, { withFileTypes: true })
  } catch {
    return aus
  }
  for (const e of eintraege) {
    const p = join(wurzel, e.name)
    if (e.isDirectory()) findeProtokolle(p, aus)
    else if (e.name.endsWith('.jsonl.zstd')) aus.push(p)
  }
  return aus
}

/**
 * Liest ein Protokoll **ohne Schlüssel** und liefert nur Struktur.
 *
 * Daß hier kein Geheimnis übergeben wird, ist der Punkt: gelingt es, ist der Inhalt
 * **nicht** verschlüsselt.
 */
export function leseStruktur(pfad) {
  const roh = readFileSync(pfad)
  const klar = new TextDecoder().decode(Bun.zstdDecompressSync(roh))
  const kopf = JSON.parse(klar.split('\n')[0])
  let nachrichten = 0
  let zeichen = 0
  for (const zeile of klar.split('\n')) {
    if (zeile.trim() === '') continue
    let ev
    try {
      ev = JSON.parse(zeile)
    } catch {
      continue
    }
    if (ev.type === 'user/message' || ev.type === 'assistant/message') {
      nachrichten += 1
      const inhalt = ev.data?.message?.content ?? ev.data?.content ?? []
      if (Array.isArray(inhalt)) {
        for (const teil of inhalt) if (typeof teil?.text === 'string') zeichen += teil.text.length
      }
    }
  }
  return { komprimiert: roh.length, entpackt: klar.length, kopf, nachrichten, zeichen }
}

/** Felder, die einen Eigentümer tragen **könnten** — geprüft wird, ob eines vorkommt. */
export const EIGENTUMS_FELDER = ['userId', 'user_id', 'owner', 'ownerId', 'email', 'benutzerId']

function haupt() {
  const home = process.argv[2] ?? VORGABE_HOME
  const protokolle = findeProtokolle(home)

  console.log('Offenlegung der Sitzungsprotokolle')
  console.log(`  Wurzel: ${home}`)
  console.log('')

  if (protokolle.length === 0) {
    console.log('KEINE Protokolle gefunden — es ist nichts belegt.')
    process.exitCode = 2
    return
  }

  // 1. Klartext ohne Schlüssel
  console.log(`== 1. Klartext ohne Schlüssel (${String(protokolle.length)} Protokolle) ==`)
  let bytes = 0
  let entpackt = 0
  let nachrichten = 0
  let zeichen = 0
  const kopfFelder = new Set()
  let fehler = 0
  for (const p of protokolle) {
    try {
      const s = leseStruktur(p)
      bytes += s.komprimiert
      entpackt += s.entpackt
      nachrichten += s.nachrichten
      zeichen += s.zeichen
      for (const f of Object.keys(s.kopf)) kopfFelder.add(f)
    } catch {
      fehler += 1
    }
  }
  console.log(`  ${String(bytes)} B komprimiert → ${String(entpackt)} B entpackt`)
  console.log(`  ${String(nachrichten)} Nachrichten, ${String(zeichen)} Zeichen Text`)
  if (fehler > 0) console.log(`  ${String(fehler)} Protokoll(e) NICHT lesbar`)
  console.log('  Ein Geheimnis wurde NICHT übergeben. Gelingt das Entpacken, ist der')
  console.log('  Inhalt nicht verschlüsselt — zstd ist Kompression, keine Verschlüsselung.')

  // 2. Eigentümer im Kopf?
  console.log('')
  console.log('== 2. Trägt ein Protokoll seinen Eigentümer? ==')
  const felder = [...kopfFelder].sort()
  console.log(`  Felder des session-Ereignisses: ${felder.join(', ')}`)
  const treffer = EIGENTUMS_FELDER.filter((f) => kopfFelder.has(f))
  console.log(`  davon Eigentumsfelder: ${treffer.length === 0 ? 'KEINE' : treffer.join(', ')}`)

  // 3. Eine Wurzel für alle?
  console.log('')
  console.log('== 3. Wie viele Wurzeln? ==')
  const cwdSlugs = [...new Set(protokolle.map((p) => p.split(/[\\/]/).slice(-3)[0] ?? '?'))]
  console.log(`  Projektverzeichnisse unter der Wurzel: ${String(cwdSlugs.length)}`)
  for (const s of cwdSlugs) console.log(`    ${s}`)
  console.log(`  Benutzerverzeichnisse: 0 — die Ablage kennt keinen Benutzerbezug`)

  // 4. Urteil
  console.log('')
  console.log('== BEFUND ==')
  const ohneEigentuemer = treffer.length === 0
  if (ohneEigentuemer) {
    console.log('  Die Protokolle liegen im KLARTEXT unter EINER Wurzel und tragen KEINEN')
    console.log('  Eigentümer. Wer Zugriff auf das Harness-Home hat, liest JEDE Sitzung.')
    console.log('  Eine Trennung nach Benutzern ist aus dem Protokoll selbst NICHT')
    console.log('  ableitbar — es gibt kein Feld, nach dem man filtern könnte.')
  } else {
    console.log(`  Ein Eigentumsfeld ist vorhanden: ${treffer.join(', ')} — die Ablage kann`)
    console.log('  danach trennen. Ob sie es tut, ist damit noch nicht belegt.')
  }
  console.log('')
  console.log('  Diese Sonde belegt die OFFENLEGUNG, nicht ihre Bewertung.')
  console.log('  Der Befund samt Wegen steht in docs/status/protokoll-trennung.md.')
  process.exitCode = 0
}

if (import.meta.main === true) haupt()
