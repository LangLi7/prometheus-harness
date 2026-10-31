# Vor dem Merge — Vorgehensweise und Prüfliste

> **Zweck.** Eine Prüfliste, die aus der **Messung** kommt, nicht aus dem Gedächtnis
> (Hausregel 3 in [`arbeitsweise.md`](arbeitsweise.md)). Sie gilt für jede Änderung,
> die `main` erreicht.
>
> **Zweite Fassung.** Die erste folgte der üblichen Vorlage — *kompiliert es, laufen
> die Tests, baut es, ist es sicher*. Der Prüfbericht in §6 hält fest, was daran auf
> **diesem** Rechner falsch war. Die gültige Liste in §2 ist kürzer und unangenehmer.

---

## 1. Die Vorgehensweise

Sechs Stufen. Jede endet auf einem **Kriterium**, das man prüfen kann.

| # | Stufe | Kriterium |
|---|---|---|
| 1 | **Graph fragen** — wo liegt die Stelle, wer ruft sie? | die betroffenen Dateien sind benannt |
| 2 | **Vault fragen** — gibt es eine Entscheidung dazu? | die Notiz ist gelesen, oder es gibt keine |
| 3 | **Ändern** — kleinster Schnitt | `git diff --stat` zeigt nur beabsichtigte Dateien |
| 4 | **Prüfen** — die Punkte aus §2 | jeder Punkt hat einen Beleg **oder** das Wort „nicht messbar" |
| 5 | **Berichten** — was geprüft wurde und was nicht | der Satz „X geprüft, Y nicht" steht in der Antwort |
| 6 | **Erst dann** committen und mergen | 1–5 sind belegt |

**Stufe 4 ist die Stelle, an der gelogen wird** — nicht aus Absicht, sondern weil ein
grüner Haken wie ein Beweis aussieht. Deshalb hat jeder Punkt eine Spalte
*„sagt grün die Wahrheit?"*.

---

## 2. Die Prüfliste

| # | Frage | Befehl | Rot bei | Sagt grün die Wahrheit? |
|---|---|---|---|---|
| 1 | Typprüfung | `bun run typecheck` — **unter der Sandbox nicht lauffähig**, siehe §3 | Typfehler | nur außerhalb der Sandbox |
| 2 | Suite | `bun test` | Testfehler | nur nach **zweitem** Lauf (§3, Flattern) |
| 3 | README-Paarung | `bun run check:readme` | fehlende/deutsche Gegenfassung | ja — er nennt die Paare beim Namen |
| 4 | Geheimnisse | `bun scripts/leck-haken.mjs pruefen` | Fund (mit gitleaks) | **nein**, solange gitleaks fehlt |
| 5 | Datenbank | `bun test` mit `PMH_TEST_DATABASE_URL` | Schema-/Speicherfehler | **nein** ohne die Variable — die Prüfungen überspringen sich |
| 6 | Umfang der Änderung | `git diff --stat` | fremde Dateien | ja |
| 7 | Slop-Wächter | `bun run check:slop --range main...HEAD` | Typ-Stummschaltung, zu großer Diff, Abhängigkeit ohne Sperrdatei | ja für die drei Muster — der Rest bleibt Review (§2a) |

**Zwei Punkte der üblichen Vorlage fehlen, und zwar begründet:**

