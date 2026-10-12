---
kind: upgrade-guide
description: "Subpath plugins no longer read display text and icons from an exported <subpath>/package.json, and use locale meta and <subpath>/icon instead."
---

# Subpath plugins read `<subpath>/icon` instead of `<subpath>/package.json`

[English](guide.md) | 中文

## Change

In v0.2.0-rc.2, the plugin management page and settings page read a subpath plugin such as `my-plugins/search` through `my-plugins/search/package.json` when the package exports it: `name` and `description` fill in missing locale fields, and `icon` supplies the row image. A subpath is not a package, so the next release reads no `package.json` for it. Its title and description come only from `my-plugins/search/locale/*.json`, and its image comes from the exported `my-plugins/search/icon` asset. Package-root plugins keep the `package.json` text and `icon`; when `icon` is omitted, the exported `./icon` supplies the image. Package authors who export a subpath `package.json` are affected.

## Migration

1. Move the subpath manifest's `name` and `description` to `meta.title` and `meta.description` in the subpath locale files, and export those files, for example `"./search/locale/*.json": "./locale/search/*.json"`.
2. Replace the subpath manifest's `icon` with an icon export, and publish its target file:

   ```json
   {
     "exports": { "./search/icon": "./assets/search.svg" },
     "files": ["assets/search.svg"]
   }
   ```

3. Delete the `./search/package.json` export and its file.
4. Run `pnpm run verify-package-meta` in the DSH repository, or open the plugin management page, and confirm the subpath row shows a title, description, and image.
