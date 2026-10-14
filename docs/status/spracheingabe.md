# Spracheingabe (STT) — übernommen aus der Vorlage, gemessen im eigenen Stapel

> **Stand:** 14.10.2026 · Anlaß: *„da fehlt noch diese voice stt oder tts implementierung"*.
> **Ergebnis: die Spracheingabe läuft** — echtes WAV, echtes Modell, Text über die
> Fernschnittstelle unseres Hosts. **TTS gibt es in der Vorlage nicht** (gemessen: fünf
> Sprachpakete, alle Eingabe); derselbe Motor könnte es (`OfflineTts` ist in
> `sherpa-onnx-node` exportiert).

## 1. Was die Vorlage hat — und was wir hatten

Die Vorlage (`C:\Users\Chang\harness\deepseek-harness`) hat **fünf** Pakete unter
`packages/experimental/` (102 Dateien, 388 KB, **nur Quelltext**):

| Paket | Rolle |
|---|---|
| `speech-to-text` | die Naht: `ctx.speechToText`, Anbieter nach Namen |
| `speech-to-text-sensevoice` | der lokale Anbieter: SenseVoice-ONNX + Silero-VAD in einem **Kindprozeß** |
| `api-speech-to-text` | die Browser-Schnittstelle (`@Remote`, Namensraum `speech`) |
| `client-ui-voice-input` | die Mikrofon-Oberfläche (Client-Hälfte) |
| `voice-input-bundle` | die Komposition: vier Zeilen in `cordis.patch.yml` |

**Wir hatten keines davon** (257 Kernpakete, kein einziges `speech`/`voice`).

## 2. Der Weg: **installieren statt nachbauen** — gemessen

Die Pakete sind **veröffentlicht**, und zwar in **unserer** Kernversion:

```
@deepseek-ai/dsh-experimental-voice-input-bundle  dist-tags: alpha = 0.2.1-alpha.3
unsere Kernpakete (z. B. dsh-client-locale)       dist-tags: alpha = 0.2.1-alpha.3
→ gewählt: 0.2.1-alpha.2 (genau die installierte Kernversion)
```

Was die Pakete **fertig mitbringen** (gemessen): `lib/index.js` je Paket, die erzeugten
Typert-Bausteine (`typert.host.js`, `typert.remote-client.js`) und die **gebaute
Browser-Hälfte** `client.js`. Damit entfällt der Typert-Generator — und ebenso ein eigener
Bündelbau für die Oberfläche.

**Zwei Schritte, beide ausgeführt:**

1. `bun add @deepseek-ai/dsh-experimental-voice-input-bundle@0.2.1-alpha.2` in **`apps/cli`**
   (dort stehen die Kernabhängigkeiten) → 10 Pakete, darunter `sherpa-onnx-node@1.13.8`
   (nativer Node-Anbindung, CJS, **ohne Typen**) und `sherpa-onnx-win-x64` (22,4 MB:
   `sherpa-onnx-c-api.dll`, `onnxruntime.dll`).
2. Im **Profil** (`.pmh-build/harness-home/profiles/web/`) das Bündel in `dependencies`
   **und** `dsh.profile.bundles` eingetragen, dann `pnpm install` (pnpm 12.11.2, wie das
   Profil es schon benutzte). Meldung: `+10 -12` — **nachgeprüft**: die beiden vorhandenen
   Subagent-Pakete sind unverändert da, `pnpm list` führt alle drei Abhängigkeiten; die
   `-12` waren umgehängte Doppelungen.

## 3. Die Modelle — sie lagen schon da, **byteweise** dieselben

`sherpa-onnx-node` bringt die Modelle **nicht** mit; das Bündel lädt sie beim ersten Gebrauch.
Sie lagen bereits in **beiden** Homes (`.pmh` und `.pmh-build/harness-home`), und die
Prüfsummenliste der Vorlage (`runtime/assets.json`) stimmt exakt:

| Datei | Manifest | vorhanden |
|---|---|---|
| `model.int8.onnx` | 239 233 841 B | 239 233 841 B ✓ |
| `tokens.txt` | 315 894 B | 315 894 B ✓ |
| `silero_vad.onnx` | 1 807 522 B | 1 807 522 B ✓ |

Der Katalog meldete daraufhin `preparation.phase: "ready"` mit allen fünf Schritten
(`check`, `model`, `vad`, `verify`, `load`) auf `complete`.

## 4. Was gemessen ist — die vier Stufen

| Stufe | Befund | Meßweg |
|---|---|---|
| **installiert** | 5 Sprachpakete + `sherpa-onnx-node` | `node_modules/@deepseek-ai` |
| **komponiert** | Mikrofon-Oberfläche **in der Startliste des Browsers** (68 Einträge, vorher 67) | `window.__DSH_BOOT__` **geparst** |
| **aktiv** | 4 Zeilen in der Plugin-Inventur, `enabled: true` (200 Einträge, vorher 191) | `POST /api/pluginInventory/list` |
| **wirkt** | **Transkript** eines echten WAV | `POST /api/speech/transcribe` |

**Die Transkription** (7,15 s englische Sprache, 16 kHz mono PCM16):

```json
{"text":"The tribal chieftain called for the boy and presented him with 50 pieces of code.",
 "audioSeconds":7.152,"inferenceSeconds":0.22115370000000006}
```

