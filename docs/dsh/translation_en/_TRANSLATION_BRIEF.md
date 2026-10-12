# Translation brief: dsh docs, Chinese → English

Read this file before translating anything. It applies to every worker on this job.

## Paths

- Sources (READ-ONLY, never modify): `C:\Users\Chang\prometheus-harness\docs\dsh\original\`
- Outputs (write here): `C:\Users\Chang\prometheus-harness\docs\dsh\translation_en\`
- A source `original\<relative>\foo.zh.md` is written to `translation_en\<relative>\foo.zh.md`.
  Same relative path, same file name (keep `.zh.md`).

## Hard rules

1. Do not modify anything under `original\`. Never run a shell command under `C:\Users\Chang\harness` — that directory is an inviolate reference template.
2. Translate the **complete** file. Nothing omitted, nothing summarized, nothing invented. Every paragraph, table cell, list item, sentence, and frontmatter description is translated.
3. Preserve structure exactly: heading levels and order, list kinds, ordered-list start numbers, list item counts, table rows and column counts, anchor IDs, HTML comments, generated-region markers, blockquote markers, and line-per-paragraph layout (one physical line per paragraph, exactly one trailing newline). Do not reflow, wrap, merge, split, or reorder anything.
4. Keep byte-identical: every fenced code block (``` … ```) including its info string and all comments inside, every inline code span, shell commands, JSON/YAML payloads, file paths, `@deepseek-ai/dsh-*` package names, config keys, event names, field names, type names, version numbers, hashes, and URLs.
5. Language switcher line: the first structural line of a paired document is a switch line such as `[English](foo.md) | 中文` (after any YAML frontmatter). Copy it **exactly, character for character** — it is not translated, and its link target is not changed.
6. Relative links: the link target stays exactly as written (including a `.zh.md` target or a `#fragment` suffix). Translate only the link text.
7. Preserve the HTML anchor `<a id="..."></a>` lines and link to anchors unchanged, so the table of contents keeps working.
8. Terminology: see the table below. Use the English technical term; add no Chinese glosses or pinyin.

## Frontmatter

Translate only human-readable prose values in YAML frontmatter — typically `description:` — keeping the key, the quoting style, and all other lines untouched. Machine keys and values stay verbatim:

```yaml
kind: persistence-release
tag: dsh-v0.1.2-alpha.4
previous: dsh-v0.1.2-alpha.3
sessionFormatVersion: 0
root: SessionHeader
```

For a file that starts with `---`, the switcher line still appears below the frontmatter; keep that position.

## Voice

- Concise, professional English developer prose — the register of the English side of this documentation set.
- State what the source says: same facts, same caveats, same conditions, same tense and modality, same active/passive stance. No added behavior, prerequisites, warnings, or examples.
- Restructure sentences where English grammar demands it, but lose no clause. Terse stays terse.
- Keep structural keys, generated-block markers, and status labels (for example `review-required`, `property-removed`) in English exactly as they appear.
- Repo Markdown conventions for `.md` files apply here too: one physical line per paragraph.

## Terminology (English side)

Use these renderings. A listed term must follow its row.

| Chinese | English |
|---|---|
| 持久化 | persistence |
| 会话 | Session (capital S when it names the persisted entity) |
| 写入格式 / Session 写入版本 | write format / Session write version |
| 根类型 | root type |
| 类型 | type |
| schema | schema |
| 快照 | snapshot |
| 发行版本 / 发行来源 | release / release evidence |
| 回填 | backfill |
| 声明 | Declaration |
| 结构变化 | Structural changes |
| 校验 | Verification |
| 概述 | Summary |
| 开发备注 | Developer note |
| 目录 | Contents (table of contents) |
| 前一版本 | Previous version |
| 源码 tag | Source tag |
| 源码日期 | Source date |
| 发行记录 | Release record |
| 完整重建清单 | Full rebuild inventory |
| 本条快照 | This snapshot |
| 兼容性确认 | compatibility confirmation |
| 迁移 | Migration / migrate |
| 变更 | Change |
| 工具调用 | tool call |
| 工具结果 | tool result |
| 工具 schema | tool schema |
| 提示词 | prompt |
| 系统提示词 | system prompt |
| 上下文 | context |
| 子代理 | subagent |
| 工作目录 | working directory |
| 执行目录 | execution directory |
| 权限 | permission |
| 配置键 | config key |
| 配置 | configuration |
| 事件 | event |
| 事件日志 | event log |
| 会话事件 | session event |
| 轮次 | turn |
| 步骤 | step |
| 包 | package |
| 插件 | plugin |
| 模块 | module |
| 流水线 | pipeline |
| 注册表 | registry |
| 约定 | contract |
| 扩展点 | extension point |
| seam | seam |
| 能力 | capability |
| 功能 | feature |
| 提供方 | provider |
| 模型提供商 | model provider |
| 适配器 | adapter |
| 实现 | implementation |
| 覆盖 | coverage |
| 门禁 | gate |
| 校验（检查） | verification / check |
| 生成区块 | generated region |
| 规范图 | canonical graph |
| 摘要 | hash (when it means a digest); Summary (when it is a section heading) |
| 根摘要 | root hash |
| 可达类型 | reachable type |
| 相邻版本 | neighbouring versions |
| 禁止 | forbidden |
| 仅追加 | append-only |
| 快照覆盖 | snapshot coverage |
| 双语机器声明 | machine-readable bilingual declaration |

For any term not listed, use the established English technical term; if there is no unambiguous equivalent, keep the original with a short gloss rather than inventing a rendering.

## Use the English sibling as a reference

Most files have an English counterpart next to the Chinese one, for example:

- `original\persistence-changes\releases\dsh-v0.1.2-alpha.4.md` next to `…dsh-v0.1.2-alpha.4.zh.md`
- `original\upgrade-guide\v0.2.1-alpha.1\working-directory\guide.md` next to `…\guide.zh.md`
- `original\persistence-changes\historical-formats\v3.md` next to `…\v3.zh.md`

Read it for terminology choice, sentence rhythm, and section-wording conventions. Do **not** copy it wholesale and do **not** treat it as the translation source: translate from the Chinese, and where the sibling is worded differently but means the same thing, the sibling's wording is usually the better choice because it is the reviewed English voice. If the sibling is missing something the Chinese has, translate that part yourself.

## Historical format files (v0.zh.md … v3.zh.md) and large schema documents

These are ~170–190 KB with mostly embedded schema definitions:

- Translate the prose, headings, table cells, list items, frontmatter description, and explanatory comments that are in Chinese.
- Keep schema fields, property names, type names, enum values, example payloads, and code blocks verbatim.
- A very large embedded block of machine-generated content stays as it is; wherever Chinese text appears inside prose, translate it.

## Finishing checks before you finish

- The output file is no shorter in structure than the source: same heading count, same list item count, same table row and column count.
- No Chinese characters remain anywhere in the output, except inside the language switcher line and inside code blocks or code spans that were Chinese in the source.
- Exactly one trailing newline; if the source ends with a newline, so does the output.
- Cross-check the file: re-read the source section by section and confirm each one landed in the output.
