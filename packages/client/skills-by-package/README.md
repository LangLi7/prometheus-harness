# @prometheus-harness/client-skills-by-package

Fähigkeitensuche nach Sammlung — im `/`-Menü **und** als Popup.

## Das Problem

Der Katalog kennt 307 Fähigkeiten, und die eingebaute Quelle (`dsh-client-ui-skill`) listet sie
flach. Ihr Rangierer ist `rankByName`: er vergleicht eine Zeichenfolge mit dem **Namen** der
Fähigkeit. Ein `/emilkowalski` findet deshalb nichts, obwohl vier Fähigkeiten aus genau diesem
Repository stammen — die Sammlung steht in keinem Feld, das die Palette liest.

## Zwei Zugänge

### 1. Die Quelle am `/`

Sie meldet sich als **zweite** Quelle an; die eingebaute bleibt unangetastet, es gibt keine
Namenskollision und keinen doppelten Eintrag: diese Quelle antwortet nur, wenn die Eingabe eine
Sammlung trifft.

| Eingabe | Anzeige |
|---|---|
| `/` (leer) | die Sammlungen, größte zuerst, je mit Anzahl; `drill` klappt eine auf |
| `/emilkowalski`, `/ui-motion-picks`, `/transitions-dev` | die Fähigkeiten dieser Sammlung, gruppiert über `section` |
| `/motion` | beide Motion-Sammlungen, in zwei Abschnitten |
| `/zzz` | nichts — die eingebaute Quelle bleibt allein zuständig |

Ein Pick schreibt wie bei der eingebauten Quelle `/name` in den Entwurf. Das Einfügen macht die
Trigger-Pipeline, nicht dieses Plugin.

### 2. Das Popup `/skills`

Muster von `/model`: `/skills` öffnet ein Panel mit Suchfeld („Fähigkeiten suchen…"), alle
Fähigkeiten als Zeilen, **gruppiert nach Sammlung** mit klebenden Überschriften. `searchMode` ist
`substring`, geprüft werden also Beschriftung **und** Detailtext — der Fall „ich weiß ungefähr,
was ich suche". Ein Pick schreibt `/<name>` in den Entwurf und gibt den Fokus zurück.

**Warum `setDraft` und nicht `insertText`.** `PopupSelectSpec.onSelect` bekommt nur `{ sessionId }`,
keinen `TokenSpan`; `slash/input-insert-text` verlangt aber genau den. Der Ausweg ist
`SessionInput.setDraft` am Sitzungs-Kontext: `ctx.conversation.input.for(SessionBinding.ctx)`.
Ersetzt wird nur das führende Befehlswort — ein bereits getippter Anhang (`/skills baue mir …`)
bleibt stehen.

**Absenden bleibt beim Menschen.** Eine Fähigkeit braucht meist noch eine Aufgabe; ein
automatisches `input.submit()` wäre eine Zeile mehr, ist aber absichtlich nicht eingebaut.

## Woher die Zuordnung kommt

Nicht aus einem Pfad-Rateschluss, sondern aus dem Register, das beim Verknüpfen entsteht:
[`units/skills/index.json`](../../../units/skills/index.json), geschrieben von
[`link-skills.ps1`](../../../units/skills/link-skills.ps1). Es enthält je Fähigkeit `name`,
`source` und `path`, je Sammlung zusätzlich `aliases` — die Namen, unter denen man sie sucht
(`emilkowalski` für `ui-motion-picks`, `latent-spaces` für `brag`, `ibelick` für `ui-skills`).

`build.mjs` gießt daraus `src/register.ts`. Eine neue Sammlung braucht also zwei Läufe:
`link-skills.ps1` (Register) und `bun run build` (Bündel) — dazwischen liegt keine Heuristik.

## Bauen und prüfen

```powershell
bun run packages/client/skills-by-package/build.mjs            # Register gießen, bauen, prüfen
bun run packages/client/skills-by-package/build.mjs --pruefen  # nur die vorhandene Datei prüfen
```

Das Bündel wird **ausgeführt**, nicht betrachtet: der Umschlag wird mit einem mitgeschriebenen
`window` ausgewertet, die Fabrik mit einem echten `require` aufgerufen, `apply` an einem
mitschreibenden `ctx` gestartet und Quelle wie Popup danach befragt.

Geprüft wird:

1. Kennung, `name`, alle Dienste in `inject`, `apply` ist eine Funktion
2. genau **eine** Registrierung, `trigger: '/'`, `order: 1` (vor der eingebauten Liste)
3. leere Eingabe → alle Sammlungen, jede mit `drill`, keine mit `section`
4. `/emilkowalski` → **genau** die Fähigkeiten aus `ui-motion-picks`, jede mit
   `section: "ui-motion-picks"`, nicht modell-aufrufbare als „nur menschlich" markiert
5. `/motion` → beide Motion-Abschnitte
6. unbekannte Eingabe → keine Zeilen
7. Katalogfehler → keine Zeilen, kein Wurf, aber eine Meldung
8. Popup `/skills` → `kind: 'popupSelect'`, `searchMode: 'substring'`, deutsche Suchtexte
9. Optionen → alle Fähigkeiten, keine doppelte Kennung, jede mit Sammlungsgruppe, größte
   Sammlung zuerst, keine unbekannte Sammlung
10. Pick → `setDraft('/animate')` plus `focus`; mit Anhang (`/skills baue mir …`) bleibt der
    Anhang stehen; ohne eingehängte Sitzung wird **nichts** geschrieben
11. Startliste → jeder verlangte Dienst hat sein Paket in `dsh.client.inject`

**Was die Prüfung nicht beweist:** wie es im Browser aussieht. Hier ist kein Browser gestartet,
und der Host liefert gebaute Bündel — ein laufender Server sieht dieses Plugin erst nach einem
Neustart.

## Grenzen

- Die Sammlung kommt aus dem Register, nicht aus dem Host. Eine Fähigkeit, die über einen
  anderen Weg installiert wurde (etwa über den Plugin-Manager), steht in keiner Sammlung und
  erscheint nur in der eingebauten Liste.
- Das Register wird beim Verknüpfen geschrieben. Wer eine Fähigkeit von Hand in
  `~/.agents/skills` ablegt, taucht dort nicht auf, bis `link-skills.ps1` erneut läuft.
- Der Katalog wird je Sitzung zwischengespeichert, wie in der eingebauten Quelle; ein Wechsel
  des Agenten-Presets leert diesen Zwischenspeicher hier **nicht** (die eingebaute Quelle
  lauscht auf `agent-preset/selected`). Bei einem Preset-Wechsel in derselben Sitzung kann die
  Sammlungsliste also kurz veraltet sein.
