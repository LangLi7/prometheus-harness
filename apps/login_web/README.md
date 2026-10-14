# `apps/login_web` — die Anmeldeseite

Die Seite, die **vor** der Oberfläche steht: anmelden oder Konto anlegen. Sie spricht mit den
Wegen `/api/pmh/auth/*` unseres `auth-http`-Pakets und **erfindet nichts** — jede Meldung, die
sie zeigt, kommt wörtlich vom Server.

## Starten

```sh
bun install                 # im Wurzelverzeichnis, falls noch nicht geschehen
cd apps/login_web
bun run dev                 # http://127.0.0.1:5180/
```

| Befehl | Wirkung |
|---|---|
| `bun run dev` | Entwicklungsserver auf **5180** |
| `bun run build` | Bau nach `dist/` (gemessen: `dist/index.html` 0,81 kB, CSS 2,05 kB, JS 224,33 kB) |
| `bun run test` | die Prüfungen des Weiterleiters (`tests/weiter.test.ts`) |
| `bun run typecheck` | `tsgo --noEmit` |

### Der Port ist gemessen, nicht geraten

**5180.** `5173` und `5176` sind auf diesem Rechner **belegt** — auf `5176` lauscht ein
**fremder** Vite-Server, der „Prometheus — Welt-Prototyp" ausliefert. Mir ist genau das
passiert: mein erster Startversuch traf den fremden Server. Ein stiller Umzug auf einen freien
Port wäre die falsche Antwort, denn dann messe ich später eine Seite, die nicht meine ist.
Darum `strictPort: true`: ist der Port weg, bricht der Start **laut** ab.
Über `PMH_LOGIN_PORT` umstellbar.

## Warum ein Proxy und keine zwei Adressen

Unsere Anmeldung setzt ihre Kekse mit **`SameSite=Strict`** (gemessen an `Set-Cookie`:
`pmh_session; HttpOnly; SameSite=Strict` und `pmh_csrf; SameSite=Strict`). Ein solcher Keks
wird **nur** bei Anfragen an **dieselbe Herkunft** mitgeschickt. Liefe die Seite auf `:5180`
und die API auf `:3081`, wäre das eine andere Herkunft — der Keks käme nie an und die
Anmeldung wäre **still wirkungslos**. Deshalb leitet `vite.config.ts` `/api` an den Host
weiter (`PMH_AUTH_HOST`, Vorgabe `http://127.0.0.1:3081`). In Produktion steht dasselbe
dahinter: die Seite wird vom Host selbst ausgeliefert.

## Prüfen, ob es wirklich läuft

`bun run build` beweist nur, daß TypeScript und der Bündler zufrieden sind — nicht, daß eine
Seite ausgeliefert wird und die deutschen Meldungen unverändert durchkommen. Dafür gibt es eine
eigene Sonde:

```sh
# Fenster 1
cd apps/login_web && bun run dev
# Fenster 2
bun docs/status/anmeldeseite-proxy-sonde.mjs
```

Gemessen (14.10.2026, **11/11 bestanden, exit 0**):

| Prüfung | Befund |
|---|---|
| Seite erreichbar | HTTP 200 |
| Seite trägt unsere Kennung | „Anmeldung — Prometheus Harness" |
| Seite ist **nicht** die des Nachbarn | „Welt-Prototyp" kommt nicht vor |
| `GET /api/pmh/auth/me` erreicht den Host | JSON |
| … ohne Anmeldung | 401 `nicht-angemeldet` |
| `POST /api/pmh/auth/login` mit falschem Kennwort | 401 `zugangsdaten-falsch` |
| … Meldung | „Adresse oder Passwort ist falsch." |
| … kein Keks bei Fehlschlag | `set-cookie: —` |
| `POST /api/pmh/auth/register` ohne Claim-Token | 403 `claim-fehlt` |

## Der Vertrag (gemessen am lebenden Host)

| Weg | Eingabe | Antwort |
|---|---|---|
| `POST /api/pmh/auth/login` | `{email, password}` | 401 `zugangsdaten-falsch`, 400 `eingabe-fehlt` |
| `POST /api/pmh/auth/register` | `{email, password, displayName?, claimToken?}` | 403 `claim-fehlt`, 401 `nicht-angemeldet`, 403 `csrf-fehlt` |
| `POST /api/pmh/auth/logout` | Kopf **`x-pmh-csrf`** | **204**, löscht `pmh_session` und `pmh_csrf` |
| `GET /api/pmh/auth/me` | — | 401 `nicht-angemeldet`, sonst `{ok:true, value:…}` |

Fehler kommen **immer** als `{ok:false, error:{code, message}}`; Erfolg als
`{ok:true, value:…}` (englischer Schlüssel — gemessen, nicht gewählt).

## Das Claim-Token

Solange **kein Admin** im Bestand existiert, verlangt die Registrierung ein **Claim-Token**
aus `claim.txt` im Harness-Home, und das erste so angelegte Konto wird **`admin`**. Das ist der
Riegel davor, daß „wer den Port zuerst erreicht" das Adminkonto bekommt. Das Feld ist auf der
Seite vorhanden, aber kein Ersatz für diesen Riegel: fehlt das Token, sagt der Server
`claim-fehlt`.

## Wohin nach der Anmeldung

Steht in **`src/weiter.ts`** an einer Stelle (`VORGABE_ZIEL`, Parameter `weiter`) — dort docken
später die Einstellungen an („wir machen später eine Steuerung settings, was nach dem login
passiert"). Bis dahin leitet die Seite **nicht** von selbst weiter (`AUTOMATISCH_WEITER =
false`): sie zeigt den Weg an und läßt ihn anklicken.

`?weiter=…` wird streng geprüft (**kein offener Weiterleiter**): nur relative Pfade dieser
Seite. Abgelehnt werden fremde Herkünfte, `//host`, `/\host`, Rückstriche, Steuerzeichen und
`javascript:…` — bei jedem abgelehnten Ziel gilt die Vorgabe.

## Was hier **noch nicht** ist

Ehrlich benannt, damit niemand es für erledigt hält:

- **Keine Verbindung zur Token-Tür des Harness.** Die Oberfläche (`apps/web`) authentifiziert
  sich heute über einen **Token** aus der Host-Konsole, nicht über ein Konto. Diese Seite baut
  die zweite Tür; verbunden sind die beiden noch nicht.
- **Kein Admin-Bereich.** Es gibt kein Konto-Verwalten, keine Rollenvergabe.
- **Kein Anmelde-Protokoll in der Oberfläche.** Der Server schreibt `auth_events`
  (`login-success`, `login-failed`, `logout`) — die Seite zeigt davon nichts.
- **Kein Kennwort-Zurücksetzen**, keine Kennwortregeln außer der Länge (der Server prüft).
