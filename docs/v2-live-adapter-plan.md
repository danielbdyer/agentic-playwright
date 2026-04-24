# Live Reasoning Adapter Plan (Step 11 Z11d)

> Status: planning — Step 11 Z11d. Architectural design doc;
> no code has landed. Companion to
> `docs/v2-compounding-engine-plan.md` and
> `docs/v2-substrate-study-plan.md`. Can be implemented in
> parallel with Z11f. Depends on Z11a (landed); unblocks Z11a's
> semantic-upgrade path for intervention-fidelity and the real-
> compile path for customer-compilation.

## 0. The verdict in one sentence

**Wire Claude-as-adapter behind the `Reasoning` port via a
file-mediated record / fill / replay triad with autotelic fill
triggers, enabling the compounding engine to measure a real
LLM's reasoning capability as live evidence — without scattering
`Effect.runPromise` across the runtime.**

## 1. Purpose and Scope

### 1.1 What this slice delivers

Three tightly-coupled infrastructure pieces:

1. **Record / fill / replay adapter pattern** behind the
   existing `Reasoning` port at `product/reasoning/reasoning.ts`.
   - `RecordReasoning` adapter writes pending prompts to
     `.tesseract/reasoning-pool/pending/<fp>.json`, returns a
     tagged "needs-fill" error that halts only the current step.
   - Fill pass (the Claude Code session) reads pending files,
     authors responses, writes to
     `.tesseract/reasoning-pool/filled/<fp>.json`.
   - `ReplayReasoning` adapter reads from `filled/`, synthesizes
     a real `ReasoningReceipt<Op>` with `provider:
     'claude-code-session'` and returns.

2. **`/reasoning-fill` slash command + skill** (Claude Code
   integration): invoked manually or automatically, walks the
   pending pool, authors responses via a dispatched subagent so
   the main context stays clean.

3. **Autotelic triggers** (PostToolUse + Stop + UserPromptSubmit
   hooks in `.claude/settings.json`) + the built-in `/loop`
   skill at a 10-minute cadence. Settings-flag opt-out via
   `TESSERACT_REASONING_AUTOFILL=off`.

### 1.2 What this slice does NOT deliver

- **The OpenAI-live adapter**. Z11d is Claude-as-session only;
  other live providers are separate adapters behind the same
  port.
- **Measured token-accurate cost accounting**. Claude Code's
  usage stats aren't exposed via any API the harness can read;
  tokens are *estimated* (char-count ÷ 4) and tagged as
  `tokensSource: 'estimated'`. Precise accounting is either
  Claude Code harness evolution work (external to this repo)
  or a follow-on epic.
- **Proof-of-convergence against a real customer SUT**. Z11d
  produces real reasoning evidence; whether that evidence
  improves compounding-scoreboard metrics is a downstream
  measurement, not a Z11d deliverable.
- **Fine-grained latency measurement**. Session cadence ≠ API
  cadence. `latencyMs` is set to `null` with a
  `latencyMeasured: false` flag.
- **Automatic retry against failed fills**. If my fill produces
  a malformed response (e.g., JSON parse error when the
  operator expects structured output), the strategy falls back
  to `RecordReasoning` behavior on the next run. No auto-retry
  loop; operator decides whether to re-fill or accept the
  handoff.

### 1.3 Guiding principles (standing rules)

- **Matchers stay pure; Effect lives at the port**. Same
  principle as Z11a.4a. No Reasoning imports inside matchers.
- **The `Reasoning` port's signature does not change**. We add
  new adapter implementations; the three operations
  (`select`, `interpret`, `synthesize`) + `ReasoningReceipt<Op>`
  envelope stay exactly as they are per CLAUDE.md.
- **Every fill produces a real receipt**. No stub receipts; no
  "pretend this was an API call" — if Claude-as-session
  authors the response, the receipt says so, honestly.
- **Fingerprint is the reproducibility contract**. Identical
  prompts produce identical fingerprints → cache hits produce
  deterministic replay. Non-deterministic prompts (wall-clock,
  UUIDs in template) are a design bug at the call site, not a
  Z11d concern.
- **Subagent dispatch for main-context hygiene**. The
  `/reasoning-fill` skill spawns a subagent to drain the pool;
  the subagent's work products land on disk as filled receipts;
  the main session sees only a short completion summary.
- **Opt-out is one flag**. `TESSERACT_REASONING_AUTOFILL=off`
  disables all autotelic triggers. Manual `/reasoning-fill`
  continues to work.
- **File-based handoff + atomic temp-rename writes**. Same
  pattern as the existing MCP decision bridge. Race-safe by
  construction.

### 1.4 Success in one line

