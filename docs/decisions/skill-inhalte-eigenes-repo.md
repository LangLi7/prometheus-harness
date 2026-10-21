# Entscheidung — Skill-Inhalte und Code-Units liegen getrennt

> **Status: ENTSCHIEDEN** · 21.10.2026 · Betreiber-Entscheidung
> **Gegenstand:** Wohin kommt die Implementierung — eigenes Repository, Package im Monorepo,
> oder beides? Und wie kommt ein fremder Skill in den Harness?
> **Bezug:** [`docs/bestand/fremd-repos.md`](../bestand/fremd-repos.md) §1 ·
> [`docs/bestand/goal.md`](../bestand/goal.md) Phase 1 ·
> [`docs/status/skill-uebertragung.md`](../status/skill-uebertragung.md) §5 und §6

---

## 1. Die Entscheidung in einem Absatz

**Skill-Inhalte und Code-Units bekommen getrennte Orte.** Eine **Skill** (Markdown mit
`SKILL.md`, Referenzen, Skripten, Bildern) ist **Inhalt**: sie liegt in einem **eigenen
Repository** unter `units/skills/` und wird als **vierte Skill-Wurzel** eingehängt. Eine
**Code-Unit** (Plugin, Bibliothek) ist **Code**: sie bleibt als Package im Monorepo, weil sie
Typecheck und Tests braucht. Der Grund ist nicht Geschmack, sondern die Prüfbarkeit: Code ohne
Typecheck ist unbelegt, Inhalt in der Code-Historie ist Ballast.

**Kurzformel:** *Inhalt hat eine Historie, Code hat einen Typecheck.*

---

## 2. Was das konkret bedeutet

| Was | Ort | Versionierung | Prüfung |
|---|---|---|---|
| **Skill-Inhalt** (z. B. `diagram-design`) | `units/skills/<name>/` | eigenes Git-Repo, eigener Commit, Quelle und Lizenz im Commit | `skill-filesystem` liest die Wurzel; Frontmatter wird geparst |
| **Code-Unit** (z. B. `pretext`-Anbindung, ein Plugin) | `packages/…` | Monorepo | `tsgo --noEmit`, `bun test` |
| **Kern** | `node_modules/@deepseek-ai/` | Abhängigkeit, gepinnt | keine eigenen Tests nötig |

**Die Ausnahme, die keine ist:** `pretext` ist eine **Bibliothek**, also Code — sie kommt als
Abhängigkeit in ein Package, nicht nach `units/skills/`. `diagram-design` ist ein **Skill** —
also Inhalt.

---

## 3. Warum getrennt

1. **Prüfbarkeit.** Ein Skill ist Text; ob er wirkt, misst man mit einem Eval (Lücke L6), nicht
   mit einem Typecheck. Code ist umgekehrt. Zwei Prüfarten, zwei Orte.
2. **Lizenz und Herkunft.** Ein übernommener Skill trägt eine fremde Lizenz (hier MIT) und einen
   Quellstand. Im eigenen Repo steht beides **im Commit**, und eine Aktualisierung ist ein
   sichtbarer Vorgang statt einer stillen Dateiänderung.
3. **Keine zweite Wahrheit.** `skill-uebertragung.md` §5 hat festgehalten, dass eine Kopie des
   Skill-Inhalts eine zweite Quelle wäre. Diese Entscheidung löst das nicht durch Kopieren,
   sondern durch **eine eigene Wurzel**: der Inhalt liegt **einmal**, an einem benannten Ort.
4. **Verteilbarkeit.** Eine Skill-Sammlung lässt sich als Ganzes weitergeben (Rezept statt
   Inhalt, `design/harness-generationen.md`); ein Monorepo-Paket nicht ohne seinen Bau.

---

## 4. Die verworfenen Alternativen

| Alternative | Warum verworfen |
|---|---|
| **Alles im Monorepo** (`packages/skill/diagram-design`) | Der Skill ist Inhalt, kein Code. Er würde den Typecheck mitlaufen, ohne dass es etwas zu typprüfen gibt — und ließe sich nicht einzeln weitergeben. |
| **Ein Repo für alles** (`pmh-units` mit Skills **und** Code) | Zwei Prüfarten in einem Bau: der Typecheck müsste lernen, Skill-Ordner zu überspringen, und die Skill-Wurzel wäre kein reines Verzeichnis mehr. |
| **Skill in den Benutzer-Scope kopieren** (`~/.agents/skills`) | Wirkt sofort, ist aber eine **zweite** Kopie neben dem Repo — genau die Doppelung, die L1 schon hat. |
| **Git-Submodul im Monorepo** | Bindet die Skill-Historie an die Code-Historie und an Submodul-Konventionen, die dieses Projekt bisher nicht nutzt. |

---

## 5. Folgen

- `units/skills/` ist ein **eigenes Git-Repository** und im Monorepo über `.gitignore`
  ausgenommen (Regel `/units/skills/`). Kein eingebettetes Repository ohne Versionierung.
- Die Wurzel liegt im Rang **300**: unter Projekt (100) und Laufzeit (250), über Benutzer (400)
  und Bündel (600). Bei Namensgleichheit gewinnt damit der nähere Scope — das ist die
  bestehende Regel der Registry, keine neue.
- **Herkunft ist Pflicht:** jeder Commit, der einen fremden Skill übernimmt, nennt Quelle,
  Stand und Lizenz. Die `LICENSE` liegt unverändert daneben.
- **Aktualisieren ist ein Vorgang, kein Überschreiben:** neuer Klon, Diff gegen den bisherigen
  Stand, Commit mit dem neuen Upstream-Hash.

---

## 6. Nachtrag 21.10.2026 — wirksam über eine Junction, nicht über die vierte Wurzel

**Der Skill ist geladen.** Gemessen: der Katalog dieser Sitzung führt `diagram-design`, und das
`skill`-Werkzeug liefert seinen vollständigen Rumpf samt Ressourcenpfad.

**Der Weg war ein anderer als geplant.** Statt `skill-plugin` in `EIGENE_PAKETE` einzutragen —
was einen Host-Neustart verlangt hätte — zeigt eine **Junction** im Benutzer-Scope auf den
Bestand im Repo:

```
~\.agents\skills\diagram-design   →   units\skills\diagram-design
```

Der Kern-Anbieter liest den Benutzer-Scope ohnehin (Rang 400). Die Junction ist eine
**Verbindung, keine Kopie**: der Inhalt liegt einmal, im eigenen Repo. Die Registry hat den
Katalog **ohne Neustart** neu gelesen.

**Was das für die Entscheidung bedeutet:** Die **vierte Wurzel (Rang 300)** bleibt die
Architektur — sie gibt dem Skill seinen eigenen Rang und hängt nicht am Benutzerprofil. Sie ist
aber **keine Voraussetzung mehr** für Wirksamkeit. Wer sie baut, misst weiterhin die vier Sätze
aus der ursprünglichen Fassung.

**Was weiterhin gilt:** Die Junction ist ein Angriffspunkt. Wer
`~\.agents\skills\diagram-design` löscht, trennt die Verbindung; der Bestand unter
`units/skills/` bleibt unberührt. Auf einem neuen Rechner muss die Junction **erneut** angelegt
werden — sie liegt außerhalb des Repos und ist deshalb nicht versioniert.
