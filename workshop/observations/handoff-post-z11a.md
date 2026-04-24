# Handoff — Post-Z11a (Verdict 11 → Next Agent)

> Status: active — handoff from the session that landed Z11a
> (verdict-10 → verdict-11). Read first if you're picking up
> after 2026-04-24. Supersedes the "If you're a fresh agent
> session, your next action is Step 5" line in CLAUDE.md until
> the next verdict lands.

## Welcome

You're inheriting a codebase in a good state — better than it
was, with a clear next-rung ladder and honest docs about what's
load-bearing vs what's still synthetic.

The compounding engine now measures **three cohorts across two
prediction kinds** on synthetic substrate. The graduation gate
holds. The pattern ladder slotted into the resolution pipeline
works. The customer-backlog corpus produces real evidence. There
is a 3,947-line architectural plan for the next-rung OutSystems
distillation work that hasn't been coded yet. There is a clear
forward queue.

This is the most legible the repo's measurement surface has ever
been. Your job is to push one or more rungs up the epistemic
ladder. There are three directions, each interesting, each
well-scoped.

## What just landed (summary)

**Z11a** — customer-compilation cohort + pattern ladder +
multi-cohort graduation, seven sub-commits (Z11a.1 → Z11a.7) +
one plan doc (Z11f) + one heuristic-to-real-deferred boundary
marker:

| Slice | What |
|---|---|
| Z11a.1 | Domain types: `customer-compilation` cohort, `intervention-fidelity` prediction, `CompilationReceipt` envelope |
| Z11a.2 | Resolvable ADO corpus (8 cases) + `docs/v2-synthetic-app-surface-backlog.md` |
| Z11a.3 | Needs-human ADO corpus (14 cases, 1:1 with backlog rows) |
| Z11a.4a | Pattern-rung kernel + `firstMatchWins` orchestrator + `formSubmissionPattern` |
| Z11a.4b | `PatternRegistry` + intent classifier + strategy at `'shared-patterns'` |
| Z11a.4c | Five more seed patterns; specific→generic registry order |
| Z11f | Architectural plan doc for OutSystems public-DOM harvest → distillation → matcher proposals (**no code yet**) |
| Z11a.5 | `tesseract compile-corpus` CLI + CompilationReceipt emitter + heuristic classifier |
| Z11a.6 | ReceiptStore widening + real intervention-fidelity evaluator replacing Z11a.1 stub |
| Z11a.7 | Seed hypotheses for both customer-compilation corpuses + verdict-11 |

**Tests**: 3,890 green. **165+ compounding-family / pattern /
customer-backlog laws**. **Seam laws green** at every commit.
**Graduation holds** both in the Z10 single-cohort sequence
(`npm run graduate`) and in the full three-cohort drive-through.

## What's exciting about where we are

Three things that weren't true before Z11a:

1. **The engine now measures adapter-invariant properties.** The
   needs-human corpus's trajectory carries intervention fidelity
   regardless of which reasoner is plugged in — the surface is
   absent by construction, so the handoff MUST fire. Separating
   adapter-sensitive from adapter-invariant signal is a
   measurement capability the Z10 engine did not have.

2. **The pattern ladder is the first honest cognitive cache.**
   Z11a.4a-c wire the `'shared-patterns'` rung with six
   concept-modules (form-submission, locator-by-role-and-name,
   navigation-link-by-name, field-input-by-label,
   dialog-confirmation, observation-by-assertion-phrase), each
   with its own specificity ladder of pure matcher functions.
   Customer-specific specializations prepend to each pattern's
   matcher list via the proposal-gated trust-policy flow. The
   generic floor never moves; specialization accretes at the top.

3. **The forward queue has pre-designed plans.** Z11f's 3,947-
   line architectural doc is the closest-to-production
   measurement upgrade available — harvest real public
   OutSystems DOMs (Common Crawl + Wayback + showcase), distill
   structural signatures, propose operator-gated matchers. The
   design work is done; implementation is phased Z11f.0 → Z11f.g
   with ~40 laws pinned per phase.

## Your choice of next slice

Three roads, any one of which is a substantive week-to-two of
work. Listed by **leverage per effort**, not by dependency.

