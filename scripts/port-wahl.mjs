/**
 * Portwahl beim Start — „binden statt fragen".
 *
 * **Die Aufgabe.** Der Standardport (`3080`) kann belegt sein — von einem
 * laufenden Harness, von einem Docker-Container oder von irgendetwas anderem.
 * Dann soll der Start **nicht** scheitern, sondern den nächsten freien Port
 * nehmen und **sagen, welchen**.
 *
 * **Warum „binden" und nicht „fragen".** Der naheliegende Weg ist, den Port zu
 * **prüfen** (Verbindung aufbauen, `connect`) und dann zu starten. Das hat zwei
 * Fehler:
 *
 *   1. **Zwei Adressfamilien.** Windows und Linux binden `0.0.0.0` und `::`
 *      getrennt (außer mit `IPV6_V6ONLY=0`). Ein Port kann auf `::` frei und auf
 *      `0.0.0.0` belegt sein — und umgekehrt. Eine Prüfung auf einer Adresse
 *      sagt nichts über die andere.
 *   2. **Zwischen Prüfung und Bindung liegt Zeit.** Ein anderer Prozess kann den
 *      Port genau dazwischen nehmen. Das ist ein Wettlauf, und ein Wettlauf, den
 *      man nicht gewinnen kann, indem man öfter prüft.
 *
 * Deshalb wird hier **gebunden** (`listen`): wer einen Port halten kann, hat ihn.
 * Danach wird er **sofort freigegeben** — und der Start übergibt ihn dem Kind.
 * Zwischen Freigabe und Übergabe bleibt ein Restfenster; das ist unvermeidbar,
 * aber es ist **klein** (Mikrosekunden) und wird nicht durch eine zweite Prüfung
 * größer. Wichtig ist, dass der Fehler **sichtbar** wird, wenn er auftritt —
 * genau das tut der Host, der den Port selbst bindet und bei Belegung mit einem
 * Fehler endet.
 *
 * **Warum beide Adressen geprüft werden.** Der Host bindet `127.0.0.1` (siehe
 * `--host`), aber der **Browser** erreicht ihn je nach Auflösung über `127.0.0.1`
 * oder `::1`. Ein Port, der auf `::1` belegt ist, führt zu einem anderen Ergebnis
 * als einer auf `127.0.0.1` — deshalb werden beide geprüft und **beide** müssen
 * frei sein.
 *
 * @module scripts/port-wahl
 */

import { createServer } from 'node:net'

/**
 * Prüft, ob ein Port **gebunden** werden kann.
 *
 * **Warum die Prüfung selbst einen Fehler verschlucken muss.** Beim
 * `listen`-Versuch auf einer belegten Adresse wirft Node/Bun asynchron einen
 * Fehler (`EADDRINUSE`, `EACCES`). Ohne `error`-Behandlung wird daraus ein
 * unbehandelter Fehler, der den Prozess beendet — und dann **bricht der Start
 * ab, statt auszuweichen**. Genau das Gegenteil des Ziels.
 *
 * @param port - der zu prüfende Port
 * @param host - die Adresse (`127.0.0.1` oder `::1`)
 * @returns `true`, wenn der Port auf dieser Adresse gebunden werden konnte
 */
export function canBind(port, host) {
  return new Promise((resolve) => {
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    let server
    try {
      server = createServer()
    } catch {
      done(false)
      return
    }

    // Der Fehlerfall: belegt, keine Berechtigung, oder eine Adresse, die es auf
    // diesem Wirt nicht gibt.
    server.once('error', () => {
      // `close` erst im Callback aufrufen — ein Server, der nicht lauscht, hat
      // auch kein Handle zum Freigeben, aber ein zweiter Aufruf ist harmlos.
      try { server.close() } catch { /* egal */ }
      done(false)
    })

    server.once('listening', () => {
      // **Sofort freigeben.** Der Port wird nicht gehalten: er wird nur
      // festgestellt. Das Fenster zwischen Freigabe und Übergabe an das Kind ist
      // unvermeidbar klein.
      server.close(() => { done(true) })
    })

    try {
      server.listen({ port, host, exclusive: true })
    } catch {
      try { server.close() } catch { /* egal */ }
      done(false)
    }
  })
}

/**
 * Prüft, ob ein Port auf **allen** zu prüfenden Adressen frei ist.
 *
 * @param port - der zu prüfende Port
 * @param hosts - die Adressen; Vorgabe beide Loopback-Familien
 * @returns `true`, wenn der Port überall frei ist
 */
