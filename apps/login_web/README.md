# `apps/login_web` — die Anmeldeseite

Die Seite vor der Oberfläche: anmelden oder Konto anlegen. Sie spricht mit den vier Wegen
`/api/pmh/auth/*` und zeigt jede Meldung so, wie der Server sie schickt.

**Sie liegt am Ursprung des Rechners**, nicht auf einem eigenen Port. Der Rechner liefert sie
unter `/anmeldung/` aus (`packages/api/auth-http/src/anmeldung.ts`). Grund: unsere Kekse sind
`SameSite=Strict`, und ein solcher Keks kommt nur bei derselben Herkunft an. Auf einem eigenen
Port wäre die Anmeldung still wirkungslos.

## Entwickeln

```sh
bun install                       # in der Projektwurzel
cd apps/login_web
bun run dev                       # http://127.0.0.1:5180/anmeldung/
```

| Befehl | Wirkung |
|---|---|
| `bun run dev` | Entwicklungsserver auf 5180, Seite unter `/anmeldung/` |
| `bun run build` | Bau nach `dist/` |
| `bun run test` | Weiterleiter und Sprachwahl (15 Prüfungen) |
| `bun run typecheck` | `tsgo --noEmit` nach `tsconfig.base.json` des Hauses |

Port 5180 ist gemessen frei: 5173 und 5176 sind auf diesem Rechner belegt (auf 5176 lauschte ein
fremder Server). `strictPort: true` — ist der Port weg, bricht der Start laut ab, statt heimlich
woanders zu lauschen.

## Am laufenden Rechner

| Weg | Was er tut |
|---|---|
| `/anmeldung/` | die gebaute Seite |
| `/start` | die Schnittstelle nach der Anmeldung |
| `/api/pmh/auth/sprachen` | die angebotenen Sprachen |
| `/pmh/anmelden` | die eingebaute Seite — Rückfall ohne Bauausgabe |

Ohne Bauausgabe geht `/anmeldung` mit **303** auf `/pmh/anmelden`. Kein 404, kein 503: die
Anmeldung darf nicht daran scheitern, daß niemand `bun run build` gerufen hat.

## Nach der Anmeldung

Nach `/start`. Die Seite zeigt, wer angemeldet ist, und den Weg weiter. Ohne Sitzung leitet sie
auf die Anmeldeseite zurück.

Das Ziel steht in `src/weiter.ts` (`VORGABE_ZIEL`, Parameter `weiter`) — dort kommen später die
Einstellungen dazu. `?weiter=…` nimmt **nur** relative Ziele: fremde Herkünfte, `//host`,
`/\host`, Rückstriche und Steuerzeichen fallen auf die Vorgabe zurück.

Automatisch weitergeleitet wird **nicht** (`AUTOMATISCH_WEITER = false`) — die Einstellung gibt
es noch nicht.

## Sprache

Die Texte kommen aus `packages/util/sprachen` — demselben Paket, aus dem der Rechner `/start`
baut. Umschalter oben rechts; die Wahl liegt im Keks `pmh_sprache`.

Die Reihenfolge: Keks, dann Browsersprache, dann Deutsch. Einzelheiten und Messungen:
`docs/status/anmeldung-sprachen.md`.

**Offen:** die Meldungen des Servers sind deutsch („Adresse oder Passwort ist falsch."). Der
Server kennt noch keine Sprachwahl.

## Der Vertrag

| Weg | Eingabe | Antwort |
|---|---|---|
| `POST /api/pmh/auth/login` | `{email, password}` | 401 `zugangsdaten-falsch`, 400 `eingabe-fehlt` |
| `POST /api/pmh/auth/register` | `{email, password, displayName?, claimToken?}` | 403 `claim-fehlt`, 401 `nicht-angemeldet`, 403 `csrf-fehlt` |
| `POST /api/pmh/auth/logout` | Kopf `x-pmh-csrf` | 204 |
| `GET /api/pmh/auth/me` | — | 401 `nicht-angemeldet`, sonst `{ok:true, value:…}` |

## Prüfen

```sh
# Fenster 1
cd apps/login_web && bun run dev
# Fenster 2
bun docs/status/anmeldeseite-proxy-sonde.mjs
```

Die Sonde geht auch gegen den Rechner:

```sh
bun docs/status/anmeldeseite-proxy-sonde.mjs http://127.0.0.1:3081     # 15/15
```

Sie prüft die Kennung der Seite, **alle** ihre Verweise (unter `/anmeldung/` und erreichbar),
die vier Wege und die deutschen Meldungen. Ein fremder Server auf demselben Port fällt auf, weil
sie nach der eigenen Kennung sucht und die des Nachbarn ausschließt.

## Das erste Konto wird Admin

Solange kein Admin existiert, verlangt die Registrierung ein Claim-Token aus `claim.txt`, und das
erste so angelegte Konto wird `admin`. Der Riegel davor, daß „wer den Port zuerst erreicht" das
Adminkonto bekommt. Erzeugen mit `bun scripts/claim.mjs`; das Token gilt 15 Minuten und wirkt
genau einmal. Adresse und Kennwort wählt der Betreiber.

## Was fehlt

- **Kein Browser-Nachweis.** Auf diesem Rechner ist kein Browser installiert; die Prüfungen
  fahren HTTP über einen echten Socket.
- **Keine Verbindung zur Token-Tür.** Die Oberfläche authentifiziert sich über einen Token aus
  der Konsole, nicht über ein Konto. `/start` sagt das auf der Seite selbst.
- **Kein Admin-Bereich**, kein Kennwort-Zurücksetzen, keine Anzeige der Prüfspur.
