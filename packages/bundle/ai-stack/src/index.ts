/**
 * `@prometheus-harness/ai-stack` — das **Bündel**, das die KI-Rangliste in den Host einträgt.
 *
 * ## Was ein Bündel ist
 *
 * Ein Bündel hat **keinen Laufzeitcode**. Seine Substanz ist `cordis.patch.yml`: eine Liste von
 * Einträgen, die der Profil-Zusammensetzer in den Host schreibt. Deshalb steht hier nur
 * `export {}` — dieselbe Form, die der Kern bei seinem eigenen Sprachbündel benutzt
 * (`dsh-experimental-voice-input-bundle/src/index.ts` besteht aus genau dieser Zeile).
 *
 * ## Was ein Bündel für die Plugin-Liste braucht
 *
 * Gemessen am Sprachbündel des Kerns — die fünf Angaben, ohne die es nicht erscheint:
 *
 * | Angabe | Wofür |
 * |---|---|
 * | `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` | **der Marker**; ohne ihn ist das Paket kein Bündel |
 * | `"icon": "./icon.svg"` | das Zeichen in der Liste |
 * | `locale/*.json` mit `meta.title` und `meta.description` | Titel und Satz in der Liste |
 * | `exports` mit `./cordis.patch.yml` und `./locale/*.json` | damit der Loader beides findet |
 * | `files` | damit beides mitgeliefert wird |
 *
 * **Der Satz in `locale/*.json` ist nicht schmückend.** Im Plugin-Fenster steht genau er — beim
 * Sprachbündel des Kerns: *„Transcribe recordings locally with SenseVoice; first use requires
 * installing dependencies."* Ein Bündel ohne ihn erscheint mit leerer Beschreibung.
 *
 * @module @prometheus-harness/ai-stack
 */

export {}
