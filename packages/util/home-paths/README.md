# `@prometheus-harness/home-paths` — Harness-Home auflösen

**Zweck.** Ein einziger Ort, der beantwortet: *wo* liegt die Installation dieses Harness auf
diesem Rechner? Alles andere (Sessions, Storages, Credentials, Profile, Cache) hängt daran.

## Die Kette

```
PMH_HOME  →  DSH_HOME  →  ~/.pmh
```

| Rang | Quelle | Verhalten |
|---|---|---|
| 1 | explizites `configured`-Argument | gewinnt, sobald es nicht `null`/`undefined` ist — auch als Leerstring |
| 2 | `$PMH_HOME` | nur wenn gesetzt **und** nicht leer/nicht nur Leerzeichen |
| 3 | `$DSH_HOME` | ebenso; hält eine bestehende DeepSeek-Harness-Installation auffindbar |
| 4 | `~/.pmh` (`join(homedir(), '.pmh')`) | Standard |

**Warum `DSH_HOME` in der Mitte steht.** Die Vorlage liest `DSH_HOME` und fällt sonst auf
`~/.dsh` zurück. Wer bereits eine Installation betreibt, hat diese Variable gesetzt oder
verlässt sich auf `~/.dsh`. Beides bleibt gültig: `DSH_HOME` wird weiterhin geehrt, nur
`PMH_HOME` hat Vorrang. Damit sind `~/.dsh` und `~/.pmh` **zwei getrennte Installationen**,
ohne dass ein Konsument angepasst werden muss (MAPPING.md §6.3 und §7).

Das Ergebnis läuft durch `expandHomePath` (Tilde) und danach durch `resolve`, ist also immer
ein absoluter, normalisierter Pfad. Ein relativer Wert wird gegen das aktuelle
Arbeitsverzeichnis aufgelöst. Kein XDG-Pfad, keine Plattformverzweigung — wie in der Vorlage.

## Ausgeführte Oberfläche

| Export | Signatur |
|---|---|
| `PMH_HOME_ENV` | `'PMH_HOME'` |
| `DSH_HOME_ENV` | `'DSH_HOME'` |
| `HOME_ENV_CHAIN` | `readonly ['PMH_HOME', 'DSH_HOME']` — die Kette in Prüfreihenfolge |
| `PMH_HOME_DIR_NAME` | `'.pmh'` |
| `DEFAULT_PMH_HOME_DISPLAY` | `'~/.pmh'` |
| `defaultPmhHome()` | `join(homedir(), '.pmh')` |
| `expandHomePath(p)` | `'~'` → Home; `'~/…'`/`'~\\…'` → angebaut; sonst unverändert |
| `resolvePmhHome(configured?, env?)` | die Kette; liefert den absoluten Pfad |
| `resolveHomeDetailed(configured?, env?)` | derselbe Pfad plus `origin` und `display` |
| `resolveAgentsHome(configured?, env?)` | zweiter Root der Vorlage: `$DSH_AGENTS_HOME` → `~/.agents` |
| `pmhHomePath(...segments)` | `join(resolvePmhHome(), ...segments)` |
| `pmhCachePath(optionsOrSegment?, ...segments)` | `<home>/cache/…`; erzeugt **keine** Verzeichnisse |
| `homeDisplay(path)` / `agentsHomeDisplay(path)` | Anzeigeform, **nie** ein absoluter Pfad |
| `canonicalizeWatchPath(path)` | `realpath` des tiefsten existierenden Vorfahren + fehlendes Suffix |
| Typen | `HomeEnvName`, `HomeEnv`, `ResolvedHome`, `PmhCachePathOptions` |

`resolveHomeDetailed(...).origin` ist der einzige Weg, die Herkunft (`PMH_HOME`, `DSH_HOME`,
`default`, `configured`) maschinell zu erfahren. `display` allein lässt `DSH_HOME` und
`PMH_HOME` absichtlich zusammenfallen, weil beide „von außen gesetzt" bedeuten.

## Noch nicht implementiert

- **Kein Projekt-Root-Marker.** Die Vorlage findet die Projektwurzel über `.git`; das gehört
  zu `packages/util/workspace-path` und ist hier nicht enthalten.
- **Keine Verzeichniserzeugung.** `resolve*` und `*Path` liefern Pfade; wer sie anlegen will,
  ruft selbst `mkdir`.
- **Kein `~/.pmh`-Migrationslauf.** Wenn sowohl `~/.dsh` als auch `~/.pmh` existieren, wird
  nichts zusammengeführt und nichts kopiert — `PMH_HOME` entscheidet, alles andere bleibt
  liegen.
- **Keine Windows-/POSIX-Verzweigung.** Es gibt keine Sonderfälle für Laufwerksbuchstaben
  jenseits dessen, was `node:path` ohnehin tut.

## Tests

```powershell
cd packages\util\home-paths
bun test          # 15 Prüfungen: jede Kettenstufe, blanke Werte, Tilde, Anzeigeformen
bun run typecheck # tsgo --noEmit
```
