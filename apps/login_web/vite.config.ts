/**
 * `apps/login_web` — Bau und Entwicklungsserver der Anmeldeseite.
 *
 * ## Der Proxy ist keine Bequemlichkeit, sondern eine **Bedingung**
 *
 * Unsere Anmeldung setzt ihre Kekse mit **`SameSite=Strict`** (gemessen an
 * `Set-Cookie`: `pmh_session; HttpOnly; SameSite=Strict` und `pmh_csrf; SameSite=Strict`).
 * Ein solcher Keks wird **nur** bei Anfragen an **dieselbe Herkunft** mitgeschickt. Liefe
 * diese Seite auf `127.0.0.1:5176` und riefe die API auf `127.0.0.1:3081`, wäre das eine
 * **andere Herkunft** (anderer Port) — der Keks käme nie an, und die Anmeldung wäre still
 * wirkungslos.
 *
 * Deshalb leitet der Entwicklungsserver `/api` an den Host weiter. Für die Seite ist damit
 * alles **eine** Herkunft. In Produktion steht dasselbe dahinter: die Seite wird vom Host
 * selbst ausgeliefert.
 *
 * ## Der Port
 *
 * **`5180`**, und die Wahl ist gemessen, nicht geraten: `5173` und `5176` sind auf diesem
 * Rechner **belegt** (`netstat -ano` zeigte auf `5176` einen fremden Vite-Server, der
 * „Prometheus — Welt-Prototyp" ausliefert, PID 32288). Ein stiller Umzug auf einen freien
 * Port wäre gefährlich: Ich messe dann eine Seite, die **nicht meine** ist — genau dieser
 * Fehler ist mir beim ersten Versuch passiert. Darum `strictPort: true`: ist der Port weg,
 * bricht der Start **laut** ab, statt heimlich woanders zu lauschen.
 *
 * Über `PMH_LOGIN_PORT` umstellbar, falls ein Nachbar später hier landet.
 *
 * ## Wohin weitergeleitet wird
 *
 * **Nicht hier.** Das Ziel steht in `src/weiter.ts` an **einer** Stelle
 * (`VORGABE_ZIEL` und der Parameter `weiter`). Dort docken später die Einstellungen an,
 * ohne daß an dieser Datei etwas zu ändern wäre.
 *
 * @module @prometheus-harness/login-web/vite
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Der Host, an den `/api` im Entwicklungsbetrieb geht. */
const HOST = process.env.PMH_AUTH_HOST ?? 'http://127.0.0.1:3081'

/** Der eigene Port (siehe Kopf: `5180`, gemessen frei; laut bei Belegung). */
const PORT = Number(process.env.PMH_LOGIN_PORT ?? 5180)

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: HOST,
        changeOrigin: false,
        // Der Host antwortet auf `/api/pmh/auth/*` **ohne** Harness-Token (gemessen) —
        // die Anmeldung ist die eigene Tür und darf nicht selbst hinter der Token-Sperre
        // liegen.
        secure: false,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: PORT,
    strictPort: true,
    proxy: {
      '/api': { target: HOST, changeOrigin: false, secure: false },
    },
  },
})
