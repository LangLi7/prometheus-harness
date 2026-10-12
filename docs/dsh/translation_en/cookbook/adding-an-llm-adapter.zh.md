# Cookbook: adding an LLM adapter

[English](adding-an-llm-adapter.md) | 中文

How to connect a new model provider. Reference implementations: `packages/llm/llm-deepseek` (direct HTTP, with SSE (Server-Sent Events) framed by `eventsource-parser`) and `packages/llm/llm-pi-ai` (wraps an LLM library). Read the `StreamChunk` documentation in `packages/llm/llm/src/types.ts` first — it records the protocol conventions both adapters were validated against.

## Basic shape

```ts ignore-check
class MyAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> { … }
}

export const name = 'llm-myprovider'
export const inject = ['llm']
export const Config: z<Config> = z.object({ apiKey: z.string(), … })

export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(['my-provider'], new MyAdapter(…))
}
```

Registration is effect-based and safe for HMR (hot module replacement); each provider route maps to exactly one adapter, a duplicate registration throws, and a multi-route registration either succeeds entirely or fails entirely. `options.provider` selects the adapter and `options.model` is the provider model ID, so an adapter with a dynamic model catalog can offer new models without a configuration lifecycle change. Keys are managed the Cordis-native way: a schemastery Config with an environment-variable fallback, injected through `!!js process.env.MY_KEY` in cordis.yml. Never read a self-invented key file from code.

## Protocol obligations (conventions both implementations were validated against)

- Emit `usage` **before** `finish`; emit **nothing after** `finish`. The robust approach: buffer finish/usage until the provider's end-of-stream marker, then flush together (this handles providers that send a usage-only fragment at the end).
- A tool call's `arguments` is a raw JSON string throughout; streaming fragments are sent as `argumentsDelta`. If your provider returns an already-parsed object, re-stringify it at `block-end`.
- Assign each block's `index` in first-appearance stream order; every delta of the same block reuses that index.
- Errors have exactly two legitimate paths: **throw** from `stream()` (transport and protocol faults — use `LlmError` with a stable code), or end the stream with `finish {kind: 'error' | 'aborted'}` (in-band provider faults). Consumers handle both; choose the path by fault category and document it.
- Honor `options.signal` (pass it to fetch or to your SDK).
- If your provider cannot support a field in `GenerateOptions` (for example, it receives a `stop` list but does not support stop sequences): throw `LlmError(..., 'UNSUPPORTED_OPTION')` rather than dropping it silently.
- If the provider needs a response ID, a signature, or other native metadata on later calls, emit its minimal lossless JSON projection as `finish.replayState`. Validate that state when reconstructing history. `LlmRuntime` passes that state through only when the historical provider route and the target provider route are currently owned by the exact same adapter instance; whether same-model, cross-model, or cross-provider resumption is legitimate is the adapter's decision. When the state is missing, never infer native replay from the provider/model name alone.

A provider-specific thinking-mode switch still lives in the adapter's Config. Exact model metadata uses one provider-independent capability seam: implement `resolveModel()`, returning the provider/model identity plus optional `context` and `reasoning` fields; declare `defaultEffort` only when a configuration-specified default exists; honor the optional `AbortSignal` passed when the model is resolved. Reasoning effort is an ordered opaque ID that the adapter maps to the provider request. Keep the authoritative optional list the adapter supplies, including `off` where the adapter defines it as supported; do not expose the concrete spelling of the final protocol value, and do not silently adjust unsupported values. An ID need not match its protocol representation.

## Implementation structure

Give the wire format (protocol format) types, request serialization, transport parsing, chunk conversion, and the adapter class separate responsibilities; [`llm-deepseek`](../../packages/llm/llm-deepseek/README.zh.md) is the reference layout.

## Verification

Follow the [repository testing policy](../testing.zh.md), which owns adapter coverage, real-provider checks, and published-entrypoint requirements.
