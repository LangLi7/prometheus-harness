---
kind: upgrade-guide
description: "Session working directories replace built-in cwd configuration, and tool presentation metadata also runs for nested PTC calls."
---

# Migrate working-directory configuration and tool presentation

[English](guide.md) | 中文

## Change

The next release removes the loop's built-in `{{cwd}}` prompt variable and the `cwd` configuration key from `@deepseek-ai/dsh-subagent-acp` and `@deepseek-ai/dsh-subagent-dsh-sdk`. Custom prompt templates that retain an unresolved `{{cwd}}` fail before a model request is sent. A Session's current execution directory is supplied as required user context and is persisted separately from its original `Session.header.cwd`.

New subagents use the `cwd` explicitly provided in the start request, otherwise they capture the parent's current directory. Existing processes keep their own directories. Switching the execution directory changes neither the original project nor the write permissions granted.

Tool `output.presentationMeta` also runs for successful nested PTC calls. Only authors whose projection assumes native top-level calls need to adjust their implementation. A projection error fails that nested call with `ToolOutputError`; the canonical values read by programs and the model content remain unchanged.

## Migration

1. In home, profile, or invocation `personaSuffix` configuration and in a preset's `suffix` field, remove the directory clause that references `{{cwd}}`, retaining the other text. Omit or clear the field when the suffix becomes empty. The [working-directory service](../../../../packages/session/working-directory/README.zh.md) supplies the directory context.
2. Remove `config.cwd` from the ACP and DSH-SDK subagent provider rows in your profile patch. To select a directory for an individual subagent, pass `cwd` in its [start request](../../../subsystems/subagent.zh.md). To change the parent's execution directory, call `working_directory({ cd: "/absolute/project" })` before starting the subagent.
3. Call `working_directory({})` in the affected Session and confirm the reported directory. Start a subagent without a directory override and check its execution directory; when the subagent needs another checkout, provide the start `cwd` explicitly. Read `Session.header.cwd` only for the original project identity or permission roots, and use the working-directory service for current-directory operations.
4. Keep custom `output.presentationMeta` projections pure, and return JSON-safe metadata from the call arguments and the canonical result. Exercise a native call and a nested PTC call separately, and confirm that the recorded metadata identifies the operation's actual target without changing the call result.

Dynamic context providers are evaluated again at request admission, later than pre-step listeners and route preparation. Return current state rather than relying on one evaluation per step. Transform already-registered context inside its own provider; an admission refresh replaces the cached text while preserving the context contributed by assembly alone, as well as the accepted system prompt, tool schemas, and variables.
