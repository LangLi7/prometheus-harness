# Geheimnisse ablegen — C1 abgeschlossen

**Stand:** 13.10.2026 · **Ergänzt:** `store-postgres` (fünf Funktionen) · `scripts/geheimnis.mjs`

Dieses Blatt belegt eine Aussage: **`user_secrets` hat jetzt einen Aufrufer — und der Klartext
kommt nie in die Spalte.** Jede Zahl nennt den Befehl, der sie gemessen hat.

---

## 1. Was fehlte

Nach Runde 10 gab es die Umschlagverschlüsselung (29 Prüfungen) — und **nichts rief sie auf**.
Die Tabelle `user_secrets` hatte keinen Aufrufer: dasselbe Muster wie bei `claim`,
`permissions`, `user_profiles` und der Kryptographie selbst. Ein Verfahren ohne Aufrufer ist
eine Behauptung.

## 2. Zwei Ebenen, damit niemand Klartext ablegt

| Ebene | Funktion | Was sie tut |
|---|---|---|
| **Bytes** | `speichereUmschlag` / `ladeUmschlag` | schreibt und liest die vier Spalten. **Entscheidet nichts**, verschlüsselt nichts |
| **Umschlag** | `speichereGeheimnis` / `ladeGeheimnis` | nimmt Klartext und Hauptschlüssel, **verpackt selbst** |
| **Auskunft** | `listeGeheimnisse` | Name, Fassung, Hinweis — **ohne** Klartext, **ohne** Geheimtext, **ohne** Hauptschlüssel |

**Warum beide Ebenen nötig sind.** Die Byte-Ebene braucht **keinen** Hauptschlüssel — eine
Prüfung kann sie ansprechen, und die **Rotation** benutzt sie (sie schreibt einen neuen Umschlag
mit **demselben** `value_cipher`). Die Umschlag-Ebene ist die, die ein Aufrufer benutzt: es gibt
**keinen Weg hindurch**, der Klartext in die Spalte schreibt.

`listeGeheimnisse` holt `value_cipher` und `wrapped_key` **gar nicht ab** — eine Prüfung hält
das fest (`expect(anweisung).not.toContain('value_cipher')`). Wer die Frage „welche Geheimnisse
liegen hier?" über `ladeUmschlag` beantwortet, holt jedes einzeln und hat dann Klartext im
Speicher, den niemand braucht.

## 3. Der Beweis: die ganze Kette, Ende zu Ende

Auf der Wegwerf-Datenbank (`pmh_test`), als **Anwendungsrolle** `pmh_app`, mit dem
Hauptschlüssel aus einer **Datei**:

```
1. set     'ein-erlaufener-anbieterschluessel-0123456789' | bun scripts/geheimnis.mjs set DEEPSEEK_API_KEY --benutzer index@example.org
           -> Geheimnis gespeichert, Fassung 1, Hinweis c7c89346
              Hauptschlüssel aus: Datei …\master.key
2. liste   -> DEEPSEEK_API_KEY  Fassung 1  Hinweis c7c89346 2026-10-13T20:20:02.450Z
3. pruefe  -> läßt sich öffnen: 44 Byte Klartext (Wert NICHT angezeigt)
4. pruefe --zeigen -> ein-erlaufener-anbieterschluessel-0123456789   ← genau die Eingabe
```

**Und die Byte-Arithmetik geht exakt auf** — das ist die stärkste Einzelprüfung:

| Spalte | gemessen | erwartet |
|---|---|---|
| `value_cipher` | **73 Byte** | 1 + 12 + **44** + 16 = 73 ✓ (Klartext 44 Zeichen) |
| `wrapped_key` | **61 Byte** | 1 + 12 + **32** + 16 = 61 ✓ (Datenschlüssel 32 Byte) |
| Klartext in der Zeile | **0 von 1** | 0 ✓ |

## 4. Die Entscheidung im Skript: der Wert kommt über STDIN

