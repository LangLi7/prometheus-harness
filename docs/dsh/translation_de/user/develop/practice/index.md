# Design einer Fähigkeit mit drei Rollen

English | [中文](index.zh.md)

Diese Seite hat zwei Teile: eine Konzeptreferenz für das Fähigkeitsmuster mit drei Rollen, gefolgt von einem fortgeschrittenen Tutorial, das eine Fähigkeit aufbaut. Zuerst den [grundlegenden Plugin-Pfad](../basic/index.md) und das [Services-Tutorial](../framework/service.md) abschließen.

## Konzeptreferenz

Wenn eine Fähigkeit allgemein genug ist, um austauschbare Provider zu benötigen, wie etwa Bash-Ausführung, trennt Harness drei Rollen: eine **Service Definition**, einen **Service Provider** und einen **Consumer**. Die Rollen gehören in getrennte Pakete, wenn sie sich unabhängig weiterentwickeln oder ersetzt werden müssen; andernfalls darf ein Paket mehr als eine Rolle besitzen. Die vollständige Fähigkeit ist ihre Nahtstelle. Keine einzelne Rolle ist eine Nahtstelle.

## Bash-Beispiel

Die Fähigkeit zur Bash-Ausführung besteht aus:

- **Service Definition** (`dsh-shell`) — definiert den Cordis-Service sowie die Bash-Anfrage- und -Ergebnistypen
- **Service Provider** (`dsh-bash-local`) — führt Befehle auf der lokalen Maschine aus
- **Consumer** (`dsh-tool-bash`) — stellt die Fähigkeit als modellaufrufbares Tool bereit

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  dsh-shell   │────▶│  dsh-bash-local  │     │ dsh-tool-bash│
│(definition) │     │    (provider)     │     │(consumer/tool)│
└─────────────┘     └──────────────────┘     └──────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
                    inject: ['shell']
```

## Vorteile der Aufteilung

### Provider austauschen

Eine Service Definition kann mehrere Provider haben, die über `cordis.yml` ausgewählt werden:

```yaml
# Local execution
- name: '@deepseek-ai/dsh-bash-local'

# Replace this row with another package that provides the same service.
```

Die Service Definition und das Tool bleiben unverändert, während der Provider wechselt.

### Unabhängig weiterentwickeln

- Die Service Definition ändert sich selten, nachdem Aufrufer von ihrem Vertrag abhängen.
- Service Provider können Leistung und Sicherheit unabhängig verbessern.
- Consumer können ändern, wie sie die Fähigkeit für das Modell darstellen.

### Abhängigkeiten entkoppeln

- Der Service Provider hängt von der Service Definition ab.
- Der Consumer hängt von der Service Definition ab.
- Der Service Provider und der Consumer **hängen nicht voneinander ab**.

Die [capability-seam-Referenz](../../../capability-seams.md) führt die aktuellen integrierten Familien und Paketlinks.

## Tutorial: eine Fähigkeit mit drei Rollen entwickeln

### Schritt 1: die Service Definition schreiben

```ts ignore-check
// packages/my-cap/my-cap/src/index.ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    myCap: MyCapService
  }
}

export abstract class MyCapService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myCap')
  }

  /** Execute the capability. */
  abstract execute(request: MyCapRequest): Promise<MyCapResult>
}

export interface MyCapRequest {
  input: string
}

export interface MyCapResult {
  output: string
}
```

### Schritt 2: einen Service Provider schreiben

```ts ignore-check
// packages/my-cap/my-cap-local/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { MyCapService, type MyCapRequest, type MyCapResult } from '@deepseek-ai/dsh-my-cap'

class MyCapLocal extends MyCapService {
  async execute(request: MyCapRequest): Promise<MyCapResult> {
    // Local provider behavior.
    return { output: request.input.toUpperCase() }
  }
}

export const name = 'my-cap-local'

export function apply(ctx: Context) {
  ctx.plugin(MyCapLocal)
}
```

### Schritt 3: einen Consumer schreiben

```ts ignore-check
// packages/my-cap/tool-my-cap/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-my-cap'
export const inject = ['tools', 'myCap']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'my_cap',
    description: 'Execute my capability.',
    parameters: {
      input: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const result = await ctx.myCap.execute({ input: args.input })
      return result.output
    },
  }))
}
```

### Sie in cordis.yml zusammensetzen

```yaml
- name: '@deepseek-ai/dsh-my-cap-local'
- name: '@deepseek-ai/dsh-tool-my-cap'
```

## Design-Punkte

- **Nicht präventiv aufteilen** — getrennte Pakete nur verwenden, wenn die Rollen sich unabhängig weiterentwickeln müssen. Ein einfaches Tool-Plugin tut das nicht.
- **Die Service Definition besitzt die Request-/Result-Typen** — Service Provider und Consumer hängen nur vom Paket der Service Definition ab.
- **Explizit > implizit** — Standardwerte in einem expliziten Schritt `resolve(request): Spec` auflösen, statt `?? default`-Ausdrücke in `run()` zu verbergen.

## Nächste Schritte

- [LLM-Adapter](./llm-adapter.md) — einen LLM-Provider implementieren
