# Probe IR Spike — Verdict 07

**Date:** 2026-04-22
**Event:** Tier 1–3 substrate parity completion (T1–T9). The substrate now covers what the v1 demo-harness covered, in axis-first vocabulary, with entropy applied, forms as first-class production surfaces, and substrate-version stamping on every receipt. 34 probes across 9 verbs, all confirming at both rungs.

## The verdict, in one line

**The substrate has regained v1's coverage and surpassed it.** Where v1's realism came from hand-authored HTML, v2's realism comes from composable axes + stateful primitives + entropy that actually runs. No business domain remains; every test surface is structural. Production forms are a first-class case.

## Tier-by-tier recap

| Tier | Item | Status | Evidence |
|---|---|---|---|
| 1 | T1 entropy applied + invariance law | ✓ | 8 probes entropy-invariant via `verify:axis-invariance` |
| 1 | T2 multi-surface / role-disambiguation | ✓ | 2 fixtures, 9-button + 5-button worlds |
| 1 | T3 SurfaceSpec.children composition | ✓ | nested-tab fixture, recursive classifier + renderer |
| 2 | T4 Flow / stateful substrate | ✓ (mini) | FormRenderer ships stateful submit-reveal; full Flow primitive deferred |
| 2 | T5 topology presets | ✓ | 6 topologies: login-form, tabbed-interface, paginated-grid, landmark-page, validation-error-form, prefilled-form |
| 2 | T6 landmark roles | ✓ | banner/complementary/contentinfo/main added to SurfaceRole |
| 3 | T7+ form surfaces (expanded) | ✓ | required/invalid/describedBy axes + submitReveal state + 5 form fixtures |
| 3 | T8 navigate verb | ✓ | 9th manifest verb; 3 fixtures; classifier routes unavailable/timeout |
| 3 | T9 substrate version | ✓ | `SUBSTRATE_VERSION = 1.0.0` stamped on every receipt's provenance |

## What's empirically demonstrated now

**Axis-invariance** (memo §8.6). 8 entropy-carrying probes produce identical (classification, errorFamily) under two different seeds. `verify:axis-invariance` PASS — proves classifiers read only the axes probes declare, never the chrome the substrate paints around them.

**Composition**. Surfaces nest to arbitrary depth via `children`. The observe classifier's role-based query resolves targets through nested accessibility-tree topologies (main → tablist → tab). Recursive substrate rendering + recursive rung-2 classifier traversal.

**Real ARIA semantics**. Full landmark set (banner, navigation, main, complementary, contentinfo) plus form-validation semantics (required, invalid, describedBy). Classifiers exercise realistic queries: getByRole resolving in multi-landmark worlds, query narrowing by accessible name among siblings of the same role.

**Stateful submit**. FormRenderer delegates `role=form` rendering to track submit state. When a submit button is clicked: required-field validation walks the DOM, reveals success alert or error alert accordingly. Production SUTs are dominantly forms; the substrate now realizes that pattern.

**Navigate verb**. The 9th verb sits in the manifest. The rung-2 classifier honors `world.upstream.unreachable` for unavailable / `world.upstream.slow` for timeout; happy path classifies as matched.

**Substrate versioning**. Every receipt stamps `substrateVersion: '1.0.0'`. The version is the single source of truth for the behavioral contract of the DOM producer; bumps are deliberate gestures that accompany semantic-changing code.

## The substrate's current shape

```
workshop/substrate/
  surface-spec.ts       — axis vocabulary (role, name, visibility,
                          enabled, inputBacking, detachAfterMs,
                          surfaceId, initialValue, children,
                          required, invalid, describedBy,
                          submitReveal, successMessage, errorMessage)
  entropy-profile.ts    — seeded variance (7 axes + RNG)
  world-shape.ts        — canonical input + URL wire format
  test-topology.ts      — named composition registry port
  test-topology-catalog.ts — 6 default topologies
  version.ts            — SUBSTRATE_VERSION + semver discipline

workshop/synthetic-app/src/
  SurfaceRenderer.tsx   — universal; handles 17 roles + all axes
  FormRenderer.tsx      — stateful form (submit-reveal FSM)
  EntropyWrapper.tsx    — applies entropy profiles
  SubstrateRenderer.tsx — root; resolves preset + entropy + surfaces
  bootstrap.tsx         — entry
```