**By end-of-Z11d: a `tesseract compile --reasoning-mode replay`
run (and `compile-corpus`) consumes cached reasoning responses
from `.tesseract/reasoning-pool/filled/`, synthesizes real
`ReasoningReceipt<'select'|'interpret'|'synthesize'>` values
with `provider: 'claude-code-session'`, produces a
ResolutionReceipt stream that genuinely differs from the
heuristic-Z11a5 receipts — and the customer-compilation
cohort's resolvable trajectory shows a cycleRate that varies
from 1.0 because real reasoning has real failure modes.**

## 2. Ubiquitous Language

- **Fill pass**: the Claude Code session draining the pending
  pool. Triggered manually (`/reasoning-fill`) or autotelically
  (hooks + `/loop`).
- **Reasoning pool**: the filesystem surface at
  `.tesseract/reasoning-pool/` with `pending/`, `filled/`, and
  `rejected/` subdirectories.
- **Prompt fingerprint**: content-addressed hash of
  `(op, prompt-text, model, temperature, closed-params)`. The
  reproducibility + cache-hit key.
- **`RecordReasoning` adapter**: writes pending requests, halts
  the current call with a tagged error. First-stage adapter.
- **`ReplayReasoning` adapter**: reads filled responses, returns
  `ReasoningReceipt`. Second-stage adapter.
- **`ClaudeCodeSessionReasoning` adapter** (composite): tries
  `ReplayReasoning` first; on cache miss, falls back to
  `RecordReasoning` behavior. The end-to-end useful form.
- **Provider variant `'claude-code-session'`**: new entry in
  the `ReasoningReceipt.provider` enum, distinct from
  `'claude-api-stateless'`. Session context carries CLAUDE.md
  + conversation state that a stateless call does not.
- **`tokensSource` stamp**: `'estimated' | 'measured' | 'unknown'`
  enum on the receipt. Z11d writes `'estimated'` unconditionally.
- **Autotelic trigger**: a hook or `/loop` entry that causes the
  fill pass to run without explicit operator invocation.
- **Subagent-dispatched fill**: the pattern where
  `/reasoning-fill` spawns a `general-purpose` subagent to
  perform the drain, keeping main context clean.
- **Fill skeleton**: the prompt template each pending request
  carries, guiding the subagent's response authoring.
- **Response envelope**: the JSON artifact the subagent writes
  under `filled/<fp>.json` — carries response text,
  estimatedTokens, reasoningSummary, authorSessionId,
  emittedAt.

## 3. Invariants

### 3.1 I-PortShape (Reasoning Port Unchanged)

**The `Reasoning` port's three operations retain their exact
current signatures.** New adapters implement the existing
interface; no port-level changes. This guarantees existing
callsites don't need edits.

### 3.2 I-ReceiptShape (ReasoningReceipt Unchanged Except for
Additive Enum Widenings)

**`ReasoningReceipt<Op>` retains its shape.** Two additive
changes:
- `provider` enum gains `'claude-code-session'`.
- `tokensSource` field added (optional; defaults to
  `'unknown'` for pre-existing receipts).

### 3.3 I-Fingerprint (Deterministic Fingerprint)

**`promptFingerprint(op, prompt, model, params)` is a pure
function; same inputs → same fingerprint.** Callsites that
embed wall-clock or UUIDs in prompts lose cache hits by design
— that's their bug, not Z11d's.

### 3.4 I-AtomicWrite (Race-Safe File Operations)

**All pool writes use write-to-temp → fsync → rename.** Same
atomicity discipline the MCP decision bridge uses. Prevents
torn reads under concurrent fill + compile.

### 3.5 I-Append (Append-Only Receipt Log)

**Filled responses accumulate in `filled/`; never overwritten.**
If a fill is re-authored (rare, e.g., operator corrects a bad
fill), the correction lands as a new file with a
`supersedes` pointer; the original stays for audit.

### 3.6 I-OneBoundary (Single runPromise Boundary)

**Exactly one `Effect.runPromise` call exists under Z11d — at
the `/reasoning-fill` skill's entry point in
`scripts/reasoning-fill.ts`.** The adapter internals are
Effect-native.

### 3.7 I-OptOut (Autotelic-Off Toggle)

**`TESSERACT_REASONING_AUTOFILL=off` disables all hooks + the
`/loop` entry.** Required for CI contexts where autotelic
fills are inappropriate (e.g., batch builds without a live
session).

### 3.8 I-Provider (Provider Distinction)

**`'claude-code-session'` is a distinct provider from
`'claude-api-stateless'`** even when the underlying model is
identical. Session context (CLAUDE.md, conversation state)
makes them measurably different reasoners; conflating them
would hide real signal about prompt-priming value.

## 4. Domain Model

Pure types under `product/reasoning/` (adapter internals) +
`workshop/reasoning-pool/` (pool management). The `Reasoning`
port itself stays unchanged.

### 4.1 Pool request + response shapes

