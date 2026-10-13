# Der GitHub-Stand — was oben ist, was fehlt, und woran es liegt

> **Stand:** 13.10.2026 · **Anlaß:** Frage des Betreibers — *„ist das Nötigste schon
> gepusht, und ist Prometheus in GitHub so vorbereitet wie `deepseek-harness`?"*
>
> **Alle Zahlen sind gemessen**, in `C:\Users\Chang\prometheus-harness` und in der
> Vorlage `C:\Users\Chang\harness\deepseek-harness`.

---

## 1. Ist das Nötigste gepusht? **Ja — bis auf die Lizenz, und die fehlte**

| Messung | Befehl | Wert |
|---|---|---|
| Kopf lokal / auf origin | `git rev-parse HEAD` · `git rev-parse origin/main` | **gleich** (`e70d4ce`) |
| Commits auf origin/main | `git rev-list --count origin/main` | **138** |
| verfolgte Dateien | `git ls-files \| Measure-Object` | **1888** |
| offene Einträge | `git status --porcelain` | **29** — `services/` (22), `native/` (3), `bun.lock`, `LICENSE`, zwei unverfolgte Recherchedokumente |
| Sichtbarkeit | `GET api.github.com/repos/LangLi7/prometheus-harness` ohne Anmeldung | **404** → privat |

**Die 29 offenen Einträge gehören nicht diesem Strang** — sie sind die laufende Arbeit
des anderen Agenten (`services/pmh-*`, `native/flock`) plus zwei Recherchedokumente in
der Wurzel.

### Die Lücke: die Lizenz lag nur auf der Platte

```
git cat-file -e HEAD:LICENSE   →  fatal: path 'LICENSE' exists on disk, but not in 'HEAD'
git grep -l "Permission is hereby granted"  →  kein Treffer
```

Das Repository auf GitHub trug **keinen Lizenztext** — obwohl wir den DeepSeek Harness
als **Codebasis** benutzen und die MIT-Lizenz den Copyright- und Erlaubnishinweis in
allen Kopien verlangt. **Nachgeholt** (§3).

---

## 2. Ist es vorbereitet wie die Vorlage? **Nein — und der erste Vergleich war falsch**

Der erste Anlauf hat **Dateien auf der Platte** gezählt statt das, was **auf GitHub**
liegt. Korrekt gemessen (jeweils `git cat-file -e HEAD:<datei>`):

| | Vorlage | unser Repo |
|---|---|---|
| `.github/` (CI, Vorlagen, dependabot) | **23 Abläufe**, verfolgt | **56 Dateien auf der Platte — 0 im Commit** |
| `LICENSE` | verfolgt | **fehlte** → nachgeholt |
| `.gitattributes`, `.gitignore`, `README.md`, `tsconfig.base.json` | verfolgt | **verfolgt** |
| `.editorconfig`, `CONTRIBUTING.md`, `AGENTS.md`, `SAFETY.md`, `THIRD_PARTY_NOTICES.md` | vorhanden | fehlen |
| Wurzel-`tsconfig.json`, `pnpm-workspace.yaml`, `Makefile`, `vitest.config.ts`, `pytest.ini` | vorhanden | fehlen |
| Commits / verfolgte Dateien | 21 405 / 14 988 | 138 / 1 888 |
| Zweig | `master` | `main` |

### Warum die CI fehlt — es war eine Entscheidung, keine Nachlässigkeit

`.gitignore:69–76`:

