# Probe IR Spike — Verdict 05

**Date:** 2026-04-22
**Event:** Rung-3 substrate lands end-to-end. The synthetic substrate (React + facet renderer registry + in-process Node http server) composes with a real Chromium via `launchHeadedHarness` to produce substrate-faithful receipts for the two browser-bound verbs (observe, interact). Rung-3 parity holds: 7/7 classified probes agree with rung-1/rung-2 receipts on (classification, errorFamily).

## The verdict, in one line

**Rung-3 graduated.** Every probe whose verb has a rung-3 classifier produces byte-agnostic (classification, errorFamily) parity across rungs. The substrate ladder's monotonicity claim (memo §8.3) holds for the rung-2 ↔ rung-3 transition on the current seed manifest.

## What shipped in Step 6 (this branch slice)

11 commits across six sub-slices per the Step-6 first-principles redesign plan:

| Slice | Commit | Contents |
|---|---|---|
| 6.0a | `a38a82b` | `workshop/substrate/world-config.ts` — substrate input language, 7 laws. |
| 6.0b | `85ba5d3` | `workshop/substrate/facet-renderer.ts` — rendering port, 4 laws. |
| 6.1a | `8faa10d` | `SubstrateRenderer.tsx` + bootstrap + `index.html`. |
| 6.1b | `002354a` | Four leaf renderers + populated registry. |
| 6.1c | `e541259` | esbuild wiring (`buildSyntheticApp()`) + tsconfig + gitignore. |
| 6.2 | `7818df1` | `workshop/synthetic-app/server.ts` + 6 smoke laws. |
| 6.3 | `617594a` | `playwright-live-harness.ts` + rung-3 port + scoped lifecycle + adapter-factory refactor. |
| 6.4a | `d77db84` | observe rung-3 classifier + fixture `target.facet-id` augmentation. |
| 6.4b | `d5227af` | interact rung-3 classifier — four-family routing via real Playwright. |
| 6.5 | (this) | Rung-3 parity verification script + verdict-05. |

Slice 6.6 (dogfood demo-harness retirement) follows in the next commit.

## Design win: the substrate equation

Per the Step-6 first-principles redesign, the substrate equation is:

```
Substrate :: (WorldConfig, FacetRendererRegistry) → DOM
```

The synthetic substrate's concrete instantiation realizes this equation directly:

- **WorldConfig** (`workshop/substrate/world-config.ts`) — the probe's projection into the substrate. URL-addressable, deterministic, stateless.
- **FacetRendererRegistry** (`workshop/substrate/facet-renderer.ts`) — the substrate-version surface. One renderer per facet, keyed by stable-id.
- **DOM** — rendered by `SubstrateRenderer.tsx` reading WorldConfig and mapping each facet through the registry.

Two probes with identical WorldConfig produce byte-identical DOM. Classifiers observe the DOM via Playwright at rung 3; the same WorldConfig would produce byte-identical DOM at rung 4 (production) as long as the customer substrate honors the same ARIA conventions. Substrate-invariance (memo §8.2) holds across rungs because the substrate is a pure function.

## Four graduation verdicts for Step 6

Per memo §7's graduation metrics, plus the Step-6-specific substrate ladder claim:

| Verdict | Status | Evidence |
|---|---|---|
| Substrate renders deterministically | **PASS** | WorldConfig round-trip laws W1–W7 + SubstrateRenderer's pure-function design. |
| Rung-3 classifiers produce honest observations | **PASS** | observe + interact rung-3 classifiers query real DOM / dispatch real Playwright actions; 22/22 confirms under `--adapter playwright-live`. |
| Rung-2 ↔ rung-3 parity (invariant band) | **PASS** | `scripts/verify-rung-3-parity.ts`: 7/7 classified probes agree across rungs. Covers 2 of 8 verbs — the two browser-bound ones per the Step-6 per-verb eligibility decision. |
| Test-compose + four pure-memory verbs + intent-fetch stay at rung 2 | **PASS (by design)** | Not browser-bound; rung-3 would just re-run rung-2 logic. 6/8 verbs legitimately stop at rung 2. |

## Per-verb rung coverage (final for Step 6)

| Verb | Rung 1 (dry) | Rung 2 (fixture-replay) | Rung 3 (playwright-live) | Rationale |
|---|---|---|---|---|
| observe | ✓ | ✓ | ✓ | browser-bound; real ARIA tree |
| interact | ✓ | ✓ | ✓ | browser-bound; real dispatch |
| test-compose | ✓ | ✓ | — | pure code generation; no DOM |
| facet-query | ✓ | ✓ | — | pure in-memory |
| facet-mint | ✓ | ✓ | — | pure in-memory |
| facet-enrich | ✓ | ✓ | — | pure in-memory |
| locator-health-track | ✓ | ✓ | — | pure in-memory |
| intent-fetch | ✓ | ✓ | — | network upstream, not browser |

Classifier coverage across rungs: rung-1 at 8/8 (baseline), rung-2 at 8/8, rung-3 at 2/2 of eligible verbs. The rung-3 table saturates when Step-7+ lands new browser-bound verbs.

## Why rung-3 parity lives as a script, not a vitest law

vitest aliases `@playwright/test` to a shim (`tests/support/vitest-playwright-shim.ts`) that exports the test-runner API but not `chromium.launch`. The rung-3 code path needs a real browser launch, so it cannot execute under vitest's default module-resolution.

Three paths considered:
1. **Move to `tests/integration/`** (excluded from vitest) and run via Playwright's test runner. Adds Playwright-test-runner bootstrap complexity for a logic test.
2. **Custom vitest config per-file** to un-alias `@playwright/test`. Config sprawl.
3. **Standalone Node script** — the choice. Reproducible, no runner complexity, exits 0 on parity / 1 on divergence.

The script lives at `scripts/verify-rung-3-parity.ts` and is invoked via `npm run verify:rung-3-parity`. CI includes it as a graduation gate; vitest's default run stays fast.

## Deprecation on deck (Slice 6.6)

The next commit retires `dogfood/fixtures/demo-harness/` — the v1 screen-shaped static-HTML ancestor of the synthetic substrate. Survey first, delete where unreferenced, update doc pointers. Retires naturally because:

- The synthetic substrate covers the fixtures' rung-3 rendering needs.
- `dogfood/` is being phased out per v2 doctrine.
- No rung-3 classifier reads a demo-harness HTML file.

Retention survey identifies any lingering `product/instruments/tooling/fixture-server.ts` callers; if only demo-harness uses it, it retires too.

## Next actionable tasks

1. **Slice 6.6** (this branch): retire `dogfood/fixtures/demo-harness/`. See plan.
2. **Scope 7** (separate): re-wire C6 visitor to read ProbeReceipts with `hypothesisId` — no longer blocked now that rung-3 receipts flow.
3. **Substrate-drift parity gate** (memo §8.6) — if the synthetic substrate's React version bumps or a renderer behavior changes, the rung-3 parity check catches it via `verify:rung-3-parity`. This is an operational discipline, not code to write.
4. **Second screen** (future) — per sign-off, screen-level entropy is the next Scope 6 surface. A `customer-home` renderer set or a screen-preset expansion in WorldConfig lands when customer incidents surface a need.

## Pointers

- Step 6 first-principles plan: this branch's conversation history (verdict-04 → verdict-05).
- Memo: `docs/v2-probe-ir-spike.md`.
- Prior verdicts: `workshop/observations/probe-spike-verdict-{01,02,03,04}.md`.
- Rung-3 parity verifier: `scripts/verify-rung-3-parity.ts`.
- Synthetic substrate README: `workshop/synthetic-app/README.md`.
