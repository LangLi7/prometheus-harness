# E4 — die maschinengebundenen Pfade: Bestandsaufnahme

> **Stand:** 13.10.2026 · **Auftrag (E4):** *„Die maschinengebundenen Hilfsskripte
> unter `docs/protokoll/aufsicht/hilfen/` vor einer Veröffentlichung entfernen oder
> konfigurierbar machen (22 feste Pfade)."*
>
> **Ergebnis dieses Schritts:** die **Bestandsaufnahme** — mit Zahlen, die einen
> Meßweg haben. Der Umbau selbst ist **nicht** gemacht (§4).

---

## 1. Die Zahl aus dem Auftrag stimmt nicht mit der Messung überein

Gemessen in `docs/protokoll/aufsicht/hilfen/` (8 Dateien):

| Muster | Treffer | Dateien |
|---|---|---|
| `[A-Z]:\` (Laufwerkspfad, irgendein Laufwerk) | **10** | **5** |
| `Users\Chang` (voller Benutzername) | **3** | 3 |
| `/mnt/c/Users/Chang` (WSL-Schreibweise) | **0** | 0 |
| `.pmh` | 12 | 4 |
| `.dsh` | 10 | 2 |
| `127.0.0.1` | 14 | 3 |

Und über **den ganzen** Ordner `docs/protokoll/aufsicht/`:

| Muster | Treffer | Dateien |
|---|---|---|
| `C:\Users\Chang` | **73** | **14** |
| `[A-Z]:\` | **90** | **19** |

**Der Auftrag nennt 22.** Ich kann diese Zahl **weder in `hilfen/` noch im ganzen
Aufsicht-Ordner** reproduzieren — 10, 73 oder 90, je nach Muster und Umfang, aber
nicht 22. **Was das heißt:** die Zahl stammt aus einer Zählung, deren Regel ich nicht
kenne (anderer Umfang? andere Muster? nur die „festen" im Sinne von *nicht* als
Parameter?). **Ich rate nicht.** Für den Umbau zählt ohnehin nicht die Zahl, sondern
**welche Stellen es sind** — und die stehen unten namentlich.

## 2. Die Stellen in `hilfen/` — namentlich

| Datei | Zeile | Was dort steht |
|---|---|---|
| `anbieter-rauchtest.mjs` | 39 | `const REPO = 'C:\\Users\\Chang\\prometheus-harness'` |
| `anbieter-rauchtest.mjs` | 40 | `const SPEICHER = 'C:\\Users\\Chang\\.pmh\\.credentials.yaml'` |
| `b1-nachziehen.mjs` | 51 | `const LIVE = 'C:\\Users\\Chang\\.dsh\\settings.yaml'` |
| `b1-nachziehen.mjs` | 52 | `const QUELLE = '…\\.dsh\\crew\\backup\\settings.yaml.2026-09-22T22-51-48.bak'` |
| `b1-nachziehen.mjs` | 53 | `const VORZUSTAND = '…\\.dsh\\settings.yaml.bak-t63-before-repair-20261013-103555'` |
| `zugang-bereitstellen.mjs` | 21, 50 | Vorgabe `C:\Users\Chang\.pmh` im Hilfetext **und** im Code |
| `vorhandene-bausteine.md` | 45 | `C:\Users\Chang\.dsh\.env` in einem Beispielbefehl |
| `kennwoerter-drehen.mjs` | 39 | Beispielbefehl im Hilfetext |

**Drei Arten, und sie sind unterschiedlich schlimm:**

1. **Als Vorgabewert im Code** (`zugang-bereitstellen.mjs` — aber *mit* `--quelle`-Schalter; die Vorgabe ist also bereits **überschreibbar**, nur der Vorgabewert ist maschinengebunden).
2. **Als feste Konstante** (`anbieter-rauchtest.mjs`, `b1-nachziehen.mjs`) — **nicht** überschreibbar. Diese sind die eigentlichen „festen Pfade".
3. **Im Hilfetext oder Beispiel** (`kennwoerter-drehen.mjs`, `vorhandene-bausteine.md`) — sie **tun nichts**, sie **zeigen** nur. Für eine Veröffentlichung sind sie trotzdem ein Befund: sie nennen einen fremden Benutzernamen.

## 3. Warum das überhaupt ein Punkt ist

* **`b1-nachziehen.mjs`** ist der schwerste Fall: es nennt **Sicherungsdateien des
  anderen Harness** (`~/.dsh/…backup…`) — einen **fremden Baum**. Wer das Skript
  ausführt, faßt fremde Daten an, wenn die Pfade nicht stimmen.
* **`anbieter-rauchtest.mjs`** nennt `.credentials.yaml` — eine Datei mit
  **Zugangsdaten**. Ein Skript, das einen festen Pfad dorthin trägt, ist auf einem
  fremden Rechner nicht nur nutzlos, sondern **irreführend**.
* **Für eine Veröffentlichung** ist ein Benutzername im Klartext ein kleiner, aber
  echter Befund — dieselbe Klasse wie der Pfad, den ich heute in der `LICENSE`
  gefunden habe.

## 4. Was **nicht** getan ist — und der Vorschlag

**Der Umbau ist nicht gemacht.** Was dafür nötig ist, in dieser Reihenfolge:

| Schritt | Was | Betrifft |
|---|---|---|
| 1 | Ein gemeinsamer Weg für die Auflösung: `PMH_VERZEICHNIS` aus der Umgebung, sonst `process.cwd()`, sonst ein klarer Fehler — **ein** Modul statt vier Abschriften | alle `.mjs` in `hilfen/` |
| 2 | Die festen Konstanten zu Parametern machen (`--repo`, `--speicher`, `--live`, `--quelle`) mit **lesbarem** Vorgabewert aus Schritt 1 | `anbieter-rauchtest.mjs`, `b1-nachziehen.mjs` |
| 3 | Hilfetexte und Beispiele auf Platzhalter umstellen (`%PMH_HOME%`, `<repo>`) | `kennwoerter-drehen.mjs`, `vorhandene-bausteine.md`, `zugang-bereitstellen.mjs` |
| 4 | Eine Prüfung, die neue maschinengebundene Pfade **auffallen** läßt — sonst ist der Zustand in einer Woche wieder da | ein Skript + ein Test |

**Warum ich hier stehenbleibe.** Diese Dateien sind die **Werkzeuge der Aufsicht** —
einer anderen Rolle, die parallel arbeitet. Sie umzubauen, während sie benutzt
werden, riskiert genau den Ärger, den E4 verhindern soll: ein Werkzeug, das plötzlich
andere Parameter verlangt. **Der Umbau gehört abgestimmt**, nicht nebenbei gemacht.

**Was ohne Abstimmung ginge und ich als nächstes mache:** Schritt **4** — die Prüfung.
Sie ändert an den Werkzeugen **nichts**, macht den Zustand aber **meßbar** und hält ihn
fest. Und sie ist die Voraussetzung dafür, daß man den Umbau hinterher **nachweisen**
kann.

## 5. Nachfahren

```powershell
cd C:\Users\Chang\prometheus-harness