> *„`.github/` ist eine **Kopie** des Referenz-Forks … Nach `docs/concept.md` („Der Core
> wird benutzt, nicht besessen") gehört fremder Inhalt nicht in unser Repository.
> Zusätzlich enthält die Kopie Python-Code und Workflows, die auf unsere Sprachen und
> unser Layout nicht passen. … **Eigene CI entsteht neu und dann ausdrücklich.**"*

**Und das ist sachlich richtig, gemessen:** von **23** Abläufen brauchen **17** `pnpm`,
dazu `pytest`, `Makefile`, `vitest` — unsere Grundlage ist **Bun 1.4 + tsgo**
(`bunfig.toml`: *„kein Bundler, kein Build-Schritt"*). Die Kopie wäre auf GitHub rot
gelaufen.

**Aber:** die Regel `.github/` in `.gitignore` verhindert auch **unsere eigene** CI. Wer
dort eine Datei anlegt, checkt sie nicht ein — eine Falle für den nächsten. Das ist
ein Punkt für den Umbau (Vorschlag in §4).

---

## 3. Was in diesem Schritt nachgeholt wurde: die Lizenz

`LICENSE` liegt jetzt **im Commit**. Warum das keine neue Aussage ist, sondern die
Erfüllung einer Pflicht — gemessen:

```
MIT-Rumpf (Zeilen 1–21) wörtlich identisch mit der Vorlage:  JA
Zeilen 22–51: eine Erläuterung UNTER einem Strich (---)
```

Die Ergänzung sagt selbst, was sie ist: *„Sie ist wörtlich übernommen und nicht
verändert; die Ergänzung unter dem Strich ist eine Erläuterung dieses Projekts, keine
Änderung der Lizenz."* Sie beantwortet vier Fragen (dürfen wir verändern? müssen wir
den Hinweis behalten? müssen wir Änderungen offenlegen? gilt sie für unseren Code?) —
und läßt die letzte ausdrücklich **offen**: *„Das ist eine offene Entscheidung des
Betreibers."* Genau so soll es sein.

**Und ein Fund, der dabeisteht:** die Lizenz nennt einen **maschinengebundenen Pfad**
(`C:\Users\Chang\harness\prometheus-harness`) als Herkunft. Für ein privates Repository
ist das eine brauchbare Angabe; vor einer Veröffentlichung gehört es zu **E4** („die
maschinengebundenen Hilfsskripte … entfernen oder konfigurierbar machen") — derselbe
Befund, eine Datei weiter oben im Baum.

---

## 4. Was noch fehlt — und was davon eine Entscheidung ist

| Was | Art | Vorschlag |
|---|---|---|
| **Eigene CI** | Bauarbeit | **Eine** Datei, ausdrücklich: `.github/workflows/pmh-ci.yml` mit Bun 1.4, `bun scripts/typecheck.mjs`, `bun test` — **ohne** Datenbank. Die DB-Prüfungen brauchen PostgreSQL mit pgvector als Dienst; das ist ein **eigener** Entwurf (`services: postgres` mit `pgvector/pgvector:pg17`), und er gehört erst, wenn die Suite nicht mehr flattert (`suite-flatterigkeit.md`) |
| **Die `.gitignore`-Falle** | Bauarbeit | `.github/` als **ganzen** Ordner zu ignorieren verhindert auch unsere Dateien. Nötig ist: `.github/*` ignorieren, aber `.github/workflows/pmh-ci.yml` **wieder erlauben** (verschachtelte Ausnahmen) |
| **`.editorconfig`, `CONTRIBUTING.md`, `AGENTS.md`, `SAFETY.md`** | **Entscheidung** | Vorschlag: **nicht** übernehmen. Das ist Upstream-Inhalt für den Upstream; unsere Regeln stehen in `AGENTS.md`-nähen Dokumenten unter `docs/`. Wer sie will, sagt es |
| **Eigene Lizenz für unseren Code** | **Entscheidung des Betreibers** | offen — steht so in der Lizenz selbst |
| **Die 22 festen Pfade** in `docs/protokoll/aufsicht/hilfen/` | E4 | vor einer Veröffentlichung entfernen oder konfigurierbar machen |

---

## 5. Nachfahren

```powershell
cd C:\Users\Chang\prometheus-harness

# Ist alles gepusht?
git rev-parse HEAD; git rev-parse origin/main; git rev-list --count origin/main

# Was ist offen — und wem gehört es?
git status --porcelain

# Liegt eine Datei WIRKLICH auf GitHub (in HEAD)?
git cat-file -e HEAD:LICENSE; $LASTEXITCODE      # 0 = ja

# Ist der Lizenztext im Repository?
git grep -l "Permission is hereby granted"

# Warum fehlt die CI?
git check-ignore -v .github/workflows/ci.yml
```
