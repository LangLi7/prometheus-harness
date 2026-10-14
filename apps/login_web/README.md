# `apps/login_web` — die Anmeldeseite

Die Seite, die **vor** der Oberfläche steht: anmelden oder Konto anlegen. Sie spricht mit den
Wegen `/api/pmh/auth/*` unseres `auth-http`-Pakets und **erfindet nichts** — jede Meldung, die
sie zeigt, kommt wörtlich vom Server.

> **Seit 14.10.2026 liegt sie am Ursprung des Hosts.** Der Betreiber hat gefragt, ob die
> Anmeldung nicht auf **demselben Port** liegen muß wie der Host — sie muß: unsere Kekse sind
> `SameSite=Strict`, und ein solcher Keks kommt **nur** bei **derselben Herkunft** an. Auf einem
> eigenen Port wäre die Anmeldung **still wirkungslos**. Ausgeliefert wird sie deshalb vom Host
> selbst (`packages/api/auth-http/src/anmeldung.ts`, Weg `/anmeldung`); der Entwicklungsserver
> ist nur noch ein Arbeitswerkzeug.

## Starten

```sh
bun install                 # im Wurzelverzeichnis, falls noch nicht geschehen
cd apps/login_web
bun run dev                 # http://127.0.0.1:5180/anmeldung/
```

| Befehl | Wirkung |
|---|---|
| `bun run dev` | Entwicklungsserver auf **5180**, Seite unter `/anmeldung/` |
| `bun run build` | Bau nach `dist/` (gemessen: `index.html` 0,83 kB, CSS 2,05 kB, JS 224,35 kB) |
| `bun run test` | die Prüfungen des Weiterleiters (`tests/weiter.test.ts`, 8/8) |
| `bun run typecheck` | `tsgo --noEmit` nach **`tsconfig.base.json`** des Hauses |

Die Seite liegt **unter demselben Pfad** wie beim Host (`base: '/anmeldung/'` in
`vite.config.ts`). Ein Unterschied zwischen Entwicklung und Betrieb könnte sonst einen Fehler
verdecken, den es nur im Betrieb gibt.

### Der Port ist gemessen, nicht geraten

**5180.** `5173` und `5176` sind auf diesem Rechner **belegt** — auf `5176` lauschte ein
**fremder** Vite-Server, der „Prometheus — Welt-Prototyp" ausliefert. Mein erster Startversuch
hat ihn getroffen. Ein stiller Umzug auf einen freien Port wäre die falsche Antwort, denn dann
messe ich später eine Seite, die nicht meine ist. Darum `strictPort: true`: ist der Port weg,
bricht der Start **laut** ab. Über `PMH_LOGIN_PORT` umstellbar.

## Im Betrieb: der Host liefert die Seite

| Weg | Was er tut |
|---|---|
| `GET /anmeldung` und `/anmeldung/…` | die **gebaute** Seite (Präfixweg, damit `/anmeldung/assets/…` mitkommt) |
| `GET /start` | die **Schnittstelle nach der Anmeldung** — serverseitig gerendert, ohne JavaScript |
| `GET /pmh/anmelden` | die **eingebaute** Seite (`auth-http/src/seite.ts`) — Rückfall ohne Bauausgabe |

**Ohne Bauausgabe** liefert `/anmeldung` eine **303** auf `/pmh/anmelden`. Kein 404, kein 503:
die Anmeldung darf nicht daran scheitern, daß niemand `bun run build` gerufen hat — die
eingebaute Seite ist geprüft (12 Prüfungen) und braucht keinen Bau. Beim Einbinden steht der
Hinweis im Protokoll, damit die Ursache auffindbar bleibt.

Der Bau wird gesucht unter `apps/login_web/dist` im Arbeitsverzeichnis; `PMH_ANMELDUNG_BAU`
zeigt woandershin.

> **Stand der Messung (14.10.2026, nach dem Neustart):** die Wege sind **live**. Der Host auf
> `127.0.0.1:3081` liefert `/anmeldung/` mit **200** (der gebauten Seite samt
> `/anmeldung/assets/…`), `/start` mit **303 → `/anmeldung/`**, `/pmh/anmelden` mit **200** und
> `/` weiterhin mit **401** (Token-Tor). Dieselbe Sonde, gegen den Host statt gegen den
> Entwicklungsserver, gibt **15/15, exit 0**. Vor dem Neustart waren `/anmeldung/` und `/start`
> **404** — der Host lief mit einem älteren Stand.

