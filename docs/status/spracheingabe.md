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

## 7. Kontrastfehler im Auswahlfeld — behoben (Bild des Betreibers, 14.10.2026)

**Was zu sehen war.** Im Einstellungsdialog der Spracheingabe ist *Model download source*
geöffnet: die Seite dunkel, das Auswahlfenster **hell** — und der dritte Eintrag
*„HF-Mirror (China mirror)"* ist **weiß auf weiß**, praktisch unlesbar.

**Die Ursache steht in der CSS des Sprachpakets** (`VoiceInput.module.css`, gemessen):

```css
.preferences select, .sourceChoice select {
  background: transparent;   /* kein eigener Grund */
  color: inherit;            /* die Farbe der dunklen Seite */
}
```

Ein `<select>` ist ein **natives** Bedienelement: das **aufgeklappte** Fenster zeichnet der
Browser selbst, außerhalb des Kastenbaums der Seite. Bleibt `background` leer, malt der
Browser seinen Vorgabegrund (hell) und nimmt die **geerbte** Schriftfarbe (weiß) — genau die
Mischung aus dem Bild. Für den **geschlossenen** Kasten ist `transparent` richtig, für die
Einträge im aufgeklappten Fenster ist es ein Fehler.

**Die Behebung — ein eigenes Client-Plugin.** `packages/client/select-contrast/`
(`@prometheus-harness/client-select-contrast`) hängt **eine** Stilregel ein:

```css
select option,
select optgroup {
  background-color: var(--dsw-alias-bg-layer-2, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
}
```

**Warum aus Theme-Variablen und nicht mit festen Farben.** `--dsw-alias-*` löst **pro Theme**
auf — dunkel wird dunkel, hell wird hell; die Rückfallwerte `Canvas`/`CanvasText` sind die
Systemfarben der CSS-Farbskala und richten sich nach `color-scheme`. Eine feste Farbe wäre in
einem anderen Theme wieder falsch.

**Warum ein eigenes Paket.** Das Sprachpaket liefert **Texte**, dies ist **Darstellung**. Ein
Zusatz dort wäre bequem und würde beim nächsten Mal gesucht.

**Was gemessen ist** (Exit 0): das Plugin steht in der **Startliste des Browsers** (69
Einträge, vorher 68), sein Bündel wird ausgeliefert (**HTTP 200**, 2 981 Zeichen) und enthält
die Regel samt **beiden** Theme-Variablen. Die Bauprüfung führt das Bündel aus — mit einem
mitgeschriebenen `document` — und verlangt genau **ein** eingehängtes Stilelement, den
Selektor `select option` und mindestens eine `--dsw-`-Variable; vier Gegenproben werden rot
(kein `inject`, nichts eingehängt, feste Farben, falscher Selektor).

