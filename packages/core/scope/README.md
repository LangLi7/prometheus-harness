# `@prometheus-harness/scope` — Scoped-Kontext

**Zweck.** Ein Primitiv, mit dem Registrierungen an eine **Ebene** gebunden sind und außerhalb
dieser Ebene nicht sichtbar werden. Die Vorlage nutzt das überall dort, wo etwas „für diesen
Agenten", „für diese Session" oder „für diesen Turn" gilt statt global.

## Zwei Dinge, die bewusst getrennt sind

| Begriff | Was es ist | Wofür |
|---|---|---|
| `ScopeKey` | ein `symbol` | **Identität** — zwei gleichnamige Scopes sind verschieden |
| `ScopeName` | eine Zeichenkette | **Anzeige** — Logs, Fehlermeldungen, Tests |

Würde ein Scope sich über seinen Namen vergleichen lassen, teilten zwei gleichnamige Agenten
still ihre Werte. Deshalb vergleicht `sameScope` nur das Symbol.

## Ausgeführte Oberfläche

| Export | Zweck |
|---|---|
| `createScope(name, parent?)` | erzeugt einen Scope; leerer Name wird abgelehnt |
| `Scope` | `key`, `name`, `parent`, `chain` (Wurzel zuerst, **diesen Scope zuletzt**), `isAncestorOf`, `isDescendantOf` |
| `ScopeKey`, `ScopeName` | Identität bzw. Anzeigename |
| `Scoped<T>` / `scoped(scope, value)` | ein Wert, gebunden an genau einen Scope |
| `ScopeCarrier` / `ScopedCarrier<T>` / `carrier(scope, value)` | Objekt, das seinen Scope trägt und weitergibt |
| `belongsTo(scope, carrierScope)` | liegt `carrierScope` unter `scope`? |
| `runInScope(scope, body)` / `runInScopeAsync(...)` | Rückruf mit ausdrücklich übergebenem Scope |
| `sameScope(a, b)` | Identitätsvergleich zweier Schlüssel |
| `createScopedRegistry<T>()` | Registrierungstabelle mit Shadowing: der **nähere** Scope gewinnt |
| `ScopedRegistry<T>` | `register`, `lookup`, `all`, `entries`, `of`, `size` |
| `ScopedRegistration<T>` | `scope`, `value`, `dispose()` (mehrfach aufrufbar) |

### Shadowing-Regel

`lookup(scope, name)` liefert den Eintrag des **nächstgelegenen** Scope; `all(scope, name)`
liefert alle sichtbaren Ebenen, nächster zuerst. Ein Eintrag in einem fremden Zweig ist
unsichtbar. Genau das ist die Regel, die die Vorlage bei Prompt-Abschnitten, Tool-Anbietern und
Variablen anwendet.

## Noch nicht implementiert

- **Kein `AsyncLocalStorage`.** Der Scope wird ausdrücklich übergeben; es gibt keinen
  impliziten „aktuellen Scope". Das ist Absicht — ein impliziter Scope ist genau die
  Fehlerquelle, die dieses Paket vermeiden soll.
- **Kein Vererbungs-Interesse.** Ob ein verdeckter Eintrag *auch* gemeldet werden soll, muss der
  Aufrufer über `all` selbst entscheiden.
- **Keine Serialisierung.** `ScopeKey.token` ist ein Symbol und lässt sich nicht auf die Platte
  schreiben. Wer Scopes dauerhaft braucht, speichert den Namen und bildet den Scope neu.
- **Keine Nebenläufigkeitsabsicherung.** Die Registrierungstabelle ist synchron und nicht für
  gleichzeitige Mutation aus mehreren Tasks gedacht.

## Tests

```powershell
cd packages\core\scope
bun test          # 12 Prüfungen
bun run typecheck # tsgo --noEmit
```