```typescript
// product/reasoning/pool/pending-request.ts

import type { ReasoningOp } from '../reasoning';

export interface PendingRequest {
  readonly promptFingerprint: string;         // content-addressed
  readonly op: ReasoningOp;                   // 'select' | 'interpret' | 'synthesize'
  readonly requestedAt: string;               // ISO-8601
  readonly model: string;                     // target model id
  readonly temperature: number;
  readonly promptText: string;                // full prompt for the fill pass
  readonly closedParams: Readonly<Record<string, string>>;  // stable param bag
  readonly callsite: {
    readonly module: string;                  // e.g., 'parser', 'bind-step'
    readonly purpose: string;                 // short human label
  };
  readonly expectedResponseShape: {
    readonly kind: 'plain-text' | 'json-schema' | 'enum-token';
    readonly schema?: string;                 // JSON schema string when kind=json-schema
    readonly enumValues?: readonly string[];  // when kind=enum-token
  };
}
```

```typescript
// product/reasoning/pool/filled-response.ts

export interface FilledResponse {
  readonly promptFingerprint: string;
  readonly filledAt: string;
  readonly authorSessionId: string;           // Claude Code session id (if available)
  readonly response: {
    readonly text: string;                    // raw response
    readonly parsed?: unknown;                // if schema-validated
  };
  readonly reasoningSummary: string;          // one-line rationale
  readonly estimatedTokens: {
    readonly prompt: number;
    readonly response: number;
    readonly source: 'estimated' | 'measured' | 'unknown';
  };
  readonly supersedes?: string | null;        // prior fingerprint if correction
}
```

### 4.2 Pool error shape

```typescript
// product/reasoning/pool/errors.ts

export type PoolError =
  | { readonly _tag: 'NeedsFill';         readonly promptFingerprint: string; readonly pendingPath: string }
  | { readonly _tag: 'FilledMalformed';   readonly promptFingerprint: string; readonly reason: string }
  | { readonly _tag: 'FilledSchemaMismatch'; readonly promptFingerprint: string; readonly expected: string }
  | { readonly _tag: 'PoolIoFailed';      readonly path: string; readonly cause: string };

export function foldPoolError<R>(err: PoolError, cases: {
  readonly needsFill:            (e: Extract<PoolError, { _tag: 'NeedsFill' }>)            => R;
  readonly filledMalformed:      (e: Extract<PoolError, { _tag: 'FilledMalformed' }>)      => R;
  readonly filledSchemaMismatch: (e: Extract<PoolError, { _tag: 'FilledSchemaMismatch' }>) => R;
  readonly poolIoFailed:         (e: Extract<PoolError, { _tag: 'PoolIoFailed' }>)         => R;
}): R {
  switch (err._tag) {
    case 'NeedsFill':            return cases.needsFill(err);
    case 'FilledMalformed':      return cases.filledMalformed(err);
    case 'FilledSchemaMismatch': return cases.filledSchemaMismatch(err);
    case 'PoolIoFailed':         return cases.poolIoFailed(err);
  }
}
```

### 4.3 ReasoningReceipt additive widenings

Two changes to the existing `ReasoningReceipt<Op>` type:

```typescript
// product/reasoning/reasoning.ts — delta

export type ReasoningProvider =
  | 'composite-v1'
  | 'deterministic'
  | 'openai-api-stateless'       // future
  | 'claude-api-stateless'       // future
  | 'claude-code-session';       // NEW in Z11d

export interface ReasoningReceipt<Op extends ReasoningOp> {
  // ... existing fields unchanged
  readonly provider: ReasoningProvider;
  // ... existing fields unchanged
  readonly tokensSource?: 'estimated' | 'measured' | 'unknown';  // NEW; defaults to 'unknown' on pre-existing receipts
  readonly latencyMeasured?: boolean;                             // NEW; `false` for claude-code-session
}
```

Both additions are strictly additive; pre-existing receipts with
neither field remain valid.

## 5. Effect Architecture

### 5.1 Three adapter layers

All three implement the existing `Reasoning` port; composition
determines which is active.

```typescript
// product/reasoning/adapters/record-reasoning.ts
export function createRecordReasoning(options: {
  readonly poolDir: string;
}): Reasoning;
// attempt(): writes PendingRequest to pending/<fp>.json;
//   returns Effect.fail(ReasoningError.needsFill(...))

// product/reasoning/adapters/replay-reasoning.ts
export function createReplayReasoning(options: {
  readonly poolDir: string;
}): Reasoning;
// attempt(): reads filled/<fp>.json if exists; if present, builds
//   ReasoningReceipt<Op> with provider='claude-code-session' and
//   returns. If missing, returns Effect.fail(needsFill).

// product/reasoning/adapters/claude-code-session-reasoning.ts
export function createClaudeCodeSessionReasoning(options: {
  readonly poolDir: string;
}): Reasoning;
// Composed: tries replay first, falls through to record on miss.
// The end-to-end useful form.
```

