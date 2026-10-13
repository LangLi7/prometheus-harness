# E2 — der gitleaks-Haken: ein Haken, der sich selbst ehrlich macht

> **Stand:** 13.10.2026 · **Auftrag (E2):** *„gitleaks-Haken (Weisung, nicht
> installiert)."*
>
> **Gebaut:** `scripts/leck-haken.mjs`, `.githooks/pre-commit`,
> `scripts/leck-haken.test.mjs` (**9 Prüfungen, alle grün**).
>
> **Der Ist-Zustand, gemessen:** `bun scripts/leck-haken.mjs pruefen` →
> *„NICHT GEPRÜFT: gitleaks ist nicht installiert."* — Exit **0**.

---

## 1. Der Entwurf folgt aus dem gemessenen Zustand

Das Werkzeug ist **nicht installiert**. Daraus folgen drei Entscheidungen, und die
erste ist die wichtigste:

| Fall | Verhalten | Warum |
|---|---|---|
| **Werkzeug fehlt** | Exit **0**, und die Ausgabe **sagt**, daß nichts geprüft wurde — mit dem Installationsbefehl | Ein Haken, der bei fehlendem Werkzeug **jeden** Commit abweist, wird nach dem dritten Mal mit `--no-verify` umgangen. Dann schützt er **gar nichts** — und niemand merkt es |
| **Werkzeug da, nichts gefunden** | Exit **0**, mit der Fassung in der Ausgabe | — |
| **Werkzeug da, Fund** | Exit **1** — der Commit soll nicht so gehen | Hier entscheidet das Werkzeug, nicht wir. Und die Meldung sagt, was zu tun ist, wenn man den Fund für falsch hält: erst die Regel prüfen, **dann** übergehen und den Grund aufschreiben |

**Der Satz, der in der Ausgabe steht und der Punkt ist:**

> *„Bis dahin gilt: dieser Lauf hat NICHTS geprüft. Ein grüner Haken ohne Werkzeug
> ist kein Beweis — er ist die Abwesenheit eines Beweises."*

Ein Haken, der stillschweigend durchläuft, wäre schlimmer als keiner: er **sieht aus
wie ein Schutz**.

## 2. Der Haken liegt im Repository, scharf wird er durch eine Zeile

```
git config core.hooksPath .githooks        # einmal je Arbeitskopie
```

**Warum nicht `.git/hooks/`:** das wird **nicht versioniert**. Ein Haken dort gilt nur
auf diesem Rechner und ist beim nächsten Klon weg. `.githooks/pre-commit` liegt im
Repository — und wird **absichtlich nicht** von selbst scharf: ein Haken, der sich
beim Klonen einschaltet, überrascht Leute, die ihn nicht wollen.

**Ich habe `core.hooksPath` NICHT gesetzt.** Das ist eine Einstellung **dieser**
Arbeitskopie, und in ihr arbeitet ein zweiter Agent. Die Zeile steht in der Ausgabe
von `haken` und in der Datei selbst; wer sie will, tippt sie.

## 3. Beide Zweige sind gefahren — der entscheidende wäre hier nie gelaufen

Die Werkzeugsuche ist ein **Einschub** (`finde`), kein fester Aufruf. Grund: auf
diesem Rechner ist gitleaks nicht vorhanden, also liefe der **Fund**-Zweig hier
**nie** von selbst — und ein Haken, dessen entscheidender Zweig nur auf einem anderen
Rechner läuft, ist hier **ungeprüft**.

Geprüft sind deshalb beide Welten (`da` → `'8.28.0'`, `fehlt` → `undefined`), dazu
der echte Aufruf gegen einen Namen, den es nicht gibt.

## 4. Die Grenze — und die andere Prüfung, die daneben gehört

**gitleaks sucht Muster.** `docs/protokoll/aufsicht/werkzeuge/leck-pruefung.mjs`
sucht die **konkreten Geheimnisse dieses Rechners**: die echten Werte aus `.env` und
den Credential-Speichern, gegen **jeden** Commit, den verfolgten Baum und die
unverfolgten Dateien. Das ist eine **andere** Frage — und für diese Maschine die
**schärfere**.

Keine der beiden ersetzt die andere, und der Haken sagt das in seiner Ausgabe selbst
(*„Was es hier sonst gibt: … leck-pruefung.mjs"*), damit niemand die Mustererkennung
für den ganzen Schutz hält.

## 5. Ein eigener Fehler

Die **erste Fassung der letzten Prüfung war leer**: sie lautete `if (fassung ===
undefined) { … } else { … }` und wäre in **jedem** Fall grün gewesen. Ein solcher Fall
ist keine Prüfung. Ersetzt durch eine **Vertragsprüfung** (kein Wurf, keine leere
Zeichenkette), und der Ist-Zustand dieses Rechners steht **hier im Nachweis** statt in
einer Prüfung, die beim Installieren des Werkzeugs umfallen würde.

## 6. Zahlen

| Messung | Befehl | Wert |
|---|---|---|
| Prüfungen | `bun test scripts/leck-haken.test.mjs` | **9 pass, 0 fail** |
| Handlauf | `bun scripts/leck-haken.mjs pruefen` | **„NICHT GEPRÜFT"**, Exit **0** |
| Einbindung | `bun scripts/leck-haken.mjs haken` | Exit **0**, nennt `core.hooksPath` |
| ohne Befehl | `bun scripts/leck-haken.mjs` | Exit **1** |
| Werkzeug vorhanden? | `findeWerkzeug()` | **`undefined`** — gitleaks ist nicht installiert |

## 7. Was offen bleibt

| Offen | Warum |
|---|---|
| **gitleaks ist nicht installiert** | eine Installation ist eine Änderung an **dieser Maschine**, nicht am Repository. Der Befehl steht in der Ausgabe: `winget install --id Gitleaks.Gitleaks` |
| **`core.hooksPath` ist nicht gesetzt** | die Einstellung dieser Arbeitskopie — und hier arbeitet ein zweiter Agent. Eine Zeile, wenn du sie willst |
| **Kein `.githooks/pre-push`** | der Haken prüft die **gestellten** Änderungen. Wer vor dem Übertragen den ganzen Baum prüfen will, braucht `gitleaks detect` — eine eigene Entscheidung (Laufzeit, Protokoll) |
