---
kind: upgrade-guide
description: "Subpath-Plugins lesen Anzeigetext und Icons nicht mehr aus einer exportierten <subpath>/package.json; sie verwenden Locale-Meta und <subpath>/icon."
---

# Subpath-Plugins lesen `<subpath>/icon` statt `<subpath>/package.json`

English | [中文](guide.zh.md)

## Änderung

In v0.2.0-rc.2 lasen Plugin Manager und Settings ein Subpath-Plugin wie `my-plugins/search` über `my-plugins/search/package.json`, wenn das Paket es exportierte: `name` und `description` füllten fehlende Locale-Felder, und `icon` lieferte das Zeilenbild. Ein Subpath ist kein Paket, daher liest das nächste Release dafür niemals eine `package.json`. Sein Titel und seine Beschreibung stammen nur aus `my-plugins/search/locale/*.json`, und sein Bild stammt aus der exportierten Ressource `my-plugins/search/icon`. Plugins an der Paketwurzel behalten ihren `package.json`-Text und `icon`; wenn `icon` fehlt, liefert ein exportiertes `./icon` das Bild. Autoren von Paketen, die Subpath-`package.json`-Dateien exportieren, sind betroffen.

## Migration

1. `name` und `description` des Subpath-Manifests nach `meta.title` und `meta.description` der Locale-Dateien des Subpaths verschieben und sie exportieren, zum Beispiel `"./search/locale/*.json": "./locale/search/*.json"`.
2. `icon` des Subpath-Manifests durch einen Icon-Export ersetzen und dessen Ziel veröffentlichen:

   ```json
   {
     "exports": { "./search/icon": "./assets/search.svg" },
     "files": ["assets/search.svg"]
   }
   ```

3. Den Export `./search/package.json` und dessen Datei entfernen.
4. `pnpm run verify-package-meta` in einem DSH-Checkout ausführen oder Plugin Manager öffnen und bestätigen, dass die Subpath-Zeile ihren Titel, ihre Beschreibung und ihr Bild zeigt.
