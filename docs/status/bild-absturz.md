# Der Bild-Absturz — Befund und Eindämmung (21.10.2026)

> **Anlaß** (Betreiber, 21.10.2026): *„ich gebe dir die aufgabe es zu fixen ohne das du den
> harness direkt neustartest nutze den nixos ansatz von pmh feature konzept"* — nach dem
> sechsten Absturz derselben Art (`GLib-ERROR … gthread-win32.c:420`, `exit 9`).
>
> **Ergebnis in einem Satz:** die Ursache liegt **nicht** im Harness, sondern in der
> `sharp`/libvips-Fassung, die der Anhang-Pfad in den Wirt lädt; die Bildarbeit läuft jetzt in
> einem **Kindprozeß**, der Wirt überlebt einen libvips-Abbruch — und der **laufende** Host
> wurde dafür **nicht** angefaßt.

## 1. Der Befund — was den Wirt tötet

| Glied | Beleg |
|---|---|
| Der Anhang-Pfad lädt `sharp` erst beim ersten Bild (`createLazyRequire("sharp", …)`) | `node_modules/@deepseek-ai/dsh-attachment-local/lib/index.js:118` |
| `sharp` lädt `@img/sharp-win32-x64/lib/libvips-42.dll` | sha256 `06DAB07C…813F`, unverändert |
| Diese DLL bringt **GLib 2.90.0** statisch mit | `@img/sharp-win32-x64/versions.json`: `"glib": "2.90.0"`, `"vips": "8.18.7"` |
| Die Absturzzeile ist GLibs eigene Prüfung | `glib/gthread-win32.c:420` = `win32_check_for_error (CloseHandle (wt->handle))`; `g_error` ist tödlich |
| **Bun ist nicht die Ursache** | `bun.exe` (1.4.0+34cbb9a40, 88 MB) enthält **kein** GLib: weder `gthread-win32.c` noch `g_system_thread_free` |

**Die Zeitkorrelation ist der schärfste Beleg.** Im Anhang-Speicher
(`.pmh-build/harness-home/attachments/v1/objects`) liegen die letzten Bilder mit Zeitstempel:

```
14:35:34   19.815 B
14:35:49    7.272 B     ← letzte Bild-Annahme
14:35:53                  ← Absturz
```

Vier Sekunden. Dieselbe Kette wie am 18.10. (18:50, 19:27, 19:30, 21:55) — und die frühere
Vermutung „Thread-Aufräumung von Bun" ist damit **widerlegt**: Bun hat kein GLib, die Zeile
kommt aus libvips.

**Kein Repro auf Zuruf.** 400 Ketten sequenziell und 1.200 gleichzeitig (8 parallel, 16 Bilder)
liefen in einem eigenen Bun-Prozeß ohne Abbruch durch. Es ist ein seltener Wettlauf beim
Thread-Abbau, kein deterministischer Fehler — deshalb ist auch eine Gegenmaßnahme nicht „einmal
gemessen" zu beweisen, sondern nur ihre **Wirkung im Fehlerfall**.

## 2. Warum es ohne Neustart keine Wirkung im laufenden Host geben kann

Der laufende Host hat das `sharp`-Modul bereits **im Speicher** (Bilder kamen an). Ein
Modultausch auf der Platte erreicht einen laufenden Bun-Prozeß nicht. Und der Live-Wechsel von
Plugins ist in diesem Start **abgeschaltet**: `apps/cli/src/main.ts:310` setzt
`HMR_DISABLE_PATCH = { id: 'hmr', disabled: true }`.

**Also ist die ehrliche Aussage:** die Eindämmung ist **scharf gestellt**, wirkt aber beim
**nächsten Start**. Der laufende Host wurde nicht angefaßt und nicht neu gestartet.

## 3. Was gebaut ist