**Was NICHT gemessen ist.** Auf diesem Rechner ist **kein Browser** installiert — weder Chrome
noch Edge noch Firefox (`chrome-devtools`: *„Could not find Google Chrome executable"*). Daß
die Einträge **sichtbar** sind, ist damit **nicht** belegt; die Regel ist so gebaut, daß sie in
beiden Themes lesbar sein **muß**, aber das Urteil darüber gehört an den Bildschirm.

**Offen, und das ist eine Meldung an den Kern:** die eigentliche Korrektur gehört in
`client-ui-voice-input` selbst — dort sollte die Regel für `option`/`optgroup` stehen (oder das
Paket sollte `color-scheme` berücksichtigen). Unser Plugin ist die Brücke, bis das dort steht.

### 7a. Derselbe Fehler ein zweites Mal — mein erster Fix war unvollständig

Der Betreiber schickte einen **zweiten** Ausschnitt (`Recognition language`, dasselbe Feld wie
vorher): die Einträge weiterhin weiß auf weiß. Der erste Fix griff also nicht — und der Grund
ist ein **Mechanismus**, den ich nicht gemessen, sondern angenommen hatte:

> Chromium leitet das Farbpaar des **aufgeklappten** Fensters vom **`select`-Element** ab — nicht
> (nur) von den `option`-Elementen.

Steht dort `background: 0 0` — so stylt das Sprachpaket, und **genau so stylt auch der Kern
selbst** (`dsh-client-ui-cordis`: `.Nqubda_versionPicker select { background: 0 0 }`) — dann
malt der Browser seinen **hellen** Vorgabegrund und nimmt die **geerbte** Schriftfarbe der
dunklen Seite. Eine Regel für `option` allein erreicht diesen Weg nicht.

**Die Berichtigung.** Die Regel hat jetzt **zwei** Teile, weil es **zwei** Wege gibt:

```css
/* 1. Der Kasten selbst braucht einen undurchsichtigen Grund. */
[class*="sourceChoice"] select,
[class*="preferences"] select,
[class*="deviceField"] select {
  background-color: var(--dsw-alias-bg-l1, Canvas) !important;
}
/* 2. Die Einträge bekommen ihr eigenes Paar. */
select option, select optgroup {
  background-color: var(--dsw-alias-bg-layer-2, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
}
```

**Warum begrenzt und nicht global.** `[class*="sourceChoice"]` trifft die gehashten
CSS-Modul-Namen (gemessen: `ddpbLW_preferences select, ddpbLW_sourceChoice select`). Ein
globales `select { … }` würde **jeden** Auswahlkasten umfärben — auch die in Werkzeugleisten,
wo `transparent` Absicht ist — und auf diesem Rechner ist **kein Browser**, um das nachzusehen.
Der Kern-Fall (`ui-cordis`) steht deshalb als **offener Punkt** da, nicht als stiller Rest.

**Warum `!important`.** Die Paketregel `.ddpbLW_sourceChoice select` hat **gleiche** Spezifität
wie `[class*="sourceChoice"] select`; welche zuletzt kommt, hinge an der Ladereihenfolge.
`!important` macht das Ergebnis davon unabhängig — und nur darauf kommt es hier an. Es steht
**nur** auf `background-color`.

**Gemessen** (Exit 0): Startliste 69 Einträge; das ausgelieferte Kontrast-Bündel (HTTP 200,
3 152 Zeichen) enthält `sourceChoice`, `!important`, beide Theme-Variablen und die
Eintragsregel. **Nicht gemessen:** das Aussehen — kein Browser auf diesem Rechner.

## 8. Deutsch: Oberfläche **ja**, Erkennung **nein** — beides gemessen

**Die Oberfläche ist jetzt deutsch.** Das Sprachbündel der Vorlage liefert für sein Fach
`voice-input` **109 Texte** (nur `en` und `zh`). Sie sind übersetzt
(`docs/status/uebersetzung/teil-voice.json`), und das deutsche Paket führt damit
**57 Fächer mit 2483 Texten** — vorher 56 / 2374. Der Weg dahin war eine eigene Lücke im
Werkzeug: `sprachaufteilung.mjs` las nur die Teile aus `aufteilung.json` und hätte das neue
Fach als „fehlend" gemeldet; jetzt zählt jede `teil-*.json`, und der **Bericht** nennt, was in
den gelieferten Dateien **steht** (vorher rechnete er die Aufteilung neu und schrieb falsche
Fächergruppen neben die Dateinamen).

Gegenprobe an der **echten** Laufzeit (`sprachpaket-laufzeit-sonde.mjs`, Exit 0): **10 von 10**
Proben stimmen, darunter drei aus dem neuen Fach — `voice-input · language` →
*„Erkennungssprache"*, `sourceMirror` → *„HF-Mirror (Spiegel für China)"*, `preparation.ready`
→ *„Lokale Spracherkennung ist bereit."*

**Die Erkennung kann kein Deutsch — und sagt es.** Gemessen am lebenden Host:

```
language="en"  → ok, Transkript
language="de"  → {"ok":false,"error":{"code":"speech/transcription-failed",
                  "message":"Speech provider sensevoice-local does not support language: de"}}
language="auto" → ok, Transkript
```

Das Modell (SenseVoiceSmall) kennt **auto, zh, en, yue, ja, ko** — Deutsch ist nicht dabei. Der
Dienst **weist es ausdrücklich ab**, statt still Unsinn zu liefern. Wer deutsche Sprache
erkennen will, braucht einen **anderen Anbieter**: die Naht `ctx.speechToText` ist genau dafür
da (ein Anbieter nach Namen), und ein Whisper-Anbieter wäre der nächste Schritt. **Nicht**
gelöst durch: `auto` — das rät bei deutschen Aufnahmen.