# Die festen Pfade in hilfen/ — namentlich
Get-ChildItem docs/protokoll/aufsicht/hilfen -Recurse -File |
  Select-String -Pattern '[A-Z]:\\' | ForEach-Object { "$($_.Filename):$($_.LineNumber)  $($_.Line.Trim())" }

# Zählen, wie der Auftrag es nennt
(Get-ChildItem docs/protokoll/aufsicht/hilfen -Recurse -File | Select-String -Pattern '[A-Z]:\\' | Measure-Object).Count

# Der weitere Umfang
(Get-ChildItem docs/protokoll/aufsicht -Recurse -File | Select-String -Pattern 'C:\\Users\\Chang' | Measure-Object).Count

# Das Werkzeug (Schritt 4) — Bericht und strenge Fassung
bun scripts/maschinenpfade.mjs pruefen docs/protokoll/aufsicht/hilfen
bun scripts/maschinenpfade.mjs pruefen docs/protokoll/aufsicht/hilfen --streng   # Exit 1 bei Fund
bun scripts/maschinenpfade.mjs pruefen .                                        # der ganze Baum
```

---

## 6. Das Werkzeug (Schritt 4) — gebaut und geprüft

`scripts/maschinenpfade.mjs` + `scripts/maschinenpfade.test.mjs` (**7 Prüfungen, alle
grün**). Es **ändert nichts** — es findet und berichtet.

**Die Muster sind allgemein, nicht auf einen Namen gemünzt** (`C:\Users\<wer>`,
`/home/<wer>`, `/Users/<wer>`, `/mnt/<x>/Users/<wer>`). Eine Prüfung, die `Chang`
sucht, wäre **selbst maschinengebunden** und auf dem nächsten Rechner blind — geprüft
wird deshalb mit **erfundenen** Benutzernamen (`erika`, `otto`).

**Ausgenommen**, weil es Rauschen wäre: `node_modules/`, `.git/`, `target/`,
`.pmh-build/`, `dist/` und die **kopierte Core-Dokumentation** (`docs/dsh/`,
`docs/design/`). Deren Pfade gehören zum Upstream und sind nicht unsere.

### Gemessen

| Aufruf | Ergebnis | Exit |
|---|---|---|
| `pruefen docs/protokoll/aufsicht/hilfen` | **13** Funde in **5** Dateien (9 Windows-Profil, 4 POSIX-Home) | **0** |
| `… --streng` | derselbe Bericht | **1** |
| `pruefen .` (ganzer Baum) | **357** Funde in **100** Dateien (270 Windows-Profil, 80 POSIX-Home, 7 WSL) | **0** |
| `bun test scripts/maschinenpfade.test.mjs` | **7 pass, 0 fail** | **0** |

**Die 357 im ganzen Baum sind kein Auftrag, sondern eine Größe.** Die größten
Posten sind `website/.vitepress/cache/` (30), `docs/protokoll/aufsicht/protokoll.md`
(26), `packages/auth/permissions/tests/permissions.test.ts` (24 — Pfade in
Prüfvorlagen, also **berechtigt**), `docs/protokoll/aufsicht/befunde.md` (22). Und
**9 in diesem Dokument selbst**, weil es die Muster zitiert — dieselbe Erscheinung
wie beim Lizenztext: eine Prüfung findet ihren eigenen Bericht.

**Für E4 zählt die erste Zeile** — die Werkzeuge der Aufsicht. Die 357 sind der
Hinweis, wie groß die Aufgabe **vor einer Veröffentlichung** wirklich ist.