### 5.2 ReasoningError widening

```typescript
// product/reasoning/errors.ts — delta

export type ReasoningErrorKind =
  | 'rate-limited'
  | 'context-exceeded'
  | 'malformed-response'
  | 'unavailable'
  | 'unclassified'
  | 'needs-fill';                // NEW: fill-pool adapter behavior

export interface NeedsFillError extends ReasoningErrorBase {
  readonly kind: 'needs-fill';
  readonly promptFingerprint: string;
  readonly pendingPath: string;
}
```

Updated `foldReasoningError` adds one case; every call site
that exhaustively folds must handle it. The compile pipeline's
existing catch-handler already converts unhandled
`ReasoningError` into a resolution `needs-human` receipt; the
new `needs-fill` case routes identically (same effect on the
pipeline: step halts, operator handles).

### 5.3 Composition

```typescript
// product/composition/local-services.ts — delta

// Adapter priority (unchanged from CLAUDE.md §Reasoning port):
//   1. Explicit injection.
//   2. 'ci-batch' profile → deterministic.
//   3. Z11d: if --reasoning-mode present → live adapter.
//   4. Default → composite bridge.

const reasoning =
  options?.reasoning ??
  (profile === 'ci-batch'           ? createDeterministicReasoning()
   : options.reasoningMode === 'replay' || options.reasoningMode === 'record'
                                    ? createClaudeCodeSessionReasoning({ poolDir })
   :                                   createCompositeReasoning({ translation, agent }));
```

### 5.4 Parallel-safety

