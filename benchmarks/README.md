# Benchmarks

Performance gates for user-facing paths. This directory was inherited empty from
the reference harness; this file records what each gate is for, which ones can run
today, and what blocks the rest.

## Running

```sh
bun benchmarks/session-open/lauf.mjs     # one gate
bun benchmarks/lauf.mjs                  # all gates that can run
bun benchmarks/lauf.mjs --nur=session-open
```

A gate exits **0** when every budget holds and **1** when any does not. The exit
code is the verdict; the printed lines say which budget failed and why it exists.

## What a gate reports

Every measurement carries its spread and its run count. A bare number is not a
measurement:

```
ok   foldSession, 2000 Ereignisse: 0.09 ms (Median, 20 Läufe, Streuung 0.01 ms) gegen 60.00 ms
ROT  writeSession (flushEvery 1), 2000 Ereignisse: 616.43 ms (Median, 10 Läufe, Streuung 58.87 ms) gegen 250.00 ms
```

The rules behind that shape are in `support/messen.mjs` and each one is there
because a measurement went wrong without it:

| Rule | What it prevents |
|---|---|
| Warm-up before measuring, never counted | the first run costs **1.81×** under Bun and **1.25×** under Node — that is the compiler, not the work |
| Median, not mean | one outlier from another process moves a mean, not a median |
| Small inputs must take **≥ 1 ms** | below that, fixed costs dominate and the ratio is noise — measured: the same gate went ×8.81 and ×16.05 on one machine |
| Every number carries its spread | a bare number is a claim, not a measurement |
| A gate that throws counts as a finding | otherwise one error hides every remaining measurement |
| Missing measurement is reported, not zeroed | without `--expose-gc` the memory check says why it did not run |

## The gates

| Gate | Measures | Status |
|---|---|---|
| `session-open` | write, read, parse, and fold a session | **runs** |
| `conversation-fold` | folding a long transcript in the browser | blocked — needs the conversation UI |
| `agent-continuation` | resuming an interrupted agent turn | blocked — needs the chain wired into an application |
| `active-stream-reconnect` | stream recovery after a dropped connection | blocked — needs a live Remote stream |
| `long-session-browser` | the interface with a very long session | blocked — needs the browser harness |
| `session-corpus` | reading a corpus of many sessions | blocked — needs a session corpus |
| `terminal-io` | terminal round trips | blocked — needs the terminal surface |
| `support` | the measurement primitives themselves | **runs** (as tests) |

The blocked gates stay empty on purpose. A gate that measures nothing and reports
green is worse than a missing one: it takes the place of the real check.

## Why the numbers are not comparable to the reference

The reference runs timed code under **plain Node, never TSX**. Our packages are
TypeScript, and Node does not execute TypeScript directly, so these gates run
under Bun:

```
Laufzeit: node v26.3.0 auf win32
Hinweis: ausgeführt von Bun 1.4.0 — ein Vergleich mit Node-Werten ist nicht zulässig
```

That line is printed by every gate. The numbers here are valid **against
themselves** — a regression over time — and against nothing else.

## What the first run found

`session-open` was written before the chain was wired, so it measures a library
path rather than an agent. It found one reproducible defect on its first correct
run:

```
writeSession (flushEvery 1),    2000 events:  ~600–632 ms   ROT  (budget 250 ms)
writeSession (flushEvery 256),  2000 events:   ~9.4–12.0 ms  ok
```

The default flushes **every event**, so 2000 events become 2000 `appendFile`
calls. Isolated, over 500 lines of 280 bytes:

| Operation | Duration |
|---|---|
| 500 × `appendFile`, one at a time | **97.3 ms** |
| 1 × `writeFile`, batched | **0.4 ms** |
| 500 × `appendFile` chained | 99.6 ms |

A factor of 240 — and chaining does not help, so this is the **number of calls**,
not their order and not an `fsync`. The batched path already exists and is
documented; the **default** is what costs 60×.

Every measurement above comes from `benchmarks/session-open/lauf.mjs` on Windows
native under Bun 1.4.0.