| Teil | Datei | Aufgabe |
|---|---|---|
| Die Fassung | `packages/attachment/sharp-safe/index.cjs` | zeichnet die `sharp`-Kette auf, schickt sie als JSON an den Helfer |
| Der Helfer | `packages/attachment/sharp-safe/worker.mjs` | lädt die **echte** sharp-Fassung, führt die Kette aus; ein Abbruch endet hier |
| Das Einhängen | `scripts/sharp-safe-install.mjs` | legt eine **nahestehende** Auflösung nur für `dsh-attachment-local` an; `--entfernen` ist der Rückweg |
| Der Startschritt | `scripts/start.mjs` | ruft das Einhängen bei jedem Start auf (idempotent, fail-loud aber nicht blockierend) |
| Die Prüfungen | `packages/attachment/sharp-safe/tests/sharp-safe.test.ts` | 4 Prüfungen, darunter der Absturz des Helfers |

**Warum eine nahestehende Auflösung und nicht die gemeinsame `sharp`-Fassung.** Die Auflösung
beginnt im Verzeichnis des Verbrauchers; ein `sharp` unter
`node_modules/@deepseek-ai/dsh-attachment-local/node_modules/` gewinnt nur dort. Jedes andere
Paket behält die echte Fassung — derselbe Name, eine andere Ableitung, nur für einen
Verbraucher. Das ist die Entsprechung zu einem Nix-Override; der Rückweg ist das Entfernen der
Verknüpfung, nicht das Zurückschreiben einer Datei.

**Warum kein Unit-Eintrag.** Der Kernprozeß liest heute **keine** Generationen — der Aufruf
durch den Core-Prozeß fehlt ([generationen-nachweis.md](generationen-nachweis.md): *„Offen
bleibt: der Aufruf durch den Core-Prozeß"*). Ein Unit-Eintrag wäre eine Behauptung über eine
Wirkung, die es nicht gibt. Der Schritt steht deshalb dort, wo der Host wirklich startet.

## 4. Gemessen

```
bun scripts/sharp-safe-install.mjs --status
[sharp-safe] eingehaengt -> packages\attachment\sharp-safe

# die Auflösung des Verbrauchers:
createRequire('…/dsh-attachment-local/lib/index.js').resolve('sharp')
C:\Users\Chang\prometheus-harness\packages\attachment\sharp-safe\index.cjs

bun test packages/attachment/sharp-safe/tests
(pass) metadata kommt aus dem Helfer
(pass) die Kette des Anhang-Pfads: rotate, srgb, resize, jpeg
(pass) clone trennt die Qualitaetsstufen (wie encodingLadder)
(pass) ein Absturz des Helfers toetet den Aufrufer nicht
4 pass · 0 fail · 11 expect() calls · 244 ms
```

**Der Preis** (10 Ketten à 512 px JPEG, dieselbe Eingabe):

| Fassung | Zeit je Bild | Bytes |
|---|---|---|
| echte `sharp` | **11,7 ms** | 26.452 |
| `sharp-safe` | **14,2 ms** | 26.452 |

Gleiches Ergebnis, **+2,5 ms**. Der erste Aufruf kostet ~70 ms (Helfer startet und lädt
libvips).

## 5. Grenzen

| Grenze | Folge |
|---|---|
| Die doppelte Handle-Schließung bleibt | kein Fix, sondern Eindämmung; ein Upstream-Issue bei `lovell/sharp` hat jetzt Belege (Zeile, DLL-Hash, Zeitkorrelation) |
| Ein Abbruch des Helfers | **die eine** Bild-Annahme scheitert (der Anhang-Pfad meldet `INVALID_IMAGE`), danach arbeitet ein neuer Helfer |
| Andere `sharp`-Verbraucher | unberührt — sie behalten die echte Fassung und damit das Risiko |
| Der laufende Host | hat den alten Stand im Speicher; wirksam ab dem nächsten Start |
| Kein Live-Wechsel | `hmr` ist in diesem Start abgeschaltet (`HMR_DISABLE_PATCH`); ein Modultausch erreicht den Prozeß nicht |

## 6. Wie man es prüft und zurücknimmt

```powershell
bun scripts/sharp-safe-install.mjs --status
bun test packages/attachment/sharp-safe/tests
bun scripts/sharp-safe-install.mjs --entfernen     # Rückweg: die alte Lage, ohne Neustart
```

Der Rückweg ist ein Zeiger, kein Umbau: die gemeinsame `sharp`-Fassung wurde in beiden
Richtungen nie angefaßt.