- Pool reads are parallel-safe (no file is modified between
  read and the Effect's completion; reads are atomic).
- Pool writes use temp → fsync → rename. Concurrent compiles
  against the same prompt fingerprint will race to write the
  same pending file; rename atomicity means exactly one file
  lands and both callers see the same fingerprint. Both
  callers independently await the fill (each gets its own
  Effect.fail'd step); the fill, when it happens, resolves
  both.

## 6. The Fill Pass — `/reasoning-fill` skill

### 6.1 Skill metadata

```yaml
# .claude/skills/reasoning-fill.yaml

name: reasoning-fill
description: >
  Drain the .tesseract/reasoning-pool/pending/ directory by
  authoring responses to each pending request, writing results
  to filled/. Dispatches a subagent to keep main context clean.
triggers:
  - user: /reasoning-fill
  - hook: autotelic (see §7)
```

### 6.2 Drain protocol

1. Count files under `pending/`.
2. If zero, print "Nothing to fill" and exit.
3. If count > 0, dispatch a `general-purpose` subagent with
   prompt:

   > "Walk `.tesseract/reasoning-pool/pending/*.json`. For each,
   > author a response following the request's
   > `expectedResponseShape`. Write each response atomically
   > (temp + rename) to
   > `.tesseract/reasoning-pool/filled/<promptFingerprint>.json`
   > as a `FilledResponse` envelope. Report count drained + avg
   > response length, under 100 words."

4. Subagent returns its summary; print to stdout.

### 6.3 Why subagent dispatch matters

- **Main context stays clean**: the subagent's work is scoped;
  only the summary returns. Fills don't consume 10k tokens of
  main-thread context per run.
- **Parallelism**: the subagent can internally parallelize
  reads (not that it needs to — fills are sequential by nature).
- **Audit trail**: subagent spawn is logged in the
  transcript-dir output, preserving reproducibility.

### 6.4 Fill authorship quality

The subagent's reasoning quality is a function of:
- The prompt template carried in the pending request (clear
  prompts → good fills).
- The skill's authoring guidance (see §6.5).
- The subagent's context window (it starts fresh; no
  accidental carryover from main context).

The compounding engine's refutation signal catches quality
drift: if fills are systematically low-quality,
intervention-fidelity + confirmation-rate trajectories refute
→ `compounding-improve` flags it.

### 6.5 Subagent authoring guidance

The skill's prompt to the subagent includes these norms:

- **Respect the response shape**. If `kind='json-schema'`, emit
  valid JSON. If `kind='enum-token'`, emit one of the enum
  values exactly. If `kind='plain-text'`, free-form prose OK.
- **Short reasoning summaries**. `reasoningSummary` is one line;
  operators scan it for quality. Don't author a treatise.
- **Don't fabricate data**. If the prompt asks for information
  you don't have (e.g., "What's the customer's login URL?"),
  respond with a clear "I don't have this information; please
  resolve manually" — the response will surface as a
  `needs-human` handoff downstream, which is correct.
- **Estimate tokens honestly**. `promptLength / 4 +
  responseLength / 4` is the rough estimate. Accuracy to within
  2x is fine; the `tokensSource: 'estimated'` flag warns
  downstream consumers anyway.

## 7. Autotelic Triggers

Four layered triggers + one env-var kill switch. All triggers
invoke the `/reasoning-fill` skill (which handles the subagent
dispatch).

### 7.1 `/loop` time-based (primary)

```
# Operator starts once per session:
/loop 10m /reasoning-fill
```

The built-in `/loop` skill reinjects `/reasoning-fill` every 10
minutes. Runs while the operator is idle; drains backlog
automatically. Stopped by `/loop kill` or session end.

### 7.2 PostToolUse hook (opportunistic)

`.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash|Edit|Write",
        "command": "scripts/hooks/reasoning-fill-check.sh",
        "conditions": "file_count:.tesseract/reasoning-pool/pending/:>=3"
      }
    ]
  }
}
```

Script: emits a `<system-reminder>` if pending count ≥ 3. The
main session sees the reminder and invokes `/reasoning-fill`
at its next turn boundary.

### 7.3 Stop hook (invariant)

```json
{
  "hooks": {
    "Stop": [
      {
        "command": "scripts/hooks/reasoning-fill-drain-on-stop.sh"
      }
    ]
  }
}
```

Script blocks turn-end if pending count > 0, forcing a drain
before the turn completes. Enforces the invariant "never end a
turn with unfilled prompts."

### 7.4 UserPromptSubmit hook (nudge)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "command": "scripts/hooks/reasoning-fill-inject-reminder.sh"
      }
    ]
  }
}
```

On each user prompt, script injects a short reminder if
pending > 0. Low-friction, won't consume significant context.

### 7.5 Kill switch

`TESSERACT_REASONING_AUTOFILL=off` environment variable:
- Read at settings-hook-script top.
- When off, all four triggers skip (no reminders, no blocks, no
  loop).
- `/reasoning-fill` invoked manually still works.

Per-repo default: on. Per-session opt-out via:
```bash
TESSERACT_REASONING_AUTOFILL=off claude
```

### 7.6 Interaction between triggers

| Scenario | Active trigger |
|---|---|
| Idle session | /loop (every 10m) |
| Active work; pending backlog > threshold | PostToolUse reminder |
| User types a prompt | UserPromptSubmit (passive reminder) |
| User ends turn with unfilled prompts | Stop hook forces drain |
| `AUTOFILL=off` | Manual `/reasoning-fill` only |

Overlap is fine — multiple triggers firing just means the pool
gets drained sooner. Idempotency (dedup on fingerprint) means
no duplicate work.

## 8. Cache + Replay Semantics

### 8.1 Fingerprint computation

```typescript
export function promptFingerprint(
  op: ReasoningOp,
  promptText: string,
  model: string,
  temperature: number,
  closedParams: Readonly<Record<string, string>>,
): string {
  return taggedFingerprintFor('reasoning-pool-key', {
    op,
    promptText,
    model,
    temperature,
    closedParams,  // already-sorted object via stableStringify
  });
}
```

- Closed-params must be sorted (stableStringify handles this).
- PromptText must not carry wall-clock or UUIDs that vary per
  call — those are call-site bugs that cause cache misses.

### 8.2 Cache-hit flow

```
Reasoning.select(req)
  ↓
ReplayReasoning.select(req)
  ↓
fingerprint := promptFingerprint(req)
  ↓
Is .tesseract/reasoning-pool/filled/<fingerprint>.json present?
  ├── yes → read FilledResponse → build ReasoningReceipt → return
  └── no  → Effect.fail(NeedsFill)
              ↓
            ClaudeCodeSessionReasoning composite falls through:
              ↓
            RecordReasoning.select(req)
              ↓
            Write pending request; Effect.fail(NeedsFill)
              ↓
            Current compile halts at this step; needs-human
            receipt produced upstream.
              ↓
            (Operator or autotelic trigger: /reasoning-fill)
              ↓
            Next compile run: cache hit; proceed.
```

### 8.3 Drift detection

New fingerprint tag `'reasoning-pool-key'` registered in
`product/domain/kernel/hash.ts`. Cross-run drift is detectable
via receipt fingerprints: if the same prompt + model produce
different responses across runs, their receipts have different
`fingerprints.artifact` values even though `promptFingerprint`
matches. The compounding engine can track this as "replay
determinism" — a new prediction kind worth adding later
(deferred).

## 9. CLI + Composition Integration

### 9.1 New flag: `--reasoning-mode`

Added to `product/cli/shared.ts`:

```
--reasoning-mode <mode>
  'record' — pending-only; every call writes pending, halts step
  'replay' — read-only; cache hits proceed, misses halt step
  'live'   — composite: replay-first, record-on-miss (default
             when a live-adapter is configured)
  'deterministic' — fallback to existing deterministic adapter
                    (unchanged behavior)