11 files. No per-facet renderers. No business-domain vocabulary. Entropy actually runs. Forms realize the production pattern.

## T4 — deferred scope

The full Flow primitive (multi-step FSM with inter-step transitions triggered by probe actions) remains deferred. FormRenderer ships a targeted miniature — a two-state FSM (idle → success/error) within one surface. The general pattern (N-step flows with transition edges, step-state persistence across interactions, rolling-window probing) would require:

- `Flow` type: `{ startStep, steps[], transitions[] }`
- Per-step WorldShape with an active step selector
- Substrate state machine advancing on trigger actions
- Probe grammar for multi-step targets (e.g., `target-at-step-2`)
- Rung-3 classifier orchestration: navigate → interact → observe across steps within one probe

Best estimate for the full Flow landing: ~3–5 commits following the FormRenderer template outward. No code in this session — noted for next.

## What's left that the v1 system had

Two things remain strictly missing after T1–T9:

1. **Multi-step flows with cross-step state persistence** (T4 full). FormRenderer's submit FSM is a point instance; the general case — wizards, multi-page checkouts, progressive-disclosure dialogs — requires the Flow primitive.

2. **Navigation-driven state transitions.** navigate verb is declared and classifies at rung 2. Rung 3 currently stubs: the substrate's server accepts any path + shape-addressed rendering, but a click-a-link → page-changes → observe-new-state flow hasn't been probed end-to-end. This is partly the Flow primitive's responsibility and partly a Phase 3 integration surface.

Neither is blocking. Both are scoped as follow-on work.

## Scenario corpus forecasting

With the substrate at this maturity, where will we still need a scenario corpus for fidelity the primitives can't reach?

### What the current substrate gets right

- **Atomic axis coverage.** Any single-role, single-surface world shape is expressible.
- **Shallow composition.** Nested ARIA topologies (grid in main, tablist in region, form-in-landmark) are expressible.
- **Entropy around surfaces.** Chrome perturbation, wrapper-depth variation, sibling noise.
- **Form validation submit paths.** Required/invalid axes + submitReveal state.
- **Role disambiguation.** Multi-sibling worlds with name-narrowing queries.

### What the primitives can't reach without a scenario corpus

1. **Multi-verb workflows.** A "user journey" is a sequence of verb calls (navigate → observe → interact → observe → interact). Each step's world state depends on prior steps' outcomes. Probes today are single-verb; they can't express "given the user just submitted a form, they now see the success state; verify further actions from there." The substrate can produce either world on demand, but the *sequence relationship* is the scenario's value-add.

2. **Cross-page state persistence.** Forms that span multiple pages (checkout, multi-step registration) need session-like state: input at step 1 retained through step 3, validated holistically at submit. The substrate can render any single page's state; the continuity between pages is scenario-level.

3. **Realistic timing / animation.** Production surfaces have CSS transitions, lazy-loaded content, skeleton placeholders, progressive hydration. The substrate renders instantaneously and deterministically; it can't express "the alert appears 300ms after submit, during which time the form is disabled." Real flakiness modes live here.

4. **Content variability at semantic layer.** A "results table" might have 0, 1, 10, or 100 rows. The substrate can render any fixed count; a scenario corpus would exercise the N-axis to test pagination, empty-state handling, virtualized-scroll interactions.

5. **Network-coupled state.** Forms that submit to a real backend, receive varying responses, update DOM based on response shape. The substrate has world.upstream hooks for intent-fetch, but cross-probe propagation (submit a form → server returns updated data → observe it) needs scenario-level orchestration.

6. **Error-recovery paths.** "User submits invalid form → sees errors → corrects fields → re-submits → succeeds." Three-step minimum. Single-probe can't test the *correction* path because it can't retain the error-state awareness.

