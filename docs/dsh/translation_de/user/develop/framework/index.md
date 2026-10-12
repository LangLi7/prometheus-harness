# Plugins und Lebenszyklus

English | [中文](index.zh.md)

Diese Seite beschreibt das Cordis-Plugin-Modell und die Zustandsmaschine des Lebenszyklus.

## Zustandsmaschine der Fiber

Jedes geladene Plugin besitzt einen **Fiber**-Scope mit den folgenden Zuständen:

```
PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

| Zustand | Bedeutung |
|------|------|
| PENDING | Deklariert, aber die erforderlichen Abhängigkeiten sind nicht bereit |
| LOADING | Die Abhängigkeiten sind bereit und `apply` läuft |
| ACTIVE | Das Plugin läuft |
| FAILED | `apply` hat einen Fehler ausgelöst |
| UNLOADING | Das Plugin entlädt sich und gibt Ressourcen frei |
| DISPOSED | Das Plugin ist vollständig entladen |

## Abhängigkeitsgesteuertes Laden

Ein Plugin mit `inject` wartet auf jeden erforderlichen Service, bevor es lädt:

```ts ignore-check
export const inject = ['tools', 'llm']

export function apply(ctx: Context) {
  // ctx.tools and ctx.llm are ready here.
}
```

Wenn ein erforderlicher Service verschwindet, beispielsweise beim Austausch eines Providers, entlädt sich das Plugin automatisch (ACTIVE → DISPOSED) und lädt erneut, sobald der Service zurückkehrt.

## Automatische Bereinigung

Jede Registrierung, die über `ctx` erfolgt, wird rückgängig gemacht, wenn das Plugin entlädt:

```ts ignore-check
export function apply(ctx: Context) {
  // Event listener: removed automatically on unload.
  ctx.on('some-event', handler)

  // Custom resource: the returned disposer runs on unload.
  ctx.effect(() => {
    const connection = createConnection()
    return () => connection.close()
  })
}
```

Das Framework verfolgt und verwirft alle diese Operationen:
- `ctx.on(event, handler)` — Event-Listener
- `ctx.tools.register(tool)` — Tool-Registrierung
- `ctx.llm.registerAdapter(names, adapter)` — LLM-Adapter-Registrierung
- `ctx.effect(() => cleanup)` — benutzerdefinierte Ressource

Während des Entladens beginnt der Aufruf der Disposer in umgekehrter Registrierungsreihenfolge, aber mehrere asynchrone Disposer laufen nebenläufig und bieten keine Garantie für einen seriellen Abschluss. Reihenfolgeabhängige Bereinigung gehört in einen einzigen Disposer, der von einem einzelnen `ctx.effect()` zurückgegeben wird, und dessen Schritte dort seriell abgewartet werden.

## Verschachtelte Kontexte

`ctx.plugin()` erzeugt eine untergeordnete Fiber, die den übergeordneten Kontext erbt, aber einen unabhängigen Lebenszyklus besitzt:

```ts ignore-check
export function apply(ctx: Context) {
  // Register a child plugin.
  ctx.plugin(childPlugin)

  // The child has its own Fiber and unloads with its parent.
}
```

## Dispose-Semantik

Um eine Plugin-Instanz vorzeitig zu beenden:

```ts
import type { Context } from '@deepseek-ai/cordis'

declare const ctx: Context
declare function myPlugin(ctx: Context): void

const fiber = ctx.plugin(myPlugin)

// Dispose it manually later.
await fiber.dispose()
```

`dispose` garantiert:
1. Alle Registrierungen, die dem Plugin gehören, werden entfernt.
2. Untergeordnete Plugins werden rekursiv entladen.
3. Das zurückgegebene Promise wird aufgelöst, nachdem die gesamte asynchrone Bereinigung abgeschlossen ist.

## Hot Replacement (HMR)

Wenn `@deepseek-ai/dsh-hmr` aus `cordis.yml` geladen ist, löst das Bearbeiten einer Plugin-Quelldatei Folgendes aus:

1. Das alte Plugin entladen und seine Registrierungen bereinigen.
2. Den neuen Code laden.
3. Das neue `apply` ausführen.

Da Plugin-Registrierungen sich selbst bereinigen, behält das Hot Replacement keine Registrierungen der alten Instanz zurück.

## Beispiel-Lebenszyklus

```ts ignore-check
export function apply(ctx: Context) {
  console.log('plugin loading')

  ctx.effect(() => {
    console.log('effect registered')
    return () => console.log('effect cleaned up')
  })
}
```

Das Laden gibt aus:
```
plugin loading
effect registered
```

Das Entladen gibt aus:
```
effect cleaned up
```

## Nächste Schritte

- [Services und Abhängigkeiten](./service.md) — eine Fähigkeit für andere Plugins bereitstellen
- [Event-System](./events.md) — zwischen Plugins kommunizieren
- [Cordis-Tutorial](../../../cordis-tutorial/index.md) — derselbe Lebenszyklus, dieselben Services und Events, Schritt für Schritt gegen die Cordis-Laufzeit aufgebaut