### Path A — **Z11d: Live Reasoning Adapter (Claude-as-adapter)**

**Why leverage**: unblocks semantic intervention-fidelity; lets
the customer-compilation cohort's resolvable trajectory diverge
meaningfully from 1.0; enables the coverage-growth hypotheses.

**What ships**: record / fill / replay triad + `/reasoning-fill`
skill + autotelic hooks (PostToolUse + Stop + UserPromptSubmit)
+ `claude-code-session` provider tag on ReasoningReceipts +
fingerprint-cache infrastructure.

**Plan doc** — just authored by this session at
`docs/v2-live-adapter-plan.md` (see §below).

**Rough effort**: 1–2 weeks. Novel; highest-excitement of the
three paths; has the richest architectural design.

### Path B — **Z11b: Executed-Test Cohort**

**Why leverage**: adds the third missing cohort from the Z11
plan — `executed-test`, measuring post-compile spec quality
(pass / flake / fail over N repetitions). Turns the scoreboard
into a complete three-outcome quality surface.

**What ships**: `tesseract test-execute --emit-compounding-receipt`
batch runner + new `executed-test` cohort kind + new
`stability-rate` prediction kind + per-spec ExecutionReceipt
envelopes.

**Plan doc** — just authored by this session at
`docs/v2-executed-test-cohort-plan.md` (see §below).

**Rough effort**: ~1 week. Orthogonal to Z11d and Z11f; can run
in parallel with either. Mostly mechanical extension of the
patterns Z10+Z11a established.

### Path C — **Z11f: Substrate Study Implementation**

**Why leverage**: grounds the pattern ladder's OutSystems-generic
tier in real public DOM evidence. Promotes the honesty rubric
from multi-cohort-synthetic to grounded.

**What ships**: the harvest → distill → propose pipeline from
the existing plan doc at `docs/v2-substrate-study-plan.md`.
Seven sub-slices (Z11f.0 → Z11f.g); Z11f.0 is a **legal-review
PR** that must merge before Z11f.a's code work starts.

**Plan doc** — already authored at
`docs/v2-substrate-study-plan.md`. Fully detailed; all
decisions made; 7-phase sequencing with laws per phase.

**Rough effort**: 8–12 days per the plan's own estimate. Blocked
on legal review (Z11f.0) before any code.

## Read-order for orientation

Don't read everything. Read in this order, stop when the task
you picked is clear:

1. **CLAUDE.md** — project doctrine; seam discipline;
   vocabulary. 10 min.
2. **`workshop/observations/probe-spike-verdict-11.md`** — what
   just landed; honesty rubric; forward queue. 10 min.
3. **The plan doc for the path you picked**:
   - Path A → `docs/v2-live-adapter-plan.md`
   - Path B → `docs/v2-executed-test-cohort-plan.md`
   - Path C → `docs/v2-substrate-study-plan.md`
4. **`docs/v2-compounding-engine-plan.md`** — reference for the
   engine's shape. Read only the sections relevant to your path.
5. **Z11a commit trail** (`git log --oneline main..` or
   the list in verdict-11) — if you need implementation
   precedent for something specific, find the matching commit.

Don't read the whole `docs/v2-*` tree cover-to-cover. The docs
are reference material, not a curriculum.

## Where each seam lives

Quick reference for "I need X, where is it?"

- **Compounding domain types**: `workshop/compounding/domain/`
- **Compounding Effect programs**: `workshop/compounding/application/`
- **Compounding adapters**: `workshop/compounding/harness/`
- **Compounding CLI commands**: `workshop/cli/commands/compounding-*.ts`
- **Pattern ladder kernel**: `product/domain/resolution/patterns/`
  (rung-kernel.ts, orchestrators/, matchers/, patterns/)
- **Pattern registry + strategy**: `product/runtime/resolution/patterns/`
- **Customer-backlog corpus**: `workshop/customer-backlog/fixtures/`
  + loader/classifier at `workshop/customer-backlog/application/`
