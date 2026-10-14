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

## Nachtrag — das Werkzeug hat sich selbst korrigiert

Eine Gegenprobe („prüft das Werkzeug eigentlich, was es behauptet?") hat **drei
Fehler** gefunden, zwei im Werkzeug und **einen in meiner Prüfung**.

**1. Erzeugter Cache wurde mitgezählt.** `website/.vitepress/cache/` (30 Funde) und
`website/.bun-cache/` sind Vite-Artefakte; sie backen absolute Pfade dieser Maschine
in generierten Code ein. Das ist derselbe Fall wie `dist` und gehört in die
Ausnahmeliste. Der Test prüft jetzt **beides**: daß der Cache fällt **und** daß der
Quelltext derselben Seite (`website/docs.ts`, `website/.vitepress/config.ts`) weiter
geprüft wird — sonst wäre die Ausnahme ein Freibrief für ganz `website/`.
Wirkung: **106 → 103** Dateien, **36 → 33** ausführbare.

**2. Ein Windows-Pfad mit Schrägstrichen galt als „POSIX-Home".** Vite schreibt
`C:/Users/<wer>/...`; darauf griff das Muster für POSIX-Home (`/Users/…`), während das
Windows-Muster Backslashes **verlangte**. 48 „POSIX"-Funde waren zur Hälfte
Windows-Pfade — also eine Form, die auf einem Linux-Wirt gar nicht existiert. Jetzt
akzeptiert das Windows-Muster beide Trenner und das POSIX-Muster hat Lookbehinds gegen
Laufwerksbuchstabe und `/mnt/<x>` (sonst zählt derselbe Pfad zweimal).
Aufschlüsselung **281/48/7 → 304/30/8**.

**3. Mein eigener Gegenprüfbefehl war falsch — nicht das Werkzeug.** Ich hatte mit
`C:\\Users\\[A-Za-z]` nachgezählt und für `b1-nachziehen.mjs` „**0 Funde**" gemeldet.
Die Datei enthält aber `C:\\Users\\Chang` — **doppelt** geschriebene Backslashes, weil
sie in einer JS-Zeichenkette stehen. Mein Muster erwartete **einen** Backslash und
übersah damit genau die echten Treffer. Das Werkzeug (`\\+`, „ein oder mehr") hatte
recht: **5 Funde**. *Eine Gegenprobe mit einem selbstgebauten Muster ist keine
Gegenprobe, sondern eine zweite Meinung — sie muß selbst belegt sein.*

### Was von den 342 wirklich Auftrag ist

| Größe | Zahl |
|---|---|
| Funde im ganzen Baum | **347** in **103** Dateien (304 Windows, 30 POSIX, 8 WSL) |
| davon **ausführbare** Dateien (`.mjs/.ts/.js/.sh/.ps1`) | **33** |
| davon Prosa/Beleg (`.md/.json/.yml`) | **70** |
| Cache-Reste nach der Korrektur | **0** |

**Die 347 waren 342, bevor ich diesen Nachtrag schrieb.** Die Differenz von **5** sind
die Pfadmuster, die ich oben zitiert habe — die Funde in *diesem* Dokument stiegen von
**11** auf **16**, genau um diese 5. Die Prüfung findet ihren eigenen Bericht, und
zwar **sofort**: eine Zahl in einem Dokument dieser Art ist schon veraltet, wenn sie
geschrieben wird. Deshalb steht sie hier mit ihrer eigenen Ursache.

Die Trennung ist der Punkt: **Belege dürfen und müssen den Meßrechner nennen** —
`groesse-und-ressourcen.md` sagt in Zeile 7, auf welchem Rechner die Zahlen gemessen
wurden. Das ist keine Portabilitätssünde, sondern die Voraussetzung dafür, daß eine
Zahl überprüfbar ist. Ein pauschales „alle Pfade ersetzen" würde die Belege
**entwerten**. Auftrag ist nur, was **ausgeführt** wird.

Nachgeprüft, Datei für Datei, für alle ausführbaren Funde in **unseren** Paketen und
Skripten: die Treffer sind

* **erfundene Namen** in Prüfvorlagen (`/home/u1`, `erika`, `otto`, `jemand`) — berechtigt,
* das **Werkzeug selbst** und sein Test, die die Muster zwangsläufig zitieren,
* `scripts/install.mjs:254` `existsSync('/mnt/c/Users')` — **WSL-Erkennung**, muß so sein.

**Genau ein echter Fund in unserem Code:** `apps/cli/tests/flags.test.ts` benutzte den
**echten** Benutzernamen als Vorlage. Ersetzt durch `erika`.

> **Ehrlichkeitsvorbehalt.** Diese Änderung ist **nicht durch einen Lauf belegt**:
> `apps/cli/tests/flags.test.ts` lädt `../src/main.ts`, und das startet den Host, der
> auf diesem Rechner an `typert-loader` scheitert („*2 required plugins did not
> activate*"). Die Datei ist damit **gar nicht ausführbar** — auch in der Fassung aus
> `HEAD` nicht; ich habe beide Fassungen laufen lassen, beide **0 pass / 1 fail**. Da
> der Name nirgends im Code ausgewertet wird (in `apps/cli/src` steht er nur in
> Kommentaren), ist der Austausch verhaltensgleich — aber **geprüft ist er nicht**.
> Nur das Werkzeug selbst ist belegt: **8 pass, 0 fail**.

Der **echte** E4-Auftrag bleibt unverändert und ist der schlimmste Posten: die 5 Funde
in `docs/protokoll/aufsicht/hilfen/b1-nachziehen.mjs` stehen **im Code** und zeigen auf
`C:\Users\Chang\.dsh\settings.yaml` samt Sicherungskopien — also auf das Home des
**anderen** Harness. Das ist maschinengebunden **und** gehört der Aufsicht-Rolle; die
Umstellung braucht ihre Zustimmung.

**Und eine Zahl, die sich bewegt.** Zwischen zwei Läufen derselben Prüfung sah ich
357/100 und 336/103 — nicht wegen der Korrekturen, sondern weil am Baum **gleichzeitig
gearbeitet** wird (die Aufsicht legt Dateien unter `services/` an; eine davon,
`services/pmh-attach/README.md`, hat einen Treffer). Jede Zahl in diesem Dokument ist
deshalb eine **Momentaufnahme** und keine Eigenschaft des Projekts.
