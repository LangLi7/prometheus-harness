# Der Plugin-Vertrag — gemessen, mit Quellen

Stand: 15.10.2026. **Alle Zahlen und Zeilen sind gemessen**, nicht aus dem Gedächtnis.
Nichts in diesem Dokument ist umgesetzt worden, was nicht als umgesetzt benannt ist.

## 0. Wo die laufende Installation liegt — und wo NICHT

**Die Oberfläche auf `127.0.0.1:3080` wird aus `C:\Users\Chang\harness\deepseek-harness`
ausgeliefert** — nicht aus `C:\Users\Chang\deepseek-harness`, dem Pfad, den die
Aufgabenstellung nennt.

**Belegt durch drei Nullen, die Nullen über meinen Suchraum waren:**

| Suche in `C:\Users\Chang\deepseek-harness` | Ergebnis | Tatsächlich |
|---|---|---|
| `**/plugin-manager/package.json` | nichts | liegt in `…\harness\deepseek-harness\packages\boot\plugin-manager` |
| `registryCustomHint` | kein Treffer | liegt in `…\harness\…\packages\client\ui-plugin-manager\src\client\locales.ts` |
| `**/*plugin*/package.json` | 3 Pakete, keines der Manager | `ui-plugin-manager` liegt im anderen Klon |

**Die Lehre:** eine Null ist eine Auskunft über den **Suchraum**, nicht über den Gegenstand.
Wer sie als Abwesenheit liest, sucht dreimal am falschen Ort.

## 1. Der Einbauvertrag

| Quelle (im laufenden Klon) | Zeile | Was dort steht |
|---|---|---|
| `packages/boot/plugin-manager/README.md` | **40** | *„A bundle toggle changes `package.json`'s ordered **`dsh.profile.bundles`** list."* |
| dieselbe | **40** | *„A plugin toggle updates only `disabled` in the last matching override in the profile's `cordis.patch.yml` … Matching uses the **entry id and any module-name assertion**."* |
| dieselbe | **40** | *„Installation enables a new bundle by default."* |
| dieselbe | **31** | Installierter Host-Code läuft **im Prozeß** und **außerhalb** des Arbeitsbereich-Sandkastens; jede Werkzeugaktion verlangt `danger-full-access` oder eine Bestätigung |
| `packages/client/ui-plugin-manager/README.md` | **30** | *„A dependency **without a bundle patch is not a plugin** and is not listed…"* |
| dieselbe | **32** | Anzeigename aus exportierten Sprach-`meta`, sonst aus der `package.json` eines **Paket-Wurzel-Plugins**; *„subpath plugins never read one"*; Icon aus `icon` oder `./icon` |

### Die Form von `dsh.profile.bundles` — richtiggestellt

Sie steht im `package.json` des **Profils**, nicht des Plugins:

```json
~\.pmh\profiles\pmh\package.json
{ "name": "dsh-profile-pmh",
  "dsh": { "profile": { "bundles": [ "@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app" ] } } }
```

Zweite Fundstelle derselben Form: `~\.pmh\profiles\web\package.json`, Zeile 7.
**Ich hatte zuerst das Gegenteil behauptet** (im Paket) und es in
`harness\pmh-plugins\README.md` richtiggestellt — die falsche Aussage steht dort noch.

## 2. Was ein installierbares Plugin mitbringen muß

1. **Ein Bündel** — die Einheit, die eingetragen und ausgewählt wird.
2. **Einen Bündel-Patch** mit Einträgen aus **Id** und **Modulnamen-Zusicherung**; geschaltet
   wird nur `disabled`.
3. **Anzeigedaten** (`meta`/`icon`) — sonst steht der volle Paketname ohne Beschreibung.
4. **Erreichbarkeit** — ein `private: true`-Paket läßt sich weder aus einer Registry noch
   sauber aus einem Git-Repository holen.

## 3. Was steht

| Ort | Was | Beleg |
|---|---|---|
| `harness\pmh-plugins` (eigenes git-Repository) | Das Quellordner-Plugin als **öffentliches** Paket: `private` entfernt, Name ohne Scope, gebautes `lib/client.js` (**14127 B**), 47 Prüfungen | Commits `e1eab75`, `0068fb1`, `f525559`, `f04aa17`, `5b28109` |
| derselbe | Tests: **47 pass, 0 fail**, exit **0** — **ohne `node_modules`** | `bun test` im Paketordner |
| derselbe | Bau: **exit 1** — Ursache gemessen: das Skript ruft `bun` über den **Namen**, und das ist hier der kaputte npm-Shim. **Bauen ist Entwickler-Sache**; das gebaute Bündel liegt im Repository | Fehlerzeile in `source-folders/README.md` |

**Was im Arbeitsbereich blockiert bleibt:** `packages/client/source-folders` hat weiterhin
`private: true` und steht weiterhin **nicht** in `PAKETE`/`EIGENE_PAKETE` — genau diese zwei
Skripte (`client-buendel.mjs`, `profile-patch.mjs`) tragen **fremde, nicht festgeschriebene**
Arbeit. Seit Runde 116 unverändert.

## 4. Offen — mit Grund

| Offen | Grund |
|---|---|
| `repository` und `license` im öffentlichen Manifest | Die Git-Adresse und die Lizenzwahl sind Entscheidungen des Betreibers; ich erfinde sie nicht |
| Ein **Bündel-Patch** im öffentlichen Paket | Die Form ist bekannt (§1), gebaut ist er nicht — ein eigener Zug |
| Eintragung im Arbeitsbereich | Blockiert durch fremde Änderungen an zwei Skripten (§3) |
| Zwei Pfadkorrekturen von mir in `profile-patch.mjs`, `start.mjs` | Liegen im Arbeitsbaum, **nicht** im Commit — fremde Arbeit; gemeldet, nicht festgeschrieben |
| Ob der Manager über `dsh` + Bündel + `meta` hinaus etwas verlangt | **Nicht** gemessen — der Vertrag oben ist gelesen, die Laufzeitprobe fehlt |