**Nicht als Argument.** Ein Argument steht in der Prozeßliste — unter Linux in
`/proc/<pid>/cmdline`, unter Windows in der Prozeßabfrage — und ist für **jeden Benutzer
desselben Rechners** lesbar. Ein Anbieterschlüssel, der so hereinkommt, ist geleakt, **bevor**
er verschlüsselt ist.

Dasselbe gilt für die Ausgabe: `pruefe` bestätigt nur, daß sich das Geheimnis öffnen läßt, und
sagt ausdrücklich, daß `--zeigen` es in den Verlauf schreibt. **Kein Eintrag in `auth_events`**
enthält den Wert — die Prüfspur ist ausdrücklich ohne Klartext-Geheimnisse angelegt.

## 5. Ein eigener Fehler, der eine Grenze verletzt hat

**Beim Vorbereiten des Laufs habe ich `C:\Users\Chang\master.key` angelegt** — außerhalb der
erlaubten Bereiche (`.pmh`, `prometheus-harness`, `harness/prometheus-harness`).

**Ursache:** `$home` ist in PowerShell eine **schreibgeschützte automatische Variable**. Meine
Zuweisung `$home = Join-Path $env:TEMP …` schlug fehl, `$env:PMH_HOME = $home` setzte damit
`C:\Users\Chang` — und das Schlüsselskript schrieb dorthin.

**Was ich getan habe:** die Datei belegt (44 Byte, 43 Zeichen base64url = genau die Form, die
`erzeugeHauptsschlüsselText` erzeugt, angelegt 22:18:42), **nur diese eine** entfernt, und
danach geprüft, daß dort nichts aus meinem Lauf liegt. Der nächste Lauf prüft sein Ziel
**vorher** gegen die erlaubten Bereiche, statt es zu hoffen.

**Drei eigene Fehler in dieser Runde, alle im Skript:** `type SqlZugang` in einer `.mjs` (Bun
führt sie als JavaScript aus — derselbe Fehler, den `scripts/migrate.mjs` **im Kommentar
dokumentiert** und in den ich trotzdem gelaufen bin), `resolveEigenesHome(umgebung)` statt
`resolveEigenesHome(undefined, umgebung)` (das erste Argument ist der **Pfad**), und die
`$home`-Verwechslung. Die ersten zwei fand der Lauf, den dritten die Messung danach.

## 6. Prüfstand

| Prüfung | Ergebnis |
|---|---|
| Speicher-Attrappen (inkl. 5 neuer für die Geheimnisse) | **45 pass / 0 fail** (vorher 40) |
| Typsystem | **23 Pakete grün**, Exit **0** |
| Gesamtsuite auf `pmh_test` | **1085 pass / 2 fail** — 1087 in 40 Dateien |
| Die Kette im Handlauf | **4 Schritte**, Klartext kommt zurück, Byte-Arithmetik stimmt |

Die Zahl stieg von **1080 auf 1085** grün — **+5**, genau die neuen Prüfungen. Die 2 roten sind
**nicht unsere**: `apps/cli` (`typert-loader`) und `packages/util/atomic-write` (os error 5).

## 7. Was offen ist

| Was | Warum |
|---|---|
| **Ein Weg im Betrieb** | Das Skript ist ein Werkzeug für den Bediener. Ein **Endpunkt**, über den die Oberfläche einen Anbieterschlüssel setzt, fehlt — und mit ihm die Frage, was ein Benutzer ohne Adminrecht darf |
| **C2** | Passwort-Reset über `one_time_tokens` |
| **C3** | API-Schlüssel-Erzeuger (≥112 Bit, Pepper) |
| **C4, Stufen 2 und 3** | Docker-Secret, Vault/KMS |
| **Der Endpunkt-Hauptschlüssel** | Es gibt noch **keinen** `master.key` im echten `~/.pmh` — die Stufe ist gebaut und gemessen, aber nicht in Betrieb genommen. Das ist eine Betreiberentscheidung (siehe unten) |
