# Die Skill-Familie ist übertragen — vier Pakete, gemessen

Stand: **21.10.2026.** Dieses Blatt hält fest, was aus der Skill-Implementierung des DeepSeek
Harness nach Prometheus übertragen ist, **woher** jede Regel stammt und **was nicht**
übertragen wurde. Jede Zahl ist an einer Datei oder einem Befehl gemessen; wo eine Messung
fehlt, steht das unter „Grenzen" und nicht im Befund.

## 0. Der Auftrag in einem Satz

Der Betreiber: *„kannst du alle skill und Plugin implementierung vorallem skill von DSH in
Prometheus transferieren implementieren?"* — Die vier Verzeichnisse unter `packages/skill/`
waren **leer** (gemessen: `Get-ChildItem -Recurse` liefert fünf Verzeichnisse, **0 Dateien**),
während die Vorlage dort **vier Pakete** mit **~2.300 Zeilen Quelle** und **~3.350 Zeilen
Prüfungen** hat. Übertragen ist jetzt die **Implementierung**, nicht der Skill-Inhalt: die
Fähigkeitsdateien selbst bleiben dort, wo sie liegen (`.agents/skills`, `<home>/skills`).

## 1. Was gebaut ist

| Paket | Zeilen Quelle | Zeilen Prüfungen | Rolle |
|---|---:|---:|---|
| `packages/skill/skill` | **815** | **415** | die geschichtete Registry: Anbieter, Ränge, Scope-Schichten, Katalog-Cache, Laden |
| `packages/skill/skill-filesystem` | **788** (425 + 182 + 181) | **334** | der lokale Anbieter: Wurzeln, Frontmatter, Git-Wurzel, Beobachtung |
| `packages/skill/tool-skill` | **266** | **155** | das Modell-Werkzeug `skill`, Katalogtext, Ersatzkatalog, Digest, `/name`-Gesten |
| `packages/skill/skill-plugin` | **181** | **147** | die Brücke in den laufenden Host: meldet den Anbieter an `ctx.skills` an |

**Zusammen: 2.050 Zeilen Quelle und 1.051 Zeilen Prüfungen in vier Paketen.** Alle vier sind
gewöhnliche Prometheus-Pakete: `private: true`, `exports` auf `src/index.ts`, Typecheck mit
`tsgo`, Prüfungen mit `bun test` — dasselbe Muster wie `crew/plan` und `usage/usage-budget`.

### 1.1 „Plugin" — was schon stand und was neu ist

Der Auftrag nennt Skill **und** Plugin. Beim Plugin ist die Lage eine andere: die
Plugin-Infrastruktur ist im Projekt bereits vorhanden und **nicht** durch einen Nachbau zu
ersetzen. Die Zuordnung, damit nichts doppelt gebaut wird:

| Baustein | Wo er heute steht | Übertragen? |
|---|---|---|
| Cordis-Plugin-System (`ctx.*`, `inject`, `apply`, Wasserfälle) | Abhängigkeit `@deepseek-ai/cordis` 4.0.5, gepinnt; `MAPPING.md` §3.1/§7 entscheidet **gegen** einen Nachbau | **nein** — bewußt |
| Profil-Komposition, Bündel, Patch-Schichten | `apps/cli/src/main.ts`, `scripts/profile-patch.mjs`, `packages/bundle/*` | steht |
| Eigener Plugin-Host (Vorbereiten, Whitelist, native Addons abweisen, Abstecken) | `packages/units/unit-export/src/plugin-host.ts`; Nachweis `docs/status/plugin-export-nachweis.md` | steht |
| Client-Plugins | `packages/plugin/graphify`, `packages/plugin/obsidian` | stehen |
| **Skill-Anbieter im Host** | **neu: `packages/skill/skill-plugin`** | **übertragen** |

Das neue Plugin ist die einzige Plugin-Implementierung, die für die Skill-Familie nötig war:
es meldet den Prometheus-Anbieter an `ctx.skills` an und wieder ab. Es ersetzt **keinen**
Kern-Dienst — genau die doppelte Semantik, die das Projekt vermeidet.

