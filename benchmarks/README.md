# Benchmarks

Performance gates for user-facing paths. This directory was inherited empty from
the reference harness; this file records what each gate is for, which ones can run
today, and what blocks the rest.

## Running

```sh
bun benchmarks/session-open/lauf.mjs     # one gate
bun benchmarks/messtechnik/lauf.mjs      # the measurement rig itself
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
| Scaling work must not allocate proportionally to `n` | measured: an `n`-sized array made the same ×10 step read anywhere from ×6.25 to ×14.02, because the gate was timing the garbage collector |
| A timing judgement belongs in a gate, not in `bun test` | measured: a real-scaling test inside `bun test` was green in one run and red in the next on unchanged code, because 30 test files run concurrently |

## The gates

| Gate | Measures | Status |
|---|---|---|
| `session-open` | write, read, parse, and fold a session | **runs** |
| `messtechnik` | the measurement rig itself: separation of linear from quadratic work, resolution floor, warm-up effect, statistics on live numbers, and the four ways of getting an event stream onto disk | **runs** |
| `db-last` | the write load of the PostgreSQL schema: what the per-message counter `UPDATE` costs. Creates its own throwaway database, runs the scenarios, and drops it again | **runs** (needs the project stack) |
| `conversation-fold` | folding a long transcript in the browser | blocked — needs the conversation UI |
| `agent-continuation` | resuming an interrupted agent turn | blocked — needs the chain wired into an application |
| `active-stream-reconnect` | stream recovery after a dropped connection | blocked — needs a live Remote stream |
| `long-session-browser` | the interface with a very long session | blocked — needs the browser harness |
| `session-corpus` | reading a corpus of many sessions | blocked — needs a session corpus |
| `terminal-io` | terminal round trips | blocked — needs the terminal surface |
| `support` | the measurement primitives themselves | **runs** (as tests) |

The blocked gates stay empty on purpose. A gate that measures nothing and reports
green is worse than a missing one: it takes the place of the real check.

## Why `messtechnik` exists — and what it cost to get right

A benchmark rig whose own calibration was never measured is a rig that reports
confident numbers about nothing. On 13.10.2026 the rig calibration was measured,
and it produced four findings. All on Windows native under Bun 1.4.0, six
repetitions per case, `aufwaermen: 3`, `laeufe: 5`:

**1. Allocation, not the algorithm, was being timed.** The linear work built an
`n`-element array, so the 20M case allocated 160 MB.

| Work at ×10 input | Measured time ratio |
|---|---|
| array of length `n` | ×6.25 · ×7.03 · ×7.42 · ×7.61 · ×7.73 · ×7.93 · ×8.03 · ×8.29 · ×8.43 · ×8.45 · ×8.83 · ×8.91 · ×8.95 · ×12.25 · ×13.24 · **×13.37** · **×14.02** |
| same 32 kB buffer reused, only the counter grows | ×10.03 · ×10.06 · ×10.11 · ×10.19 · ×10.25 · ×10.26 · ×10.51 · ×10.60 · ×10.61 · ×10.64 |

The large measurement moved between **43 and 76 ms** while the small one moved
between 3.8 and 7.4 ms — for identical work. The gate now reuses a buffer that
fits in L1 cache.

**2. The default tolerance ×1.25 is too tight for a real measurement.** ×10 input
produced up to ×13.37 of time — past the ×12.5 the default allows. The default was
chosen for the noise case at 0.15 ms; at 5 ms against 45 ms, clock, heap and cache
behave differently. The gate passes `TOLERANZ_LINEAR = 2.0` (allows ×20)
explicitly, and says so in its own source.

**3. A threshold was replaced by a measured separation.** "Linear is green" and
"quadratic is red" can each hold while the rig detects nothing, if the two limits
are set independently. The gate now measures both curves and asserts their
**distance**:

```
ok   Trennung: linear Überlinearität ×1.12 (2.15 → 24.08 ms) gegen quadratisch ×10.31 (1.74 → 179.32 ms) — Faktor 9.2 (nötig 3)
```

Over five consecutive runs the separation was ×6.4 to ×12.2 against a required
×3 — measured, not assumed.

**4. The first counter-check was a false pass.** The quadratic counter-check
originally read `ok === false` as "quadratic detected". At `von: 300` the small
measurement was **0.063 ms**, below the 1 ms floor, so `ok === false` meant "not
judgeable" — the check was green without detecting anything. It now requires the
verdict text to carry `ROT Skalierung` **and** to not contain `nicht beurteilbar`,
at `von: 2000` where the small measurement is 2.3–3.4 ms.

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