## Wohin nach der Anmeldung

**Nach `/start`** — die Schnittstelle. Sie zeigt, wer angemeldet ist (Name, Adresse, Rolle),
und von dort geht es weiter. Ohne gültige Sitzung leitet sie auf die Anmeldeseite zurück; es
gibt also keine Schleife, sondern einen Kreis, der sich schließt, sobald die Anmeldung gelingt.

Das Ziel steht in **`src/weiter.ts`** an einer Stelle (`VORGABE_ZIEL`, Parameter `weiter`) —
dort docken später die Einstellungen an („wir machen später eine Steuerung settings, was nach
dem login passiert"). `?weiter=…` wird streng geprüft (**kein offener Weiterleiter**): nur
relative Pfade dieser Seite. Abgelehnt werden fremde Herkünfte, `//host`, `/\host`, Rückstriche,
Steuerzeichen und `javascript:…` — bei jedem abgelehnten Ziel gilt die Vorgabe.

## Der Vertrag (gemessen am lebenden Host)

| Weg | Eingabe | Antwort |
|---|---|---|
| `POST /api/pmh/auth/login` | `{email, password}` | 401 `zugangsdaten-falsch`, 400 `eingabe-fehlt` |
| `POST /api/pmh/auth/register` | `{email, password, displayName?, claimToken?}` | 403 `claim-fehlt`, 401 `nicht-angemeldet`, 403 `csrf-fehlt` |
| `POST /api/pmh/auth/logout` | Kopf **`x-pmh-csrf`** | **204**, löscht `pmh_session` und `pmh_csrf` |
| `GET /api/pmh/auth/me` | — | 401 `nicht-angemeldet`, sonst `{ok:true, value:…}` |

Fehler kommen **immer** als `{ok:false, error:{code, message}}`; Erfolg als
`{ok:true, value:…}` (englischer Schlüssel — gemessen, nicht gewählt).

## Prüfen, ob es wirklich läuft

```sh
# Fenster 1
cd apps/login_web && bun run dev
# Fenster 2
bun docs/status/anmeldeseite-proxy-sonde.mjs
```

Gemessen (14.10.2026, **15/15 bestanden, exit 0**): Seite 200 mit eigener Kennung, „Welt-Prototyp"
kommt **nicht** vor, **alle** Verweise der Seite liegen unter `/anmeldung/` und sind erreichbar,
`GET /api/pmh/auth/me` → 401 `nicht-angemeldet`, Login mit falschem Kennwort → 401
`zugangsdaten-falsch` mit dem wörtlichen Text *„Adresse oder Passwort ist falsch."*, kein Keks
bei Fehlschlag, Registrierung ohne Claim → 403 `claim-fehlt`.

## Das Claim-Token

Solange **kein Admin** im Bestand existiert, verlangt die Registrierung ein **Claim-Token** aus
`claim.txt` im Harness-Home, und das erste so angelegte Konto wird **`admin`**. Das ist der
Riegel davor, daß „wer den Port zuerst erreicht" das Adminkonto bekommt.

## Was hier **noch nicht** ist

- **Keine Verbindung zur Token-Tür des Harness.** Die Oberfläche authentifiziert sich über einen
  **Token** aus der Host-Konsole, nicht über ein Konto. Diese Seite baut die Konto-Tür und sagt
  das auf `/start` auch selbst. Ein Token, der dort ausgegeben würde, stünde in der Adreßzeile,
  im Verlauf und im Zugriffsprotokoll — und er gilt für **alles**.
- **Kein Browser-Nachweis.** Auf diesem Rechner ist **kein** Browser installiert; die Prüfungen
  fahren HTTP über einen echten Socket, keinen Browser.
- **Kein Admin-Bereich**, kein Kennwort-Zurücksetzen in der Oberfläche, kein Anmelde-Protokoll
  (`auth_events` schreibt der Server, die Seite zeigt davon nichts).
