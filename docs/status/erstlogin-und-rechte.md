# Erstlogin und Rechte — B2 abgeschlossen

**Stand:** 13.10.2026 · **Neues:** Tor im Registrierungsweg, Claim-Speicher, `scripts/claim.mjs`

Dieses Blatt belegt eine Aussage: **die Registrierung ist jetzt ein Tor, und der Weg hinein
ist ein Geheimnis auf dem Rechner.** Jede Zahl nennt den Befehl, der sie gemessen hat.

---

## 1. Was vorher fehlte

`@prometheus-harness/claim` (21 Prüfungen) und `@prometheus-harness/permissions`
(30 Prüfungen) waren fertig und hatten **keinen Aufrufer**. `permissions` kennt für genau
diesen Fall eine Aktion — `benutzer-anlegen` — und `claim` eine Regel für den Anfang. Ein
Recht, das niemand abfragt, ist keines: bis heute konnte **jeder**, der den Port erreichte,
ein Konto anlegen.

## 2. Das Tor — zwei Wege, und warum genau zwei

| Wann | Wer | Wodurch belegt | Rolle des Neuen |
|---|---|---|---|
| **Erstinbetriebnahme** | wer **lokal** am Rechner sitzt | Claim-Token aus `claim.txt` (0600) **und** Bindung an Rechner, lokalen Nutzer, Gerätekennung | **admin** |
| **danach** | ein angemeldeter **Admin** | Sitzungscookie **und** CSRF-Wert, dann `darfAusfuehren` | user |

Die Abweisungen auf dem Claim-Weg sind **unterscheidbar** (`claim-anderer-rechner`,
`claim-token-falsch`) — der Eigentümer sitzt dort selbst und muß wissen, was schiefging.
Auf dem Admin-Weg bleibt die Meldung knapp.

## 3. Der Beweis: zehn Fälle über echtes HTTP gegen die echte Datenbank

```
⚙ PMH_TEST_DATABASE_URL → pmh_test, DATABASE_URL → pmh   (Sicherung: bricht ab, wenn beide gleich sind)
bun test packages/api/auth-http/tests/postgres.test.ts  →  10 pass / 0 fail
```

| Fall | erwartet | gemessen |
|---|---|---|
| ohne Claim-Token | 403 | **403** `claim-fehlt` — und `count()==0` danach |
| mit falschem Token | 403 | **403** `claim-token-falsch`, **der echte Claim bleibt gültig** |
| mit richtigem Token | 201 admin | **201**, `role: "admin"` |
| **die Zeile in der Datenbank** | `admin` | **`admin`** |
| ohne Sitzung | 401 | **401** `nicht-angemeldet` |
| als Admin ohne CSRF | 403 | **403** `csrf-fehlt` |
| als Admin mit CSRF | 201 user | **201**, `role: "user"` |
| als **Benutzer** mit gültigem CSRF | 403 | **403** `recht-admin-erforderlich` |

Der letzte Fall ist der, auf den es ankommt: alles davor könnte auch **ohne** `permissions`
funktionieren. Dort ist der Benutzer korrekt angemeldet, hat einen gültigen CSRF-Wert — und
`darfAusfuehren` sagt nein. Der Grund `admin-erforderlich` kommt aus dem Paket.

## 4. Der Fehler, den erst die Datenbankzeile zeigte

**Der Weg meldete `"role":"admin"`, die Tabelle hielt `role='user'`.**

In `packages/auth/auth/src/identity.ts`:

```ts
const id = await store.create({ id, email, passwordHash, displayName })   // ← role fehlt
…
return { ok: true, user: { …, role: options.role ?? 'user' } }            // ← aber behauptet
```

`RegisterOptions.role` gab es, `NewUser` hatte **kein Feld dafür** — die Rolle konnte gar
nicht in die Zeile gelangen. Der Aufrufer bekam **gesagt**, es sei ein Admin.