## 2. Was aus der Vorlage übernommen ist — mit Quelle

| Regel | Vorlage | Bei uns |
|---|---|---|
| Kebab-Case-Grammatik `^[a-z0-9]+(?:-[a-z0-9]+)*$` | `packages/skill/skill/src/index.ts` | `isSkillName`, dieselbe Regex |
| Zwei **unabhängige** Aufruf-Schalter (`disable-model-invocation`, `user-invocable`) | `skill-filesystem/src/index.ts` | `parseInvocationPolicy`; fehlende Felder erlauben beide Wege |
| Alte Schlüssel (`disableModelInvocation`, `modelInvocable`) werden **abgelehnt** | dito | `rejectLegacyKey` — sie sehen richtig aus und wirken nicht |
| Rangordnung 100/200/300/400/500/600 | `skill-filesystem/src/index.ts` | `PROJECT_DSH_RANK` … `BUNDLED_SKILL_RANK` |
| Projektwurzel = nächster Vorfahre mit `.git`, sonst cwd | dito | `findProjectRoot` |
| Bündel `<name>/SKILL.md` und flache Datei `<name>.md`; **kein** rekursives Suchen | dito | `#locatorFor` mit `readdir` über direkte Kinder |
| `.system` unter der Benutzer-Wurzel wird übersprungen | dito | `skipSystem` |
| Der Katalog zeigt nur `name` und gekürzte `description`; Rumpf erst beim Laden | `tool-skill/src/index.ts` | `katalogEintraege` / `katalogText` / `skillWerkzeug` |
| Beschreibung normalisieren, auf 500 kürzen (mindestens 3) | dito | `beschreibungKuerzen`, `DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH` |
| Ersatzkatalog sagt ausdrücklich, daß er ersetzt — auch leer | dito | `katalogErsetzung` |
| Digest über die **Einträge**, nicht über den gerenderten Text | dito | `katalogDigest` (JSON-Paar je Eintrag, SHA-256) |
| `<skill_content>` mit entschärftem Namensattribut und Ressourcenhinweis | `skill/src/index.ts` | `renderSkillContent` |
| `/name`-Geste nur an Weißraumgrenzen; Pfade und Brüche fallen heraus | `tool-skill/src/index.ts` | `aufgerufeneSkills` |
| Unvollständige Beobachtung wird **nicht** gecacht | `skill/src/index.ts` | `collect` + `cacheable` |
| Anbieterfehler werden enthalten, nicht durchgereicht | dito | `#listLayerCandidates` mit Protokoll |
| Näherer Scope verdeckt gleichen Namen; Rang entscheidet nur **innerhalb** einer Schicht | dito | `#collectFresh` + `#collectLayer` |
| Laufzeit-Fähigkeit: erster gewinnt, zweiter wird gemeldet | dito | `register` |
| Ein Rumpf mit fremdem Namen wird verworfen und der Katalog neu gelesen | dito | `get` → `#invalidateEntry` |

## 3. Die vier bewußten Abweichungen — mit Grund

1. **Die Registry ist kein Cordis-Dienst.** Die Vorlage hängt `SkillRegistry extends Service`
   an `ctx.skills`. Bei uns ist sie ein gewöhnliches Objekt: der Scope wird **übergeben**,
   nicht aus einem aufrufenden Kontext gelesen. Grund: die Regeln sollen **ohne laufenden
   Host** prüfbar bleiben — genau wie `crew/plan` und `usage/usage-budget`. Die Brücke zum
   Host ist ein eigenes Paket (`skill-plugin`), das einen **Anbieter** anmeldet, statt den
   Dienst zu ersetzen.
2. **Keine Chokidar-Abhängigkeit.** Die Vorlage beobachtet mit Chokidar inklusive
   Stabilitätsschwelle, Polling und kanonischer Symlink-Pfade. Unser `watch.ts` benutzt
   `node:fs.watch` auf der Wurzel oder ihrem nächsten vorhandenen Vorfahren. Das reicht für
   **direkte** Kinder; es gibt **keine** Stabilitätsschwelle und **keine** kanonischen
   Symlink-Pfade. Die Grenze steht in §5.