```

Propagates into `LocalServiceOptions.reasoningMode`; composition
layer selects the adapter per §5.3.

### 9.2 CLI commands affected

- `tesseract compile --ado-id N --reasoning-mode live`
- `tesseract compile-corpus --reasoning-mode live`
- `tesseract probe-spike --reasoning-mode live` (optional; not
  load-bearing for Z11d's graduation)

### 9.3 Pool directory convention

Default: `.tesseract/reasoning-pool/`. Operator-configurable via
`--reasoning-pool <path>` flag (rarely needed).

Subdirs:
```
.tesseract/reasoning-pool/
  pending/
    <fingerprint>.json       — PendingRequest envelopes
  filled/
    <fingerprint>.json       — FilledResponse envelopes
  rejected/                  — filled responses that schema-mismatched
    <fingerprint>.json
```

`rejected/` is operator-curated: if a fill was bad (wrong shape,
fabricated, etc.), operator moves its file from `filled/` to
`rejected/`; next compile run re-pends it.

## 10. Phasing

Five sub-commits. Each independently reviewable; build + suite
green at each.

### 10.1 Z11d.a — Domain types + folds + ReasoningError widening

- `product/reasoning/pool/` domain types (PendingRequest,
  FilledResponse, PoolError + fold).
- `ReasoningProvider` enum gains `'claude-code-session'`.
- `ReasoningError` union gains `'needs-fill'` variant.
- `promptFingerprint` pure function.
- New `FingerprintTag` entry `'reasoning-pool-key'`.
- **Laws (ZD1.*)**: fingerprint determinism, error exhaustiveness,
  pool request round-trip, filled response round-trip.

### 10.2 Z11d.b — `RecordReasoning` + `ReplayReasoning` adapters

- Both adapters + `ClaudeCodeSessionReasoning` composite.
- Filesystem harness for `pending/`, `filled/`, `rejected/`.
- Atomic write helper (temp + fsync + rename).
- **Laws (ZD2.*)**: record writes pending; replay reads filled;
  composite tries replay first; cache-hit determinism;
  atomic-write under concurrent write simulation.

### 10.3 Z11d.c — CLI flag + composition wiring

- `--reasoning-mode` flag in shared.ts.
- Composition-layer branch in local-services.ts.
- `--reasoning-pool <path>` flag (minor).
- **Laws (ZD3.*)**: flag parse round-trip; mode→adapter mapping.

### 10.4 Z11d.d — `/reasoning-fill` skill + subagent dispatch

- `.claude/skills/reasoning-fill.yaml` + `scripts/reasoning-fill.ts`.
- Subagent authoring guidance.
- Response validation (schema check; malformed → rejected/).
- **Laws (ZD4.*)**: skill idempotency; empty-pool noop;
  malformed response routes to rejected/; schema validation
  respects request's expectedResponseShape.

### 10.5 Z11d.e — Autotelic hooks

- `.claude/settings.json` hook configurations (PostToolUse +
  Stop + UserPromptSubmit).
- `scripts/hooks/reasoning-fill-*.sh` scripts.
- `TESSERACT_REASONING_AUTOFILL=off` opt-out wiring.
- **Laws (ZD5.*)**: env-var off disables all triggers;
  threshold-based PostToolUse reminder; Stop hook blocks on
  non-empty pool.

### 10.6 Sequencing

```
Z11d.a ─┬─ Z11d.b ── Z11d.c ── Z11d.d ── Z11d.e
        │  (parallel-eligible with Z11d.b)
        └─ (Z11d.c, d, e linearized)