HTTP 200, **1,5 s** gesamt (einschließlich Modellstart), **0,22 s** Erkennung für 7,15 s
Audio — rund **32× Echtzeit** auf der CPU.

**Die Form des Aufrufs** war zuerst falsch, und der Wächter sagte es genau:
*„speech/transcribe: args fields do not match the descriptor: missing `request`; unexpected
`audioBase64`, `language`"*. Richtig ist `args = { request: { audioBase64, language } }`.

## 5. Der Fehler in der Oberfläche — und seine Ursache (eigener Fehler, berichtigt)

Der Betreiber sah im Plugin-Verwalter:

> *Fehler in den Paket-Metadaten: Plugin metadata for
> @deepseek-ai/dsh-experimental-voice-input-bundle: Error: **Plugin metadata requires the
> Node module resolver***

**Ursache.** `@deepseek-ai/dsh-app-boot` liest Paket-Ressourcen — allen voran das **Icon** —
über den **internen ESM-Lader von Node** (`ModuleLoader.fromInternal()` aus
`@deepseek-ai/cordis-plugin-loader`). Unter Bun schlägt
`requireInternal("internal/modules/esm/loader")` fehl, `fromInternal()` gibt `undefined`
zurück, und der Verbraucher **wirft**. Aufgefallen ist es erst jetzt, weil **unsere** Pakete
kein Icon haben — das Sprachbündel hat eins (`icon.svg`).

**Der erste Versuch war falsch.** Ich bestückte `ModuleLoader.fromInternal()` selbst mit einem
Ersatz-Auflöser (`{ version: "v2", resolveSync }`). Gemessen danach: **der Host startete nicht
mehr** — *„startup failed: 5 required plugins did not activate"*, **167 × „failed to import"**.
Mit abgeschalteter Ergänzung startete er; einzelne Importe der betroffenen Pakete gelangen
dagegen. Die Ursache: `fromInternal()` ist **nicht nur** für Metadaten da — der **Lader** des
Kerns benutzt ihn, um Plugin-Module aufzulösen. Solange er `undefined` liefert, nimmt der
Lader seinen **dokumentierten Ausweichweg**, und der funktioniert. *Einen Innenlader halb
nachzubauen ist schlimmer als keiner.*

**Die Berichtigung.** Ergänzt wird jetzt der **Verbraucher**, nicht der Lader:
`resolvePluginResource` in `dsh-app-boot` bekommt für den Fall „kein Innenlader" einen
**öffentlichen** Weg (`createRequire(...).resolve(...)`) statt eines Wurfs. Unter Node ändert
sich nichts; der Lader sieht weiterhin genau das, was er vorher sah.
`scripts/plugin-metadaten-aufloeser.mjs`, 7 Prüfungen grün (darunter: der eingehängte Auflöser
wird **wirklich ausgewertet** und löst ein echtes Paket auf).

**Nachweis, daß der Fehler weg ist:** `POST /api/pluginManager/listBundles` antwortet mit
`ok:true`, fünf Bündel — und `meta.icon` des Sprachbündels ist jetzt eine **Daten-URL mit dem
echten SVG**. Der Text *„Node module resolver"* kommt im Antworttext **nicht mehr** vor.

## 6. Was offen ist — mit Grund

1. **Die Profil-Verdrahtung ist noch Handarbeit** (Schritt 2 oben). Sie liegt in
   `.pmh-build/`, und das ist **nicht versioniert**: wer das Projekt klont, bekommt die
   Spracheingabe **nicht** von selbst. Das gehört in den Starter — wie die eigenen
   Paketzeilen in `scripts/profile-patch.mjs`.
2. **Die zweite Bun-Lücke ist NICHT geschlossen.** `dsh-app-boot` ruft
   `ModuleLoader.fromInternal()` an **zwei** Stellen; die zweite, in `collectConfigSchemas`,
   braucht den Innenlader **wirklich** (sie liest Konfigurations-Schemata über Modul-Aufträge)
   und wirft dort mit *„config schema dump requires the Node module loader used by profile
   resolution"*. Ein Teilersatz wäre derselbe Fehler wie in §5.
3. **Die Mikrofon-Oberfläche ist nicht im Browser erprobt.** Gemessen ist: sie steht in der
   Startliste, ihr Bündel wird ausgeliefert (HTTP 200), die vier Host-Zeilen sind aktiv. Ob
   das Mikrofon tatsächlich aufnimmt und den Text in den Entwurf schreibt, ist **nicht**
   gemessen — auf diesem Rechner war kein Chrome installiert
   (`chrome-devtools`: *„Could not find Google Chrome executable"*).
4. **Deutsche Texte für die Oberfläche fehlen.** Das Sprachbündel liefert `locale/en.json`
   und `locale/zh.json` — **kein** `de`. Unser Sprachpaket deckt 56 Kern-Namensräume; der
   Namensraum der Spracheingabe ist **nicht** dabei. Er wird englisch angezeigt, bis er
   übersetzt ist (nächster Schritt: `bun scripts/sprachquelle.mjs` findet ihn, weil er in
   `client.js` registriert wird).
5. **Kein Icon für die eigenen Pakete** — der Weg ist jetzt frei, aber wir haben keins.