3. **Kein `ctx.fs`.** Die Vorlage liest über den Dateidienst des Hosts, damit die Sandbox
   gilt. Wir lesen über `node:fs`. Damit ist der Anbieter ohne Cordis prüfbar; wer ihn in
   einem gesperrten Arbeitsbereich einsetzt, muß die Wurzeln entsprechend wählen. Diese
   Grenze ist bewußt und benannt, nicht übersehen.
4. **Kein Step-Hook, keine Sitzungsereignisse.** Die Vorlage schreibt Katalog-Nachrichten
   (`source.kind === 'skill-catalog'`) und hängt sich in `agent/pre-step`. Prometheus'
   `AgentLoop` kennt keine Vor-Step-Einfügung; der Katalog wird als **Text** geliefert, den
   der Aufrufer in seine Systemanweisung setzt, und `katalogDigest` sagt ihm, wann ein
   Ersatz fällig ist. Eine zweite Wahrheit über den Sitzungsverlauf entsteht so nicht.

## 4. Prüfung — die Befehle und ihre Ausgabe

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test `
    packages\skill\skill\tests\skill.test.ts `
    packages\skill\skill-filesystem\tests\filesystem.test.ts `
    packages\skill\tool-skill\tests\tool-skill.test.ts `
    packages\skill\skill-plugin\tests\plugin.test.ts