**Das ist schlimmer als ein ignoriertes Feld:** der Erstlogin hätte ein „Admin"-Konto
gemeldet, mit dem sich nichts verwalten läßt, und die Ursache läge drei Schichten entfernt.
Behoben (`NewUser.role`, Durchreichen an `store.create`, `role` in der `INSERT`-Anweisung),
mit drei Prüfungen festgenagelt — darunter eine, die die **Datenbankzeile** liest statt die
Antwort.

## 5. Die Aussperrung, die meine eigene Verdrahtung erzeugt hat

Nach dem Einbau des Tores gemessen, in der **Betriebsdatenbank**:

```
benutzer=4  davon_admins=0
POST /api/pmh/auth/register  →  401 nicht-angemeldet
```

Die Erstinbetriebnahme war nach der Regel des Claim-Pakets zu („keine **Konten**"), und einen
Admin, der hätte anlegen dürfen, gab es nicht. **Vor** der Verdrahtung ging es (schlecht,
aber es ging) — das Tor hätte daraus eine Aussperrung gemacht.

**Die Reparatur:** der Claim-Weg ist auch offen, wenn es **keinen Administrator** gibt.
`UserStore.count()` beantwortet das nicht, deshalb ein eigener Zähler am Speicher
(`anzahlAdmins`, `SELECT count(*) … WHERE role = 'admin'`).

**Im Host nachgemessen**, mit demselben Aufruf vorher und nachher:

| Stand | Antwort auf `POST register` ohne Claim |
|---|---|
| vorher | **401** `nicht-angemeldet` — ausgesperrt |
| nachher | **403** `claim-fehlt` — der Weg ist offen |
| mit geratenem Token | **403** `claim-kein-claim` |

Und die Datenbank blieb unberührt: `benutzer=4 admins=0 versuche_angelegt=0`.

**Ein Claim führt heraus, nachgestellt und geprüft:** Admin zum Benutzer gemacht
(`anzahlAdmins()==0`, `count()>0`) → ohne Claim 403 → mit Claim **201 admin**, Datenbankzeile
`admin`, `anzahlAdmins()==1` → und danach wieder zu (401).

## 6. Mein eigener Fehler: ich habe in `~/.dsh` geschrieben

**Das ist der schwerste Fehler dieser Runde, und er verstößt gegen eine ausdrückliche Regel.**

`scripts/claim.mjs` nahm zuerst `resolvePmhHome()`. Dessen Kette lautet
`PMH_HOME → DSH_HOME → ~/.pmh`. Gemessen auf diesem Rechner:

```
PMH_HOME = (leer)
DSH_HOME = C:\Users\Chang\.dsh
scripts/claim.mjs -> "Home: C:\Users\Chang\.dsh"        ← FALSCH
```

Der Lauf legte um **21:27:44** drei Dateien in `C:\Users\Chang\.dsh` an: `claim.txt`,
`claim-ablage.json`, `geraet`.

**Was ich getan habe:**

1. **Gemessen statt vermutet** — die drei Dateien tragen den Zeitstempel meines Laufs, und
   `claim.txt` beginnt mit meinem eigenen Text (`Erstinbetriebnahme des Prometheus Harness`).
   Damit war belegt, daß sie von mir stammen und nicht von einem anderen Werkzeug.
2. **Nur diese drei entfernt** und danach geprüft, daß keine Datei aus meinem Lauf mehr
   dort liegt.
3. **Den Fehler unmöglich gemacht:** `resolveEigenesHome()` in
   `@prometheus-harness/home-paths` — `PMH_HOME`, sonst `~/.pmh`, **niemals `DSH_HOME`**,
   und eine **harte Sperre**: zeigt der Pfad auf das DSH-Home oder endet er auf `.dsh`, wird
   **geworfen** statt geschrieben. Sechs Prüfungen, beide Richtungen.
4. **Denselben Aufruf wiederholt:** `Home: C:\Users\Chang\.pmh`, `~/.dsh` unberührt.

`resolvePmhHome` bleibt **unverändert** — für einen Umzug aus einem bestehenden DSH-Home ist
die Kette richtig. Nur für eigene **Dateien** ist sie falsch. Beide Regeln stehen
nebeneinander; eine Prüfung hält fest, daß die alte sich nicht geändert hat.

## 7. Das Skript, ohne das das Tor eine Wand gewesen wäre

Der Weg über den Claim war offen — und **niemand konnte ihn betreten**, weil nichts einen
Claim erzeugte. `scripts/claim.mjs` schließt das: es legt `claim.txt` (Klartext, 0600) und
`claim-ablage.json` (**nur der Hash**, 0600) an, nennt Rechner, Nutzer und Ablauf, und
**bricht ab, wenn es schon einen Administrator gibt** — ein Claim, den niemand einlösen kann,
wäre ein Geheimnis ohne Wirkung, und ein solches ist eine Einladung.

Nachgemessen: Ablage `tokenHash` 64 Zeichen, `verbraucht=false`, und der Hash ist **nicht**
das Klartext-Token (43 Zeichen).

## 8. Noch ein fehlender Ausfuhr — und ein unauflösbares Paket

| Befund | Beleg | Behandlung |
|---|---|---|
| `home-paths` hatte als **einziges** der 22 Pakete kein `exports`-Feld | `Cannot find module '@prometheus-harness/home-paths'` beim Typlauf | Feld ergänzt wie bei allen anderen |
| `claim` und `permissions` waren **gar nicht verknüpft** | sie fehlten in `node_modules/@prometheus-harness/` | Junctions von Hand (wie bei den zwei Paketen davor) |
| `db-schema` ist von außen nicht typisierbar — **zweite Ausfertigung** | vier `TS2307` auf die Migrationen in `auth-http` | `src/sql.d.ts` kopiert. Jetzt **zwei** Kopien; die Empfehlung „an eine gemeinsame Stelle" ist damit dringlicher, nicht optional |
| `adminProfil` und `vorgabeProfil` schreiben Wurzeln **verschieden** | `adminProfil` → `C:\…\home` (unnormalisiert), `vorgabeProfil` → `C:/…/home/workspace` | **gemeldet, nicht geändert.** Die Entscheidung ist sicher (`liegtIn` normalisiert intern, beide Formen nachgemessen); wer Wurzeln **direkt** vergleicht, trifft die Falle — mein eigener Test ist hineingelaufen |

## 9. Prüfstand

| Prüfung | Ergebnis |
|---|---|
| Claim-Speicher und Rechte (ohne Datenbank) | **13 pass / 0 fail** |
| Tor über echtes HTTP gegen echtes PostgreSQL | **10 pass / 0 fail** |
| Home-Auflösung (inkl. 6 neuer Prüfungen) | **21 pass / 0 fail** |
| Speicher, Attrappen (inkl. 2 neuer) | **32 pass / 0 fail** |
| Typsystem | **22 Pakete grün**, Exit **0** |
| Gesamtsuite auf `pmh_test` | **1042 pass / 2 fail** — 1044 in 39 Dateien |
| Host mit dem neuen Tor, Betriebsdatenbank | **403 `claim-fehlt`** statt 401 — Weg offen, DB unberührt |

Die 2 roten sind **nicht unsere** und waren es vorher: `apps/cli` (`typert-loader`) und
`packages/util/atomic-write` (`Zugriff verweigert`, os error 5).

Die Zahl stieg von **1009 auf 1042** grün: **33** neue Prüfungen, keine verloren.

## 10. Was offen ist

| Was | Warum |
|---|---|
| **B3** | Migration **`0005`** `user_profiles` — nicht `0004` (belegt) |
| **RLS (Migration 0006)** | der Aufrufer, der den Mandanten setzt, ist mit `werBinIch` **da** |
| **`resolvePmhHome` bleibt eine Falle für eigene Dateien** | richtig für einen Umzug, falsch für alles, was uns gehört. Wer sie benutzt, muß wissen, warum — das steht jetzt im Kopf von `resolveEigenesHome` |
| **`adminProfil` normalisiert nicht** | gemeldet; die Änderung berührt ein Paket mit 30 Prüfungen und braucht eine eigene Runde |
| **Drei Kopien von `sql.d.ts`** | bei der nächsten kommt die vierte. Gehört ins Typsystem des Projekts |
