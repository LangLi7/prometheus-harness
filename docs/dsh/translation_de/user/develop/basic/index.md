# Das erste Plugin

English | [中文](index.zh.md)

Dieses Tutorial erstellt ein minimales Harness-Plugin und lädt es in die Web UI. Ausgangspunkt ist ein Repository-Checkout, der den [run-from-source-Pfad](../../../../README.md#run-from-source) abgeschlossen hat.

## Ein lokales Projekt erstellen

Im Repository-Stammverzeichnis wird ein Scratch-Projekt für das Tutorial erstellt:

```sh
mkdir -p scratch-plugin/src
```

## Was ist ein Plugin?

In Harness ist ein Plugin ein TypeScript-Modul, das eine `apply`-Funktion exportiert. Das Framework ruft `apply` beim Laden des Plugins auf und übergibt ein `ctx`-Kontextobjekt, über das das Plugin Fähigkeiten registriert:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // Register capabilities here.
}
```

Das ist die vollständige Konfiguration.

## Die Plugin-Datei erstellen

`scratch-plugin/src/my-plugin.ts` erstellen:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  // Required dependencies are ready before apply runs.
  console.log('[hello-plugin] plugin loaded!')
}
```

## Registrierung in cordis.yml

Im Repository-Stammverzeichnis `pwd` ausführen und anschließend `scratch-plugin/cordis.yml` als Web-Overlay anlegen, das das lokale Plugin einfügt. `/absolute/path/to/deepseek-harness` unten durch den ausgegebenen Pfad ersetzen:

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'
```

Der Plugin-Pfad muss absolut sein. Eine Patch-Datei trägt Konfiguration bei, ändert jedoch nicht das Profil-Verzeichnis, aus dem der Loader Modulpfade auflöst.

Die Web UI mit diesem Overlay starten:

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

`http://127.0.0.1:3080` öffnen. Das Terminal gibt während des Starts `[hello-plugin] plugin loaded!` aus.

## Automatische Bereinigung

Alles, was über `ctx` registriert wird — Event-Listener, Tools oder Timer —, wird bereinigt, wenn das Plugin entladen wird. removeListener oder clearInterval müssen nicht manuell aufgerufen werden.

Für eine Ressource, die eine explizite Bereinigung benötigt, etwa eine Netzwerkverbindung, wird `ctx.effect()` verwendet, um ihren Disposer bereitzustellen:

```ts
import type { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log('heartbeat')
    }, 5000)

    // The returned function runs when the plugin unloads.
    return () => clearInterval(timer)
  })
}
```

## Abhängigkeiten deklarieren

Wenn das Plugin einen anderen Service wie `tools` oder `llm` nutzt, wird dieser in `inject` deklariert:

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools is ready here.
  ctx.tools.register(/* ... */)
}
```

Das Framework wartet auf jeden erforderlichen Service, bevor das Plugin geladen wird.

## Drei Plugin-Formen

Neben einem Funktionsmodul kann ein Plugin die Objekt- oder die Klassenform verwenden.

### Objektform

```ts
import type { Context } from '@deepseek-ai/cordis'

export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}
```

### Klassenform

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MyService extends Service {
  static inject = ['tools']

  constructor(ctx: Context) {
    super(ctx, 'myService')
    // Perform synchronous initialization in the constructor.
  }
}
```

Die Funktionsform ist in den meisten Fällen ausreichend. Die Klassenform wird verwendet, wenn das Plugin einen Service für andere Plugins bereitstellt; siehe [Services und Abhängigkeiten](../framework/service.md).

## Nächste Schritte

- [Ein Tool bauen](./tool.md) — die DSL zur Tool-Definition kennenlernen
- [Plugin-Konfiguration](./config.md) — Benutzerkonfiguration annehmen
- [Cordis-Tutorial](../../../cordis-tutorial/index.md) — das darunterliegende Plugin-Framework, aufgebaut aus einem Scratch-Verzeichnis ohne API-Schlüssel