# 69 pass · 0 fail · 186 expect() · 4 Dateien · exit 0
```

| Paket | Typprüfung (`tsgo --noEmit -p …`) |
|---|---|
| `skill` | **exit 0** |
| `skill-filesystem` | **exit 0** |
| `tool-skill` | **exit 0** |
| `skill-plugin` | **exit 0** |

**Die Sperrdatei ist nachgezogen.** `bun install --lockfile-only --offline` meldete
`Saved bun.lock (696 packages)`; die vier Arbeitsbereiche stehen jetzt in `bun.lock`
(`packages/skill/skill` … `packages/skill/skill-plugin`). Der volle Offline-Lauf
(`bun install --offline`) endete mit **exit 0** (`1 package installed`) und hat die
Verknüpfungen unter `node_modules/@prometheus-harness/` angelegt.

**Was die Prüfungen festnageln** (Auszug, nicht die ganze Liste):

- Rang schlägt Anbieter-Reihenfolge; gleicher Rang: der zuerst registrierte Anbieter gewinnt.
- Projekt-Eintrag (100) schlägt Laufzeit (250), Laufzeit schlägt Benutzer (400).
- Der nächste Scope verdeckt denselben Namen; ein fremder Scope sieht nichts; eine Kette
  verdeckt von der Wurzel bis zum nächsten Scope.
- Unvollständige Beobachtung wird zweimal gelesen und erst nach `complete` gecacht.
- Ein werfender Anbieter wird übersprungen, der Katalog bleibt unvollständig, andere
  Anbieter bleiben sichtbar.
- `get` bricht bei Abbruch ab, verwirft einen Rumpf mit fremdem Namen und lädt danach neu.
- Frontmatter: Pflichtfelder, Kebab-Case, alte Schlüssel, `yes/on/1`, `metadata` nur als
  Objekt, kaputtes YAML wird gemeldet und übersprungen.
- Entdeckung: Bündel und flache Datei, Projektwurzel über `.git`, `.system` übersprungen,
  verschachtelte `SKILL.md` **nicht** gefunden, Schreibbeobachtung innerhalb/außerhalb.
- Katalog: Filter auf Modell-Freigabe, Sortierung, Entschärfung, Kürzung, Digest-Stabilität,
  Ersatzkatalog auch leer, `/name`-Gesten.
- Host-Brücke: genau **ein** Anbieter, Name `pmh-filesystem`, Abmelden nimmt ihn zurück und
  bricht die Steuerung ab; fehlendes Home hängt trotzdem an (leerer Katalog); der Rumpf kommt
  aus der Datei, nicht aus dem Katalog.

## 5. Grenzen — was **nicht** übertragen ist, und warum

| Nicht übertragen | Grund |
|---|---|
| **Der Skill-Inhalt** (die 21 Fähigkeiten dieser Sitzung, `.agents/skills/*`) | Der Auftrag nennt die **Implementierung**. Die Dateien bleiben, wo sie liegen; der lokale Anbieter liest sie über `.agents/skills` bereits. Eine Kopie wäre eine zweite Quelle der Wahrheit. |
| **`ctx.fs`-Nutzung und damit die Sandbox des Hosts** | Ohne Cordis-Dienst gibt es keinen Dateidienst. Die Wurzeln sind der Ersatz; die Grenze steht in §3.3. |
| **Chokidar-Verhalten** (Stabilitätsschwelle, Polling, kanonische Symlink-Pfade, LRU je Projekt) | `node:fs.watch` genügt für direkte Kinder. Was fehlt: Entprellung bei Schreibvorgängen in mehreren Schritten und das Nachrücken kanonischer Pfade. |
| **Sitzungs-Katalog als Ereignis** (`skill-catalog`, Ersatz-Digest über sichtbare Knoten) | Der eigene `AgentLoop` kennt keine Vor-Step-Einfügung; der Katalog ist Text plus Digest. |
| **`skill-invocation`-Quelle und Benutzer-Injektion** | Dieselbe Grenze: keine Nachrichtenquelle im eigenen Seam. `aufgerufeneSkills` liefert die Namen, die Injektion entscheidet der Aufrufer. |
| **`skill-office`, `skill-badge`, `tool-workspace-dependencies`** | In der Vorlage eigene Anbieter bzw. Werkzeuge. Sie sind **nicht** gebaut; die vier gebauten Pakete sind die tragende Kette (Registry → Dateien → Werkzeug → Host). |
| **Der Eintrag im laufenden Host** | `skill-plugin` ist gebaut und geprüft, steht aber **nicht** in `scripts/profile-patch.mjs` (`EIGENE_PAKETE`). Ein Eintrag ohne Messung am laufenden Host wäre ein Versprechen; die Zeile ist vorbereitet, nicht gesetzt. |

## 6. Der Einbaupunkt, wenn der Betreiber ihn will

Die Brücke ist ein Cordis-Plugin mit `inject = ['skills']`. Der Eintrag gehört in
`scripts/profile-patch.mjs` in `EIGENE_PAKETE` (dieselbe Stelle wie `crew-plugin`), und die
Konfiguration kann leer bleiben: dann liest sie `<PMH_HOME>/skills`. Wer die DSH-Wurzeln
zusätzlich will, setzt `includeDefaultRoots: true` — dann entscheidet der Rang, und der
Anbieter des Kerns gewinnt Gleichstände.

**Vor dem Setzen zu messen:** ob der Kern den Anbieter annimmt (er ruft `registerProvider`
mit seiner Steuerung), ob die Fähigkeiten im Katalog der Web-Oberfläche erscheinen und ob
eine geänderte Datei ohne Neustart sichtbar wird. Diese drei Sätze sind die Abnahme; ohne sie
bleibt die Zeile weg.

## 7. Was dieses Blatt **nicht** belegt

- Es belegt **nicht**, daß der Anbieter im laufenden Host funktioniert — nur, daß er gegen
  einen nachgebauten Kontext die Form des Kern-Vertrags erfüllt (der Typecheck erzwingt die
  Zuweisung an `SkillProvider` aus `@deepseek-ai/dsh-skill` 0.2.1-alpha.2).
- Es belegt **nicht**, daß die 21 Fähigkeiten dieser Sitzung über den neuen Weg geladen
  werden; sie kommen weiterhin über den Anbieter des Kerns.
- Es belegt **nicht**, daß die Beobachtung unter allen Plattformen gleich reagiert; geprüft
  ist `fs.watch` auf diesem Windows-Wirt mit einer angelegten Datei.
