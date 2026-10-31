---
description: "Video und Ton in der rechten Seitenleiste: ein Renderer im Dokumentvorschau-Platz, der MP4, WebM, MOV, MP3, WAV und Verwandte als Blob an <video>/<audio> gibt."
kind: "paketbeschreibung"
---

# `@prometheus-harness/client-media-preview`

## Wozu

Die rechte Seitenleiste zeigt Dateien in einem eigenen Tab. Der Kern bringt dafür
Renderer für Text, Markdown, Code, Bilder, PDF, HTML und Tabellen mit. **Video und
Ton fehlen** — ihre Endungen stehen in `unviewable.js` des Kerns als *bekannte
Binärformate ohne Renderer*, und die Vorschau zeigt dann:

> Für diesen Dateityp ist noch keine Vorschau verfügbar.

Dieses Paket schließt die Lücke, ohne den Kern zu verändern: es meldet einen
Renderer über `ctx.documentPreviews.register(...)` an und stellt seinen Körper
unter `sidebar.right.tab.document` — beides sind veröffentlichte Schnittstellen
des Kerns (`@deepseek-ai/dsh-client-ui-sidebar-documentpreview`).

## Was es annimmt

| Art | Endungen |
|---|---|
| Video | `mp4`, `m4v`, `mov`, `webm`, `ogv`, `mkv`, `avi`, `wmv`, `flv` |
| Ton | `mp3`, `wav`, `flac`, `ogg`, `oga`, `opus`, `m4a`, `aac`, `wma` |

Die Zuordnung liegt in `src/media.ts` und ist dort ohne Browser geprüft
(`tests/media.test.ts`).

## Wie die Datei zum Player kommt

Der Kern liest die Bytes (`loading: 'bytes-complete'`) und reicht sie als
`content.data` herein. Daraus entsteht ein Blob mit dem Medientyp der Endung und
daraus eine Objekt-URL für `<video>`/`<audio>` — derselbe Weg, den der
Bild-Renderer des Kerns für `<img>` geht. Die URL wird beim Abbau freigegeben.

## Grenzen — ehrlich benannt

* **32 MiB.** Der Host begrenzt den Lesevorgang (`maxFileBytes`, Vorgabe
  32 MiB). Eine größere Datei bekommt die Meldung „zu groß" des Kerns; ein
  abgeschnittener Player wäre schlimmer.
* **Der Codec entscheidet der Browser.** Ein `mkv` mit H.265 oder ein `wmv`
  wird angenommen und **nicht** abgespielt; das Panel sagt dann warum und
  verweist auf „Öffnen mit" im Kopf der Vorschau.
* **Kein Streaming.** Die ganze Datei liegt im Speicher der Seite, während sie
  offen ist. Für Vorschau-Längen ist das richtig; für einen Spielfilm nicht.

## Bauen und prüfen

```powershell
bun run build   # baut lib/client.js und prüft die Anmeldung
bun test        # prüft die Endungs-Zuordnung
```

Der Bau prüft **das gebaute Bündel**, nicht den Quelltext: welche Endungen
angemeldet sind, ob sie als binär gelten (sonst böte der Kern „Reiner Text" für
eine MP4 an), mit welchem Lademodus gearbeitet wird und ob der Körper unter
demselben Schlüssel steht wie die Anmeldung. Ohne die letzte Prüfung wäre der
Platz im Browser leer, ohne dass irgendwo ein Fehler auftaucht.

## Eingehängt wird es in `scripts/profile-patch.mjs`

Eine Zeile in `EIGENE_PAKETE`; das Skript schreibt daraus den Block im
Profil-Patch (`.pmh-build/harness-home/profiles/web/cordis.patch.yml`). Ein
**Neustart des Wirts** ist nötig, weil der Lader seinen Baum beim Start aufbaut.