- **„Baut es?"** — `build` ist in `package.json` **dasselbe** wie `typecheck`
  (`bun run scripts/typecheck.mjs`); es gibt keinen Build-Schritt
  (`bunfig.toml`: „kein Bundler, kein Build-Schritt"). Der Punkt wäre ein zweiter
  Aufruf desselben Befehls.
- **„Ist es sicher?"** — der Haken ist der einzige Sicherheitsbefund, und er kann
  ohne `gitleaks` nicht rot werden. Ein Punkt, der nicht rot werden kann, mißt
  nichts (Hausregel 5). Er bleibt als **benannte Lücke** stehen, nicht als Haken.
  `bun run lint` ist ebenfalls ein No-op: Exit 0, Ausgabe „noch nicht verdrahtet".

---

## 2a. Vier Fragen ohne Befehl

Diese vier stehen bewußt **nicht** in der Tabelle. Sie können nicht grün werden — es gibt
keinen Befehl, der sie beantwortet. Sie sind Review-Fragen, keine Häkchen; die Vorgaben
dahinter stehen in [`slop-vorgaben.md`](slop-vorgaben.md).

1. **Ist der Schnitt klein?** Nennt `git diff --stat` nur Dateien, die der Zweck braucht?
2. **Ist die Stelle lesbar ohne Rückfrage?** Neue `any`, `as` oder `@ts-ignore` — steht die
   Begründung dabei?
3. **Ist benannt, was ein Modell erzeugt hat** — und was davon geprüft und verworfen wurde?
4. **Gibt ein Mensch die kritischen Pfade frei** (Anmeldung, Kryptographie, Zahlungen,
   Datenzugriff), und kann er sie erklären?

Wer eine dieser vier mit „ja" beantwortet, ohne nachgesehen zu haben, hat die Frage gestellt,
nicht beantwortet.

---

## 3. Rot ist nicht gleich rot — die Klassifikation

**Das ist der eigentliche Teil dieser Datei.** Ein roter Lauf hat drei Ursachen, und
wer sie nicht trennt, repariert die falsche.

| Ursache | Woran erkennbar | Was zu tun ist |
|---|---|---|
| **Code** | Meldung nennt Datei, Zeile, Erwartung | reparieren |
| **Umgebung** | `EPERM`, `uv_spawn`, fehlendes Werkzeug, „kein git-Repository" | **nicht** reparieren — benennen und eskalieren |
| **Flattern** | derselbe Befehl, zweiter Lauf, anderes Ergebnis | zweiten Lauf abwarten (Hausregel 1) |

**Gemessen am 27.10.2026** (Belege in §6): die Typprüfung endet mit `Exit 1` und
`EPERM: operation not permitted, uv_spawn` in `scripts/typecheck.mjs:130` — das ist
**Umgebung**, nicht Code. Das Skript sammelt die Ausgabe über `stdio: 'pipe'`, und
die Sandbox verbietet Pipes.

**Der Ausweg, damit der Punkt trotzdem prüfbar bleibt:** je Paket direkt prüfen,
ohne Pipe und ohne Sammler —

```bash
bun node_modules/@typescript/native-preview/bin/tsgo --noEmit -p packages/<name>/tsconfig.json
```

**Nicht** `node_modules/.bin/tsgo`: dieser Shim endet unter der Sandbox mit
`EACCES` (gemessen am 27.10.2026). Der Weg über `@typescript/native-preview/bin/tsgo`
ist derselbe Einstieg, den `scripts/typecheck.mjs` selbst benutzt — und er läuft.

**Die Regel daraus:** *Ein Exit-Code ohne seine Ursache ist keine Auskunft.* Erst die
Meldung lesen, dann klassifizieren, dann handeln.

---

## 4. Was ein grüner Lauf nicht sagt

Ein grüner Lauf heißt: **alles geprüft, was ohne Datenbank und ohne Pipe prüfbar
ist.** Er sagt nicht:

- ob Migrationen gegen echtes PostgreSQL laufen (Punkt 5),
- ob ein Geheimnis im Commit steckt (Punkt 4),
- ob die Suite stabil ist (Punkt 2, Flattern),
- ob das Verhalten stimmt — nur, daß die Tests, die es prüfen, grün sind.

---

## 5. Welche Skill wann

Die Skills liegen an **zwei** Orten: `%USERPROFILE%\.agents\skills` (335) und
`.agents\skills` im Repo (188). `security-audit` und `open-code-review` liegen im
Home; `code-review` und `writing-for-agents` im Repo.

| Situation | Skill | Wie er hier greift |
|---|---|---|
| Diff vor dem Merge, regelbasiert | `open-code-review` | `ocr.exe` liegt unter `%USERPROFILE%\.pmh\tools\ocr\` — einsatzbereit (umgezogen am 27.10.2026, siehe [`dsh-abhaengigkeit.md`](dsh-abhaengigkeit.md)) |
| derselbe Diff, aber der Host urteilt | `open-code-review-delegate` | OCR liefert nur Dateiauswahl und Regeln, das Urteil kommt vom Agenten |
| Änderung gegen Issue/Spec, zwei Achsen | `code-review` | Standards parallel zu Spec, zwei Subagenten |
| Sicherheit: Auth, Krypto, Geheimnisse, Eingaben | `security-audit` | **fokussiert** aufrufen; der volle Sechs-Phasen-Lauf nur auf ausdrücklichen Auftrag |
| Verhalten test-first | `tdd` | rot → grün → aufräumen |
| Regression, unklare Ursache | `diagnosing-bugs` | erst messen, dann Hypothesen |
| Agenten-Verhalten messen (Pass-Rate) | `eval-harness` | selten — dieses Repo mißt mit `bun test` |
| Repo-Learnings (`.trail/`) | `trail` | **nicht anwendbar** — kein `.trail/` im Baum (geprüft) |
| Code-Graph (graft) | `graft` | **nicht anwendbar** — dieses Repo nutzt Graphify |

**Reihenfolge, wenn beides nötig ist:** erst `bun test` (schnell, deterministisch),
dann `open-code-review` (Regeln), dann `security-audit` — und den nur, wenn die
Änderung Auth, Krypto, Geheimnisse oder Eingabeverarbeitung berührt. Wer ihn zuerst
laufen läßt, bezahlt ihn für jede Änderung.

**Wo diese Werkzeuge liegen — und was das kostet.** `ocr.exe` liegt seit dem 27.10.2026
unter `%USERPROFILE%\.pmh\tools\ocr\` (Prometheus-Home, nicht `~/.dsh`); die Skills zu 335
im Home und zu 188 im Repo. Ein Prüfwerkzeug außerhalb des Repos ist **keine Zusage des
Repos**: es kann fehlen, eine andere Fassung haben, oder mit einem anderen Home
verschwinden. Wer eine Liste baut, die auf ihm steht, prüft mit einem Werkzeug, das ihm
nicht gehört. Deshalb nennt jeder Punkt in §2, was er **ohne** sein Werkzeug sagt — und
`fehlendeVoraussetzungen()` in `packages/world/knowledge` ist genau dieses Muster für ein
Werkzeug, das noch nicht verdrahtet ist.

**Was hier nicht steht, weil es nicht geprüft ist:** eine eigene
Cloudflare-Security-Skill. Im Home liegen 335 Skills; `security-audit` beschreibt
sich selbst und nennt keine fremde Quelle. Wer die Cloudflare-Regeln will, prüft sie
gegen `security-audit` und ergänzt sie dort — nicht als zweite Wahrheit daneben.

---

## 6. Prüfbericht der ersten Fassung

**Was geprüft wurde.** Die Vorlage aus der Anfrage — *compile, test, build, secure* —
gegen die Befehle, die es in diesem Repo wirklich gibt. Gemessen am 27.10.2026 in
`C:\Users\Chang\prometheus-harness`.

| Behauptung der Vorlage | Messung | Urteil |
|---|---|---|
| „Kompiliert es?" | `bun run typecheck` → **Exit 1**, `EPERM: uv_spawn` (`scripts/typecheck.mjs:130`) | **nicht beantwortbar** unter der Sandbox |
| „Laufen die Tests?" | `bun test` → läuft, Fehler in `api-key`, `history-reset`, `ledger-catchup`, `reference-guard` | **gemischt** — Zuordnung siehe unten |
| „Baut es?" | `package.json`: `build` = `typecheck` | **kein eigener Punkt** — Duplikat |
| „Ist es sicher?" | `leck-haken.mjs pruefen` → Exit 0, „NICHT GEPRÜFT: gitleaks ist nicht installiert" | **nicht beantwortbar** |
| — | `bun run lint` → Exit 0, „noch nicht verdrahtet" | **No-op** |
| — | `bun run check:readme` → Exit 0, „Alle Paare gekoppelt" | **echter Wächter**, fehlte in der Vorlage |

**Zu den Testfehlern.** Zwei Läufe, dieselben Fehler in denselben vier Dateien —
**kein Flattern**, die Suite ist hier reproduzierbar rot. Die Zuordnung:

- `history-reset` (`istRepo: false`, `branch` → `undefined`) und `reference-guard`
  (`quelle` ist `"baum"` statt `"git"`): **Umgebung**. `git` ist da — `git version`
  2.45.1, `rev-parse --show-toplevel` → das Repo, `branch --show-current` → `main`.
  Die Tests rufen es über `spawn` mit Pipe auf, und das scheitert unter der Sandbox.
  *„Fehlendes git" war der naheliegende Verdacht — und er war falsch.* Genau dafür
  steht die Klassifikation in §3 vor dem Reparieren.
- `api-key` (HMAC stimmt nicht, der Pfeffer greift nicht) und `ledger-catchup` (der
  Warnblock enthält nicht `schema-stand`): **Code oder veraltete Erwartung** — in
  beiden Läufen identisch. Nicht repariert, nur benannt.

**Die fünf Befunde, die die Liste geändert haben:**

1. **`build` existiert nicht.** Zwei Punkte der Vorlage sind derselbe Befehl.
2. **Der Typprüfungsbefehl ist unter der Sandbox kaputt**, nicht der Code. Ohne diese
   Unterscheidung repariert man den falschen Gegenstand — und ohne den Ausweg in §3
   bleibt der Punkt unprüfbar.
3. **`lint` ist ein No-op** — Exit 0, keine Prüfung.
4. **Der Sicherheitspunkt kann nicht rot werden**, solange `gitleaks` fehlt.
5. **`check:readme` fehlte** — und es ist der einzige Wächter der Vorlage, der
   wirklich rot werden kann.
