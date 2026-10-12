# 7. Into the harness

[English](07-into-the-harness.md) | 中文

This chapter registers a model-callable tool with the harness `tools` service, drives it through the harness tool pipeline, and observes the result event. The whole example is keyless and never calls a model.

## The tool plugin

Create `greet-tool.ts` and put it in `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // Drive one call through the real execution pipeline, standing in for
  // the model. ToolCallId brands the correlation id a provider would issue.
  void (async () => {
    const result = await ctx.tools.execute({
      callId: brandString<ToolCallId>('demo-1'),
      name: 'greet',
      arguments: { name: 'Cordis' },
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.content))
  })()
}
```

Every pattern here comes from earlier chapters: `inject: ['tools']` ([chapter 3](03-services.zh.md)) makes the plugin wait for the tool registry to be ready, and `ctx.tools.register(...)` attaches the registration disposer to the plugin ([chapter 2](02-lifecycle-and-effects.zh.md)), so unloading unregisters the tool. `defineTool` converts the `parameters` declaration into the JSON Schema shown to the model, derives the type of `args`, and validates the model-supplied arguments before `execute` runs. The tool returns the canonical value declared by `output.schema`; `output.render` acts as a Native renderer (native renderer) and separately produces the persistable result content.

## The observer plugin

Create `tool-logger.ts`. It is a separate plugin that observes every tool call in the application through the harness `tools/result` event:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
```

The line `import type {} from '@deepseek-ai/dsh-tools'` pulls in that package's declaration merging so `'tools/result'` and its payload are typed. This is the same move as importing `stats.ts` in chapter 4, extended to package level.

## Compose and run

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './tool-logger.ts'
- name: './greet-tool.ts'
```

`@deepseek-ai/dsh-tools` injects the `systemPrompt` service, because tools contribute schemas to the system prompt, so the composition must also list a provider for that service. Without a provider, the tool plugin stays PENDING as described in [chapter 6](06-composition-and-hmr.zh.md).

```sh
node --import tsx ../../vendor/cordis/bin.js
```

```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

The logger fires first: `tools/result` is emitted during result materialization, before the promise `execute` returns to its caller settles. Neither plugin knows the other exists; the registry service and the event connect them.

## From here to a full agent

A real agent is this composition plus more plugins: LLM adapters, the agent loop, persistence, and an application entry point. Compare the [base profile layer](../../packages/bundle/base/cordis.patch.yml) with the [headless layer](../../packages/bundle/headless/cordis.patch.yml) and you can now read every entry in them. Adding `greet-tool.ts` through a small `--patch` overlay is enough.

Further reading:

- [Building tools](../user/develop/basic/tool.zh.md): a deeper look at `defineTool`, including rendering and richer schemas.
- [Three-layer capability design](../user/develop/practice/index.zh.md): how the harness organizes replaceable capabilities.
- The generated `cordis-surface` regions on the [subsystem pages](../subsystems/core.zh.md): everything you can inject and listen for, each on the page that owns it.
- [Architecture](../architecture.zh.md): the map of the system these plugins live in.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