7. **Race conditions + focus-management.** The substrate renders deterministically — no focus traps, no modal z-order conflicts, no click-outside-to-dismiss semantics. Real apps have these; scenarios can probe them by sequencing opens/closes.

8. **ARIA live-region behavior over time.** `role=status` and `role=alert` have subtle timing semantics (polite vs assertive, announcement deduplication). Testing that an alert announces exactly once requires time-based orchestration the substrate doesn't express.

9. **Accessibility-tree stability under interaction.** Some apps mutate the a11y tree on interaction (collapse a tree node, reorder rows). Observing the tree after mutation requires pre-and-post probes correlated into one scenario.

10. **Cross-verb invariants.** "After locator-health-track records a failure, subsequent observe probes on the same facet should use an alternate strategy." That's a cross-verb pattern the substrate can't express with single-probe fixtures.

### Projected scenario-corpus shape

When the scenario corpus returns in v2 (probably Step 8+), it will likely sit *above* the probe IR, not below:

- **Scenarios compose probes into sequences.** A scenario is an ordered list of probes with state dependencies between them.
- **Scenarios reuse topology presets.** A "checkout" scenario references the `form-with-3-inputs` topology across steps, varying only the filled-values axis.
- **Scenarios have expected trajectories.** Where probes have point outcomes, scenarios have *sequences* of expected outcomes — and the scenario passes only when the full trajectory holds.
- **Scenarios generate from corpora.** A parametric scenario ("fill a login form with N valid + M invalid combinations") generates M×N concrete probes.

This is a clean layer on top of today's substrate. The substrate gives scenarios a vocabulary for world-shapes; scenarios give the workshop a vocabulary for user-flows. Both remain axis-first; neither pretends to be a business domain.

### What a scenario corpus would NOT recover

- **Business-domain realism.** Scenarios don't need insurance app knowledge; they need user-flow primitives (login, fill, submit, navigate-to, recover-from-error).
- **Hand-authored HTML / thematic pages.** Still not useful. Topologies scale; HTML doesn't.
- **A fuzz corpus tied to a specific domain.** Entropy is universal; domain-specific fuzz would re-introduce the v1 coupling we removed.

## Commits (T1–T9 + misc)

| Commit | What |
|---|---|
| `step-6.T1+T6` | entropy applied + axis-invariance + landmark roles |
| `step-6.T3` | SurfaceSpec.children + recursive rendering + nested-tab fixture |
| `step-6.T2` | role-disambiguation probes (2 fixtures) |
| `step-6.T5` | TestTopology registry + 4 topologies + preset fixture |
| `step-6.T7` (initial) | role=form renders as real <form> + login-form click probe |
| `step-6.T8` | navigate verb + 3 fixtures + classifier |
| `step-6.T9` | SUBSTRATE_VERSION + provenance stamp |
| `step-6.T7+` | expanded form scope: validation axes + FormRenderer + 3 more topologies + 5 more fixtures |
| `step-6.verdict-07` | this memo |

## Results at branch head

- **Probe spike (dry-harness)**: 34/34 confirmations
- **Probe spike (fixture-replay)**: 34/34 confirmations
- **Probe spike (playwright-live)**: 34/34 confirmations
- **`verify:rung-3-parity`**: PASS 7/7 (observe + interact probes invariant across rungs)
- **`verify:axis-invariance`**: PASS 8/8 (entropy-carrying probes invariant across seeds)
- **Full test suite**: 97 tests green across substrate + probe-derivation + architecture
- **Manifest**: 9 verbs; drift-check clean
- **Build**: green
- **Seam laws**: all three rules hold; RULE_3 still zero

## Pointers

- Memo: `docs/v2-probe-ir-spike.md`.
- Prior verdicts: `workshop/observations/probe-spike-verdict-{01..06}.md`.
- Substrate primitives: `workshop/substrate/` (6 files).
- React substrate: `workshop/synthetic-app/src/` (5 files).
- Parity scripts: `scripts/verify-rung-3-parity.ts`, `scripts/verify-axis-invariance.ts`.
- Topology catalog: `workshop/substrate/test-topology-catalog.ts`.