export async function isPortFree(port, hosts = ['127.0.0.1', '::1']) {
  for (const host of hosts) {
    if (!(await canBind(port, host))) return false
  }
  return true
}

/** Wie eine Portsuche ausgegangen ist. */
/**
 * @typedef {object} PortChoice
 * @property {number} port - der gewählte Port
 * @property {number} requested - der gewünschte Port
 * @property {boolean} changed - ob ein anderer als der gewünschte gewählt wurde
 * @property {readonly number[]} tried - die geprüften Ports in Reihenfolge
 * @property {readonly number[]} occupied - die belegten Ports
 */

/**
 * Sucht den ersten freien Port ab `requested`.
 *
 * **Wann abgewichen wird und wann nicht.** Ist der gewünschte Port frei, wird er
 * genommen — ohne Suche, ohne Verzögerung. Ist er belegt, werden die nächsten
 * `span` Ports geprüft. Ist **keiner** frei, wird **geworfen**: ein Start auf
 * einem beliebigen anderen Port wäre eine Überraschung, und eine Überraschung
 * beim Start ist schlimmer als eine Fehlermeldung.
 *
 * **Warum nicht einfach ein zufälliger Port.** Ein zufälliger Port ist nicht
 * wiederfindbar: wer das Fenster schließt und neu startet, bekommt einen anderen
 * — und jede Anleitung, jede gespeicherte Adresse und jeder Lesezeichen-Eintrag
 * ist falsch. Ein **fester Bereich** ab dem Standardport ist vorhersagbar.
 *
 * @param {number} requested - gewünschter Port
 * @param {{span?: number, hosts?: readonly string[]}} [options]
 * @returns {Promise<PortChoice>}
 * @throws {Error} wenn im Bereich kein Port frei ist
 */
export async function choosePort(requested, options = {}) {
  const span = options.span ?? 20
  const hosts = options.hosts ?? ['127.0.0.1', '::1']
  if (!Number.isInteger(requested) || requested < 1 || requested > 65535) {
    throw new Error(`Port muss eine ganze Zahl zwischen 1 und 65535 sein, ist ${String(requested)}`)
  }

  const tried = []
  const occupied = []
  for (let offset = 0; offset < span; offset += 1) {
    const port = requested + offset
    if (port > 65535) break
    tried.push(port)
    if (await isPortFree(port, hosts)) {
      return { port, requested, changed: offset > 0, tried, occupied }
    }
    occupied.push(port)
  }

  throw new Error(
    `Kein freier Port im Bereich ${requested}–${requested + span - 1}: ` +
      `belegt sind ${occupied.join(', ')}. ` +
      'Ein anderer Port lässt sich mit --port <n> wählen.',
  )
}

/**
 * Liest einen Port aus einer Umgebungsvariable.
 *
 * **Warum eine Umgebungsvariable und nicht nur ein Argument.** In einem
 * Container oder einem Startskript ist ein Port oft eine Umgebungsfrage
 * (`PMH_PORT`), nicht ein Argument. Beide Wege sollen funktionieren, und die
 * Umgebungsvariable ist der **Rückfall**, wenn kein Argument genannt ist.
 *
 * @param {string | undefined} value - der Rohwert
 * @param {number} fallback - der Standardwert
 * @returns {number} der gelesene oder der Standardwert
 */
export function portFromEnv(value, fallback) {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return fallback
  return parsed
}

/**
 * Beschreibt die Portwahl als **eine Zeile** für die Ausgabe.
 *
 * **Warum das eine eigene Funktion ist.** Genau diese Zeile ist der Unterschied
 * zwischen „es startet" und „ich weiß, wo". Wer den gewählten Port nicht nennt,
 * zwingt jeden Benutzer, im Protokoll zu suchen — und in einem Container sieht er
 * das Protokoll vielleicht gar nicht.
 *
 * @param {PortChoice} choice - das Ergebnis von {@link choosePort}
 * @returns {string} die Zeile
 */
export function describePortChoice(choice) {
  if (!choice.changed) return `Port ${choice.port} (Standard) ist frei.`
  return (
    `Port ${choice.requested} ist belegt — ` +
    `gewählt: ${choice.port}` +
    (choice.occupied.length > 0 ? ` (belegt: ${choice.occupied.join(', ')})` : '')
  )
}
