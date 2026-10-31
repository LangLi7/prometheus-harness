# `sharp-safe` — libvips im Kindprozeß

> **Was es ist:** ein Tropfen-Ersatz für `sharp`, der die Bildarbeit in einen
> **dauerhaften Kindprozeß** verlegt. Der Wirt bekommt nur eine Kette aus JSON
> und eine Zusage; bricht libvips ab, stirbt der Helfer — nicht der Wirt.
>
> **Was es nicht ist:** eine Heilung. Die doppelte Handle-Schließung in
> libvips/GLib bleibt; sie trifft nur keinen Wirt mehr.

## Warum

`sharp` bringt in seinen Windows-Vorabfassungen **libvips 8.18.7 mit GLib
2.90.0 statisch** mit (`@img/sharp-win32-x64/versions.json`: `"glib": "2.90.0"`).
Beim Abbau eines Threads schließt GLib ein Win32-Handle ein zweites Mal:

```
GLib-ERROR **: file ../glib-2.90.0/glib/gthread-win32.c: line 420
(g_system_thread_free): error Das Handle ist ungültig.
during CloseHandle (wt->handle)
```

`win32_check_for_error` macht daraus ein `g_error` — und `g_error` beendet den
Prozeß. Läuft libvips **im Wirt**, endet der Wirt (gemessen: `exit 9`, vier
Sekunden nach einer Bild-Annahme).

## Wie

```
Wirt ── sharp(...).rotate().resize(...).jpeg(...).toBuffer()
        │  (JSON je Zeile)
        ▼
   worker.mjs  ── echte sharp-Fassung ── libvips/GLib
```

* `index.cjs` ist die Fassung, die der Verbraucher lädt. Sie zeichnet die Kette
  auf und schickt sie beim Abschluß (`toBuffer`, `metadata`, `toFile`) an den
  Helfer.
* `worker.mjs` lädt die **echte** `sharp`-Fassung (Pfad in `PMH_SHARP_REAL`) und
  führt die Kette aus. Ein Abbruch beendet nur ihn.
* Der Helfer ist **dauerhaft** (ein Start, viele Bilder) und wird beim Ende des
  Aufrufers mitgenommen; er hält den Aufrufer nicht am Leben.

## Einhängen

Nicht die gemeinsame `sharp`-Fassung wird ersetzt, sondern die **nahestehende
Auflösung** für genau den Verbraucher, der sie braucht:

```
node_modules/@deepseek-ai/dsh-attachment-local/node_modules/sharp
  -> packages/attachment/sharp-safe        (Junction)
```

Die Auflösung von `@deepseek-ai/dsh-attachment-local` beginnt in seinem eigenen
Verzeichnis und geht nach oben — dieser Eintrag gewinnt für **dieses** Paket.
Jedes andere Paket behält die echte Fassung. Das ist die Entsprechung zu einem
Nix-Override: derselbe Name, eine andere Ableitung, nur für einen Verbraucher.

```powershell
bun scripts/sharp-safe-install.mjs             # einhängen
bun scripts/sharp-safe-install.mjs --status    # zeigen
bun scripts/sharp-safe-install.mjs --entfernen # Rückweg
```

`scripts/start.mjs` ruft den Schritt bei jedem Start auf (idempotent). Er ist
**nicht** Teil der Unit-Generationen: der Kernprozeß liest heute keine
Generationen (`docs/status/generationen-nachweis.md`, „Offen bleibt: der Aufruf
durch den Core-Prozeß").

## Grenzen (gemessen)

| Grenze | Wert |
|---|---|
| Zusatzzeit je Bildkette (512 px, JPEG) | **+2,5 ms** (11,7 ms → 14,2 ms, 10 Läufe) |
| Erster Aufruf | ~70 ms (Helfer startet, lädt sharp) |
| Speicher | ein zusätzlicher Bun-Prozeß mit geladenem libvips |
| Absturz des Helfers | die eine Bild-Annahme scheitert (`INVALID_IMAGE`), der Wirt lebt; der nächste Aufruf startet einen neuen Helfer |
| Andere `sharp`-Verbraucher | unberührt — sie behalten die echte Fassung |

## Prüfungen

```powershell
bun test packages/attachment/sharp-safe/tests
```

Vier Prüfungen: `metadata`, die Kette des Anhang-Pfads (`rotate`, `srgb`,
`resize`, `jpeg`), `clone` (die Qualitätsleiter), und der **Absturz des
Helfers**: die Zusage wird abgelehnt, der Aufrufer lebt, der nächste Aufruf
arbeitet.