```

### 10.7 Effort estimate

- Z11d.a: 1 day
- Z11d.b: 1.5 days
- Z11d.c: 0.5 days
- Z11d.d: 2 days (subagent dispatch + schema validation + fixtures)
- Z11d.e: 1 day (hooks + opt-out)

Total: **~6 days**.

## 11. Laws per Phase — Detailed

### ZD1 (Domain + fingerprint)

- ZD1.a — `promptFingerprint` determinism: identical inputs →
  byte-equal fingerprint.
- ZD1.b — closed-param sort insensitivity: reordering
  closedParams keys → same fingerprint.
- ZD1.c — model variation sensitivity: same prompt, different
  model → different fingerprint.
- ZD1.d — `foldPoolError` exhaustiveness over 4 variants.
- ZD1.e — PendingRequest JSON round-trip.
- ZD1.f — FilledResponse JSON round-trip.
- ZD1.g — `'reasoning-pool-key'` accepted by `asFingerprint`.
- ZD1.h — ReasoningProvider exhaustive fold includes
  `'claude-code-session'`.

### ZD2 (Adapters)

- ZD2.a — RecordReasoning.select writes pending/<fp>.json + fails
  with needs-fill.
- ZD2.b — Written file deserializes to matching PendingRequest.
- ZD2.c — ReplayReasoning.select on existing filled/<fp>.json
  returns ReasoningReceipt with provider='claude-code-session'.
- ZD2.d — ReplayReasoning receipt has tokensSource='estimated'
  and latencyMeasured=false.
- ZD2.e — ReplayReasoning on missing filled/<fp>.json fails with
  needs-fill.
- ZD2.f — Composite (ClaudeCodeSessionReasoning) tries replay
  first, falls through to record on miss.
- ZD2.g — Atomic write under concurrent-write simulation: both
  writers produce identical fingerprint; one wins rename; other
  succeeds idempotently.
- ZD2.h — Append-only: filled/<fp>.json never overwritten;
  attempt returns idempotent success.

### ZD3 (CLI + composition)

- ZD3.a — `--reasoning-mode` parses each of 4 values.
- ZD3.b — Mode 'replay' composes ReplayReasoning.
- ZD3.c — Mode 'record' composes RecordReasoning.
- ZD3.d — Mode 'live' composes Composite.
- ZD3.e — Mode 'deterministic' composes existing deterministic
  adapter (unchanged behavior).
- ZD3.f — `--reasoning-pool` override propagates to all three
  adapters.

### ZD4 (Skill)

- ZD4.a — `/reasoning-fill` with empty pool → noop; prints
  "Nothing to fill."
- ZD4.b — `/reasoning-fill` with N pending files → dispatches
  subagent, reports count drained.
- ZD4.c — Filled response missing required fields → rejected/.
- ZD4.d — Filled JSON with schema mismatch (per request's
  expectedResponseShape) → rejected/.
- ZD4.e — Filled response with enum-token not in expected set
  → rejected/.
- ZD4.f — Idempotent: running `/reasoning-fill` twice with no
  new pending files is a noop on the second run.

### ZD5 (Autotelic)

- ZD5.a — `TESSERACT_REASONING_AUTOFILL=off` disables all hooks.
- ZD5.b — PostToolUse reminder fires only when pool count ≥
  threshold.
- ZD5.c — Stop hook blocks (non-zero exit) when pool non-empty.
- ZD5.d — UserPromptSubmit injects reminder when pool non-empty.
- ZD5.e — `/loop 10m /reasoning-fill` + empty pool → no
  spurious fills (cadence doesn't re-author existing fills).

## 12. Open Questions

### Q1 — Should operator-authored fills carry a distinct
provider tag?

Default: yes. `'operator-authored'` provider variant for cases
where a human authored the fill instead of Claude (e.g., during
a CI-batch run that paused for a decision). Trust-policy could
weight operator fills differently. Deferred to first need.

### Q2 — Token cost accounting upgrade path

When Claude Code harness exposes token usage (future), adapter
upgrades from `tokensSource: 'estimated'` to `'measured'`. The
receipt shape stays stable. Revisit when that API exists.

### Q3 — Multi-session fill coordination

If two operators run `/reasoning-fill` concurrently against the
same pool, atomic rename means both authors land cleanly; last
writer wins on identical fingerprints. Consider explicit
locking if multi-operator becomes a pattern.

**Default**: no locking; atomic rename is sufficient.

### Q4 — Reasoning-pool retention policy

Default: keep `filled/` indefinitely (they're cache). Rotate
`pending/` on successful fill (file moves → gets renamed to
filled/). Keep `rejected/` indefinitely for audit.

### Q5 — Cross-repo pool sharing

A team could share a `reasoning-pool/` directory across repos
(e.g., on a shared network drive) to amortize fills. Deferred
— too many coordination concerns (fingerprint includes model
version; cross-version cache invalidation; trust across
operators).

### Q6 — Integration with Z11a.5 CompilationReceipts

Under Z11d, a compile-corpus run's CompilationReceipts include
real ReasoningReceipt fingerprints in `reasoningReceiptIds`.
The compounding engine can then measure cost-per-case trends.
Sequence this after Z11d.e so the receipt linkage is live.

### Q7 — `synthesize` operation — who fills?

`Reasoning.synthesize` is open-ended generation (e.g., emit a
Playwright spec from a bound scenario). Fills for synthesize
are more substantial than select/interpret. Under Z11d:
treated identically — same pending/filled envelopes; subagent
authors the spec; downstream consumers validate. Heavy-hitting
synthesize fills may warrant a dedicated subagent with longer
context budget. Deferred to first need.

## 13. Risk Register

### R1 — Autotelic fills storm main-context

**Risk**: per-tool-use hook fires too aggressively; fills
dominate turn budget.

**Mitigation**: threshold-based gating (≥3 pending). Subagent
dispatch keeps main context clean. Kill switch on env var.

### R2 — Fill quality drift

**Risk**: subagent authors fills carelessly under time pressure.

**Mitigation**: `reasoningSummary` field on every filled
response gives operators visibility. Compounding-engine
refutation signal surfaces systematic low-quality fills.
`rejected/` directory captures malformed responses for audit.

### R3 — Cache-key non-determinism

**Risk**: call-site embeds wall-clock / UUID in prompt; fills
never cache-hit.

**Mitigation**: `promptFingerprint` derivation is deterministic
over its inputs; the "include timestamps" anti-pattern is a
call-site bug. Add a small lint (opt-in) that warns when
prompt-building functions call `new Date()` without a
closed-param capture.

### R4 — Subagent fails to dispatch

**Risk**: SubagentStop hook eats the error; main session never
sees the failure.

**Mitigation**: skill's main path asserts subagent returned
non-null summary; on null, falls back to "drain in main
context with a cap" (inline fill of up to 5 requests;
remainder deferred).

### R5 — Race between compile-step halting and fill arrival

**Risk**: compile halts on needs-fill; fill completes before
operator restarts; no auto-resume.

**Mitigation**: out of scope for Z11d. Operator re-invokes
compile after fill. A future "file-watch + auto-resume"
integration could close this loop; deferred.

### R6 — Fill across classifier-version upgrade

**Risk**: fingerprint includes model id; upgrading the model
(e.g., claude-opus-4-7 → claude-opus-4-8) invalidates the
entire filled cache in one swoop.

**Mitigation**: intended behavior. Model upgrades are explicit;
cache invalidation is the signal that the fill pool should be
re-drained. Report lists "stale fills since model change" when
the mismatch is detected.

## 14. Success Criteria

Z11d is complete when:

1. Five sub-commits landed (Z11d.a–e); all tests green; seam
   laws green; graduation still holds.
2. A full `tesseract compile-corpus --reasoning-mode live` run
   with one round of `/reasoning-fill` produces CompilationReceipts
   with real ReasoningReceipt references in
   `reasoningReceiptIds` and `substrateVersion` distinct from
   'heuristic-z11a5'.
3. The customer-compilation resolvable trajectory's cycleRate
   is demonstrably < 1.0 (the heuristic's always-1.0 is
   replaced by real reasoning outcomes, some of which refute).
4. Autotelic fill-during-session demonstrably drains pending
   files while the operator is working on other tasks.
5. A verdict doc (`workshop/observations/probe-spike-verdict-12.md`
   or successor) documents the first live-adapter graduation
   with honesty-rubric classification.

### 14.1 Anti-goals

- **Fill quality fabricated**. If an operator's spot-check
  reveals the subagent is guessing without engaging — refactor
  the subagent's prompt; don't lower quality bars.
- **Token counts reported as measured when estimated**. The
  `tokensSource` flag is truthful; don't change its meaning to
  paper over inaccuracy.
- **runPromise scattered through the runtime**. Only one
  runPromise call per I-OneBoundary. Audit in code review.
- **Autotelic fills without opt-out**. Kill switch must always
  work.

## 15. Relationship to Other Slices

### 15.1 With Z11a (pattern ladder + customer-compilation)

Z11a produces heuristic CompilationReceipts via the Z11a.4b
intent classifier. Z11d replaces the heuristic with real
reasoning — the receipt SHAPE stays identical; the producer
changes. `substrateVersion` marker distinguishes Z11a.5-era
receipts from Z11d-era receipts under drift detection.

### 15.2 With Z11f (substrate study)

Orthogonal. Z11d runs local session reasoning; Z11f harvests
public DOMs offline. Neither blocks the other. Under the full
future end state, both contribute: Z11f informs matcher
authoring; Z11d provides live semantic evaluation of matcher
coverage.

### 15.3 With Z11b (executed-test cohort)

Loosely coupled. Executed-test cohort measures whether generated
specs run cleanly; Z11d measures whether the reasoning that
produced them was sound. A compound analysis is possible later
("reasoning quality predicts test quality"); not Z11d's
concern today.

## Closing note

Z11d is the most exciting of the three forward paths because
it's the first infrastructure piece where **the agent running
this repo becomes the thing being measured**. The compounding
engine's hypotheses evaluate real Claude reasoning; refutations
name real capability gaps; confirmations name real strengths.
The workshop puts the agent inside the measurement loop it was
built to operate — a genuine self-referential claim about
whether this particular reasoner is sufficient for this
particular product's surfaces.

Building this well matters. The infrastructure is forgiving
(heuristic fallback; opt-out; audit trail) but the measurements
it enables are not: intervention-fidelity's semantic judgment
is Z11d's deliverable, and that judgment is the first real
product-efficacy signal the compounding engine's been able to
produce. Worth doing carefully.

