# Tote Verweise — der Wächter und was er gefunden hat

Stand: 15.10.2026. `scripts/reference-guard.mjs`, Beleg: `docs/status/reference-lauf.txt`,
Prüfungen: `scripts/tests/reference-guard.test.mjs` (**15**, 0 rot).

## 1. Warum dieses Werkzeug gebaut wurde

`naming-rest.md` §4 hat es als **Vorbedingung für Zug 5** aufgeschrieben: *„bevor ein Skriptname
fällt, braucht es einen zweiten Wächter, der einen Namen nennt, den kein Aufrufer mehr kennt — sonst
tauscht man 43 deutsche Namen gegen eine unbekannte Zahl stiller Ausfälle."*

**Und es hat sich sofort bezahlt, an mir selbst.**

## 2. Drei Fehler in meinem EIGENEN Werkzeug, alle beim Laufen gefunden

| Fehler | Wie er sich zeigte | Was er lehrt |
|---|---|---|
| `packages/` + Stern + `/` + Stern **in einem JSDoc-Block** | `error: Unexpected *` — `*` und `/` nebeneinander sind das **Kommentarende**; der Kommentar war mitten im Satz zu | Ein Zeichenpaar kann eine Sprachgrenze sein. Die Zeile trägt jetzt ein Auslaßzeichen |
| `${String(new Set(…).size}` — **eine Klammer fehlt** | `Expected ")" but found "}"` | |
| `tmpdir` **nicht eingeführt** | `ReferenceError: tmpdir is not defined` **in der Gegenprobe** | Immerhin: die Gegenprobe lief **zuerst** und brach ab, bevor ein einziger Befund ausgegeben wurde |

## 3. Die Zahl, dreimal korrigiert — jedes Mal, weil ich zu weit gemessen hatte

| Lauf | Code | Was sich änderte |
|---|---|---|
| 1 | **196** | Der **ganze** Baum. Die drei häufigsten Quellen: `.github/review-ownership/test_blame_production.py` (22), `website/.bun-cache/rollup@4.64.5/package.json` (12), `…/rollup/4.64.5/package.json` (12) |
| 2 | **66** | Dateiliste aus **`git ls-files`**. Von **acht** Workflow-Dateien in `.github/workflows/` ist **eine** verfolgt; `.bun-cache` ist erzeugt |
| 3 | **57** | **Auflösung über die Elternstufen.** `tests/lebend.test.ts` aus `packages/ai/openrouter/src/index.ts` war als tot gemeldet — die Datei gibt es, sie liegt in `packages/ai/openrouter/tests/` |
| 4 | **48** | **Zehn Fundstellen behoben**, die meine eigenen Umbenennungen hinterlassen hatten (§4) |

**Nach Bereich:** `packages` 14 · `scripts` 13 · `native` 7 · `services` 5 · `docs` 4 · Wurzeldateien
4 · `website` 1.

**Dokumente: 616** in 51 Dateien. Sie machen **nicht** rot: ein toter Verweis in einem datierten
Bericht ist **Geschichte**. `naming-rest.md` und `naming-plan.md` nennen absichtlich die alten Namen.

**Nicht geprüft, gezählt:** 431 relative Angaben · **301 Muster** · 1796 Angaben ohne Endung.
**693 Textdateien, 933 verschiedene Adressen.**

## 4. Der Befund, der meine eigene Arbeit trifft

Jeder meiner vier Umbenennungszüge meldete **„Gegenprobe: kein Treffer"**. Der neue Wächter fand
danach **zehn** Stellen, an denen die *umbenannte Datei sich selbst noch unter dem alten Namen
nannte*:

```
apps/login_web/tests/redirect.test.ts          ->  "bun test apps/login_web/tests/weiter.test.ts"
packages/client/source-folders/tests/paths.test.ts  ->  "packages/api/auth-http/tests/ordner.test.ts"
packages/auth/store-postgres/tests/roots.test.ts    ->  ".../arbeitsbereich-ordner.test.ts"
packages/auth/db-schema/tests/session-log.test.ts   ->  ".../sitzungsprotokoll.test.ts"
packages/auth/db-schema/tests/workspace-folders.test.ts -> "sitzungsprotokoll.test.ts"
die fünf Fixture-Dateien                 ->  "Get-Content .../proben/<alter Name>.sql"
```

**Warum meine Gegenprobe sie nicht sah.** Sie suchte nach **`weiter.ts`** — und in
`weiter.test.ts` steht `weiter.test.ts`. Der Suchbegriff war **ein Beispiel**, nicht die **Menge**.
Genau davor steht **Regel 36** („eine Regel wird gegen die *ganze* Menge geprüft, nicht gegen ein
Beispiel") — und ich habe sie beim Umbenennen viermal auf **eine Dateiendung** angewandt, aber nicht
auf **die Namen, die ich selbst gerade geändert hatte**.

**Die Lehre, schärfer formuliert:** *eine Umbenennung zieht nicht nur ihre Importe — sie zieht jede
Stelle, an der der alte Name **als Text** steht, auch in der Datei selbst.* Wer das mit einem Muster
prüft, prüft sein Muster.

## 5. Was der Wächter NICHT kann — ausgesprochen

| Grenze | Warum |
|---|---|
| **Relative Angaben** (`../migrations/…`) | Sie bräuchten die Basis der Datei; eine falsche Basis erzeugt erfundene Befunde. Sie werden **gezählt** (431) |
| **Angaben, die auf die DSH-Ablage zeigen** (`packages/client/runtime/…`) | Der DSH-Baum ist ein **Nachbar** dieses Repos, nicht ein Teil davon. Adresse und Ziel liegen in zwei Bäumen |
| **Testnamen, die es absichtlich nicht gibt** (`docs/a.md` in `readme-paarung.test.mjs`) | Eine Prüfung **darf** Namen erfinden. Der Wächter kann Absicht nicht von Fehler trennen |
| **Ordnerangaben ohne Endung** | 1796 gezählt; geprüft werden **Dateien** |

**Fünf der 48 sind deshalb vermutlich keine Defekte** — sie stehen hier als Rest, nicht als Urteil.
Wer sie abarbeitet, entscheidet **jede einzeln** und schreibt den Grund auf.

## 6. Abgrenzung zu `naming-guard.mjs`

| | `naming-guard.mjs` | `reference-guard.mjs` |
|---|---|---|
| Frage | Heißt eine Datei **deutsch**? | Zeigt eine Adresse auf **nichts**? |
| Menge | Wurzeln des Codes, alle Namen | die von **git verfolgten** Dateien |
| Rot bei | deutschen Ordnern und Dateien | toten Verweisen **im Code** |
| Stand | **50** | **48** im Code, 616 in Dokumenten |

**Die beiden sind Gegenstücke.** Der eine sagt „dieser Name soll weg"; der andere sagt „dieser Name
wird noch irgendwo genannt". **Zusammen** ist eine Umbenennung erst dann fertig, wenn **beide** es
sagen: `naming-guard` zählt den alten Namen nicht mehr, `reference-guard` findet keinen Verweis
mehr auf ihn.
