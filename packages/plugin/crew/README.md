# `@prometheus-harness/crew` — the crew as a plugin

> **Purpose.** Until 21 Oct 2026 the crew was an **entry without a surface**: `crew-plugin` hooked
> adapter, tools and booking into the host, the setting lived in `<home>/crew/config.json`, and
> changing it meant opening an editor. This package gives it what accounts, obsidian, graphify and
> usage already had: a **sidebar entry**, a **panel**, **routes** — and storage **per account** in
> PostgreSQL, with the file as a fallback.

## 1. What the package ships

| Surface | Address / place | What it does |
|---|---|---|
| read route | `GET /api/pmh/crew` | crews, settings and operating plan **of the signed-in account** |
| write route | `PUT /api/pmh/crew` | replace that account's state (session **and** CSRF) |
| panel | `src/index.tsx` → `lib/client.js` | add crews, bind roles, default, project, plan |
| host | `src/server.ts` | adapter at the core seam (`crew`), tools, booking |
| storage | `crew_definitionen`, `crew_einstellungen` | migration `0013_crew.sql` |
| bundle | `cordis.patch.yml` | one row, switchable in the plugin window |

## 2. Language — English first, German second

The panel reads its text through the DSH **language package** (`ctx.locale`). English is the
complete catalogue; German is typed against its keys in `src/locales.ts`, so a missing translation
fails the type check instead of silently falling back. The panel sends its active language with
every request (`?sprache=de`); the server answers **in English by default** — the routes, the
validation findings and the host's own messages all have an English source wording.

| Where | Language source |
|---|---|
| panel labels | `ctx.locale`, English catalogue first |
| panel → host | `?sprache=<active locale>` on every request |
| host → panel | findings and error texts in the requested language (English default) |
| host log (`stderr`) | German — it belongs to the operator, not the user |
| package description, this README | English |

## 3. Storage — why a database, and what the fallback is

The file was honest (“one store, one machine”) and right for **one** account. Prometheus is
multi-user (`conversation_sessions.user_id`, migration 0004) — and a file has no owner. Hence:

| Case | Behaviour |
|---|---|
| `DATABASE_URL` set | crews and settings **per account**; the panel writes; the routes require a session |
| no database | `<home>/crew/config.json` is **read**; the panel shows it, `PUT` answers **409** with the reason |

**The file is never written.** A write path that mutates a file without an owner would make tenant
separation a claim. Without a database, edit it by hand.

**The identifier is globally unique.** It is also the **model name** at the core seam; two accounts
with the same identifier would be two models with the same name. The second `PUT` gets **409**
instead of overwriting.

## 4. Who gets the models — and who gets the bill

The core knows **one** route `crew` and **one** model list. The adapter is therefore built from the
crews of **all active accounts**. Tools and booking, however, need **one** account — and the core
hands a tool no session (`ToolRunContext.agent.id` points at no account today). The order is the
decision:

1. `PMH_CREW_NUTZER` (identifier) — the explicit setting;
2. the **only** account;
3. the **only active admin** (the role that runs an installation);
4. otherwise **models only** (`nurAdapter`) — tools and booking are dropped, and the reason is
   logged and returned by the route.

Measured on 21 Oct 2026 in this home: **one** admin, four further accounts → rule 3 applies,
`[pmh] pmh-crew: eingehaengt — Crew "crew-1", Nutzer "7777…", 4 Werkzeuge, Buchung am llm/stream`.

## 5. Installing it

**As a bundle (the intended way).** In the plugin window choose “add plugin” → local directory
`packages/plugin/crew`; it then appears under “Installed” and can be switched off individually.

**By hand** (the same thing the plugin manager does):

```jsonc
// <home>/profiles/web/package.json
"dependencies": { "@prometheus-harness/crew": "link:C:/…/packages/plugin/crew" },
"dsh": { "profile": { "bundles": [ …, "@prometheus-harness/crew" ] } }
```

Then link it (`mklink /J <home>\profiles\web\node_modules\@prometheus-harness\crew <repo>\packages\plugin\crew`)
and restart the host.

**Never both.** The package must **not** additionally sit in `scripts/profile-patch.mjs`: the core
throws on a duplicate `(kind, path)`, and the adapter throws `DUPLICATE_ADAPTER` when the route
`crew` is taken twice. The row there is therefore **removed** and replaced by the reasoning.

## 6. Checking it

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test packages/plugin/crew          # 16 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe test packages/crew/crew-store      # 21 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe test packages/crew/crew-plugin      # 19 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/plugin/crew/tsconfig.json                   # exit 0
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/plugin/crew/tsconfig.client.json            # exit 0
& C:\Users\Chang\.bun\bin\bun.exe packages/plugin/crew/build.mjs      # bundle + shape check
& C:\Users\Chang\.bun\bin\bun.exe run scripts/migrate.mjs             # version 13
```

## 7. Limits — measured, not omitted

1. **The plan belongs to the account, the tools to the operating account.** `crew_plan` writes
   under `<home>/crew/<operating user>/<crew>/<project>.json`; the panel reads the plan of the
   **signed-in** account. When both are the same (the normal case) it is one plan. With several
   accounts, a non-operating account sees its own (empty) plan; the operating plan is shown under
   “Operation”.
2. **Booking per account is not built.** The `llm/stream` waterfall books to the operating account;
   the core does not know which account triggered a crew request. Booking per crew would be
   possible (the adapter knows the requested crew), but it is **not** built.
3. **The tools know no session.** They address **one** crew and **one** project (the operating
   account's state). A session that picks another crew still gets this scope's plan — deliberately,
   because guessing would be worse than a named limit.
4. **No image part in our own seam.** The `vision` role reaches an image model through the **core**
   adapter; our own seam (`MessagePart`) has no place for it.
5. **`helper` stays selectable and unused** — as in the harness.

## 8. Where the numbers come from

| Number | Command |
|---|---|
| 16 checks of the plugin | `bun test packages/plugin/crew` |
| 21 checks of the store | `bun test packages/crew/crew-store` |
| version 13 | `bun run scripts/migrate.mjs` → “Schema aktualisiert: 1 Migration(en) (13)” |
| panel in the browser roster | `GET /?token=…` contains `prometheus-harness/crew` (measured 21 Oct 2026) |
| host wiring | start log: `[pmh] pmh-crew: eingehaengt — …` |