- **CompilationReceipt emitter**: `workshop/compounding/emission/`
- **Seed hypothesis fixtures**: `workshop/observations/fixtures/`
- **Verdicts**: `workshop/observations/probe-spike-verdict-*.md`
- **Runtime logs (gitignored)**: `workshop/logs/`

## Critical invariants to preserve

These are non-negotiable; breaking them is a PR-blocking signal.

1. **Pattern matchers stay pure.** No Effect imports inside
   matcher functions. Effect lives at the PatternRegistry +
   strategy boundary.
2. **`product/` imports zero files from workshop compounding /
   customer-backlog / substrate-study lanes.** Seam laws
   enforce; violations fail the build.
3. **Every artifact is append-only.** Follow the existing
   discipline in the `workshop/logs/*` tree.
4. **Specific → generic within each pattern's matcher list.**
   New specialization prepends; generic tail never moves.
5. **CompilationReceipt's `substrateVersion` is the truth-in-
   labeling marker.** If Z11d produces real compile receipts,
   they MUST carry a distinct substrate version so drift
   detection can compare heuristic-era vs real-era evidence.
6. **Customer-compilation cohort splits stay meaningful**:
   needs-human is adapter-invariant by corpus design; resolvable
   is adapter-sensitive. Don't collapse them.
7. **`npm run graduate` keeps holding.** Every commit that
   touches the compounding engine runs graduate.ts locally as a
   smoke check.

## Honest limitations

Named explicitly so you don't have to discover them:

- **CompilationReceipts are heuristic under Z11a.5.** The
  `heuristic-z11a5` substrateVersion marker flags this. Z11d's
  real-compile integration upgrades them.
- **The pattern ladder's SurfaceIndex is empty.** Pattern
  strategy's `attempt()` always returns null under Z11a.4b
  because `surfaceIndexFromStage` is stubbed. Wiring it to the
  real InterfaceResolutionContext is future work (covered in
  Z11d's plan or can be a dedicated small slice).
- **Resolvable trajectory always shows rate 1.0 under heuristic.**
  This is because the heuristic's classifier-success = would-
  resolve mapping is optimistic. Under Z11d with real compile,
  the rate will drop to a realistic sub-1.0 — that's the *point*.
- **OutSystems-generic matchers are guesswork.** Z11f's
  distillation pipeline grounds them in real evidence. Until
  Z11f runs, the matchers at `product/domain/resolution/patterns/
  matchers/` reflect expected conventions, not observed ones.
- **ResolutionStrategy is Promise-typed.** CLAUDE.md's "Effect-
  forward orchestration" doctrine calls for Effect. The
  migration is ~40 touch-points and was deferred from Z11a.4b;
  it's a dedicated epic in the forward queue.

## If you get stuck

- **Build broken?** `npm run build` + read the manifest drift
  output. Most compounding-engine changes widen either
  FingerprintTag or WorkflowScope; if they're out of sync the
  build fails with a clear signal.
- **Tests red?** `npx vitest run tests/<area>/` narrows. The
  seam-enforcement law at `product/tests/architecture/` catches
  most import-boundary mistakes.
- **Graduation broken?** `rm -rf workshop/logs && npm run
  graduate` reproduces the Z10 smoke check. If it fails, read
  the four condition `detail` strings — they explain exactly
  which gate missed.
- **Unsure whether a design choice is in scope?** Check CLAUDE.md's
  "Non-negotiable model" + the relevant plan doc's invariants
  section. If a choice contradicts either, it's out of scope
  without an explicit invariant-revision PR.

## Closing note

The shape of the measurement surface now matches the shape of
the product's actual concerns: does the pipeline resolve ADO
text; does it escalate correctly when it can't; does it produce
specs that run; does its cognitive cost trend downward as more
is learned. Z10 measured the first two as boolean plumbing; Z11a
measures them as graded trajectories per cohort. Z11b will add
the third; Z11d will add the semantic upgrade; Z11f will ground
the pattern layer in real distributional evidence.

You don't have to do all of them. Pick the one that pulls the
most signal out of the corpus we already have, and the other
two will keep being well-scoped plans waiting for their turn.

Good luck. The repo is in the best state it's been in.

— the Z11a cohort, 2026-04-24
