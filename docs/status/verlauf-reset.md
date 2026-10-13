# E1 — `verlauf-reset.mjs`: einen Neuanfang ausgeben, nicht vollziehen

> **Stand:** 13.10.2026 · **Auftrag (E1):** *„reset.mjs, das den Orphan-Branch-Weg
> AUSGIBT statt die Historie anzufassen (ein Reset, der die Historie nicht anfaßt,
> täuscht Sicherheit vor)."*
>
> **Ergebnis:** `scripts/verlauf-reset.mjs` + `scripts/verlauf-reset.test.mjs`
> (**13 Prüfungen, alle grün**). Das Skript **liest** und **druckt** — und es
> **kann** nichts anderes tun (§2).

---

## 1. Der Name — und warum nicht `reset.mjs`

`scripts/reset.mjs` gibt es seit Runde 12: das ist der **Paßwort**-Reset
(`docs/status/passwort-reset.md`). Ein zweites Skript mit demselben Namen wäre eine
Falle — man ruft das falsche und merkt es erst hinterher. Dieses heißt deshalb
`verlauf-reset`.

## 2. Die Erlaubnisliste: das Skript *kann* den Verlauf nicht anfassen

```
ERLAUBT:  rev-parse, rev-list, status, log, remote, branch, tag, config, count-objects
```

`git` wird ausschließlich über `gitLesen()` gerufen, und das weist alles ab, was
nicht in dieser Liste steht — **bevor** der Aufruf `git` erreicht. Ein Schreibbefehl
wird zur Laufzeit zu einem `NichtLesendError`.

**Warum eine Erlaubnisliste und kein Verbot.** Verbote sind unvollständig: man
vergißt einen Schreibbefehl, und dann ist er erlaubt. Eine Erlaubnisliste ist
vollständig: was nicht darin steht, geht nicht — auch das, woran niemand gedacht hat.

**Geprüft** (nicht behauptet): `commit`, `push`, `reset`, `checkout`,
`filter-branch`, `rebase`, `branch -D`, `gc` → alle acht werfen.

## 3. Der Beweis, der zählt: **es tut nichts**

Die Prüfung vergleicht den Zustand des Repositorys **vorher und nachher** — Kopf,
Zahl der Commits und **Etiketten**:

```ts
expect(nachher).toEqual(vorher)
```

**Warum die Etiketten mitgezählt werden:** der Orphan-Weg legt als erstes ein
Etikett an (`git tag alt-main main`), um den alten Verlauf festzuhalten. Genau das
darf **hier** nicht geschehen — und genau das würde auffallen.

Gemessen nach dem Lauf:

```
HEAD b03b050   Commits 137   Etiketten 0
```

Derselbe Wert wie vor dem Lauf.

## 4. Was ausgegeben wird — und was daran ehrlich ist

```
AUSGANGSLAGE
  Zweig          main
  Commits        137
  letzter Commit b03b050 D2: Obsidian-Schema — Migration 0007, der Vault traegt den Mandanten
  Arbeitsbaum    30 Änderung(en) — NICHT sauber
  Fern           https://github.com/LangLi7/prometheus-harness.git
  Etiketten      (keine)

 1. Den alten Verlauf FESTHALTEN, bevor irgendetwas geschieht.
      git tag alt-main main
      git push origin alt-main
 2. git switch --orphan main-neu ; git add -A ; git commit -m "Neuanfang: …"
 3. git rev-list --count main-neu          # erwartet: 1
    git diff --stat main main-neu           # erwartet: keine Ausgabe
 4. git push origin main-neu
 5. git push --force-with-lease origin main-neu:main
 6. Aufräumen ist eine ENTSCHEIDUNG …
```

**Fünf Eigenschaften, die geprüft sind:**

| Eigenschaft | Warum |
|---|---|
| erst **festhalten**, dann anfassen | wer erst den neuen Zweig baut und dann merkt, daß er den alten braucht, hat ihn womöglich schon nicht mehr |
| `--force-with-lease`, **nie** `--force` | `--force-with-lease` bricht ab, wenn jemand anders inzwischen übertragen hat; `--force` täte es nicht |
| **Prüfen vor dem Übertragen** (`rev-list --count` = 1, `diff --stat` leer) | sonst überträgt man einen Zweig, von dem man nicht weiß, was drin ist |
| **kein** verlauf-umschreibender Befehl im Text | geprüft gegen `filter-branch`, `rebase`, `commit --amend`, `reflog delete`, `update-ref -d` |
| der Schlußsatz **sagt**, was es getan hat: nichts | und daß der alte Verlauf **nicht weg** ist |

**Der letzte Punkt ist der Kern des Auftrags.** Ein „Reset", der den Verlauf
umschreibt, ist nicht rückgängig zu machen — und einer, der behauptet, den Verlauf
nicht anzufassen, während er es doch tut, **täuscht Sicherheit vor**. Das Skript
schreibt deshalb ausdrücklich hin, daß der alte Verlauf nach einem Neuanfang
**weiter existiert**: im Etikett und, bis jemand ihn dort entfernt, auch auf dem
Server (GitHub: Kontakt nötig).

## 5. Ein eigener Fehler, der zum fünften Mal dieselbe Form hatte

Die erste Fassung dieser Datei war **TypeScript in einer `.mjs`**: `interface`,
Typangaben an jeder Funktion, `as const`. Unter Bun ist das ein Syntaxfehler beim
Laden (`Expected ")" but found ":"`). Dieselbe Falle steht in `scripts/migrate.mjs`,
in `scripts/reset.test.mjs` und in `suite-nebenlaeufigkeit.mjs` **beschrieben** — und
ich bin beim **fünften** Mal wieder hineingelaufen. Die Typen stehen jetzt als JSDoc,
wo sie in einer `.mjs` hingehören.

Dazu ein **zweiter** eigener Fehler in der Prüfung: sie suchte `--force` im **ganzen
Text** und wurde rot — zu Recht, denn in der Erklärung steht *„`--force` täte es
nicht"*. Ein Satz ist kein Befehl. Jetzt werden nur die **Befehlszeilen** geprüft
(dieselbe Lehre wie bei der Anmeldeseite: wer Code prüfen will, prüft Code).

## 6. Zahlen

| Messung | Befehl | Wert |
|---|---|---|
| Prüfungen des Skripts | `bun test scripts/verlauf-reset.test.mjs` | **13 pass, 0 fail** |
| Verlauf vor/nach dem Lauf | `git rev-parse HEAD`, `git rev-list --count HEAD`, `git tag --list` | `b03b050`, **137**, **0** — unverändert |
| Lage lesen | `bun scripts/verlauf-reset.mjs lage` | exit **0** |
| ohne Befehl | `bun scripts/verlauf-reset.mjs` | exit **1** |
| ohne Repository | `PMH_VERZEICHNIS=<leeres Verzeichnis>` | exit **1**, „kein git-Repository" |
