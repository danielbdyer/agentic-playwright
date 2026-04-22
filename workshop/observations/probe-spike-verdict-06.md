# Probe IR Spike — Verdict 06

**Date:** 2026-04-22
**Event:** First-principles substrate refactor lands. The v1 demo-harness era retires in the same branch push. The synthetic substrate now speaks axis-based vocabulary end to end — SurfaceSpec + WorldShape + EntropyProfile + one universal SurfaceRenderer + one universal EntropyWrapper.

## The verdict, in one line

**The substrate speaks the classifier's language, not demo-harness's.** What the rung-3 probe asks a classifier to judge now matches what the classifier actually probes: role, accessible name, visibility, enabled, input-backing, detach timing. No made-up business-domain vocabulary. No per-facet renderer files. No screens-as-pages. One pure function `(WorldShape) → DOM`; everything else is data.

## Why this refactor happened

Verdict-05 landed a lift-and-shift port of the demo-harness vocabulary into v2 skin. Policy-search:searchButton became a FacetRenderer; hide-target became a hook; the fixture-replay harness dispatched against a facet-renderer registry. Reviewable, working, wrong.

The vocabulary carried no information the classifier consumes. A rung-3 observe classifier queries `getByRole('button', { name: 'Search' })` — not "policy-search:searchButton." The name carried a made-up business domain that had no relationship to the axis-space the classifier probes. The substrate's vocabulary and the classifier's vocabulary were misaligned.

This refactor realigns them. The fixture says `{ role: button, name: "Action", visibility: display-none }`. The SurfaceRenderer realizes those axes in DOM. The classifier reads those same axes via Playwright locators. One vocabulary, three places.

## The eight F-slices

| Slice | Commits | What shipped |
|---|---|---|
| F1 | `0398f38` | SurfaceSpec (axis-based surface) + EntropyProfile (seeded variance) + WorldShape (substrate input) + 19 laws |
| F2 | `69071cd` | Universal SurfaceRenderer (one component for 13 roles) + EntropyWrapper (applies the fuzz profile) + SubstrateRenderer rewrite |
| F3 | `a5f27ed` | All 8 fixture YAMLs rewritten in axis-based vocabulary; demo-harness identifiers scrubbed |
| F4 | `b5e0cd9` | Rung-2 + rung-3 classifiers consume `world.surfaces[]` / `world.catalog.*` / `world.upstream.*`; projectProbeToWorldShape replaces legacy projection |
| F5 | `2396eb9` | FacetRenderer + ScreenPreset + WorldConfig modules deleted (-920 lines) |
| F6 | `2c68dd5` | MCP + dashboard + speedrun + convergence-proof swap from startFixtureServer to startSubstrateServer |
| F7 | `05bbc9f` | demo-harness directory + fixture-server.ts + v1 integration test deleted (-24,648 lines) |
| F8 | (this) | Verdict-06 + full regression + push |

## The substrate equation, realized

```
Substrate :: (WorldShape) → DOM
```

- **SurfaceSpec** — a point in axis-space: role, name, visibility, enabled, inputBacking, detachAfterMs, surfaceId, initialValue. Each field is one independent axis.
- **WorldShape** — `{ surfaces: SurfaceSpec[], entropy?, preset? }`. Serialized onto a URL as the `shape` query parameter.
- **EntropyProfile** — seeded variance. Full fuzz set: wrapperDepth, chromeTone, spacingDensity, siblingJitter, surfaceOrder, calloutShuffle, badgeSubset. Deterministic via LCG RNG.

The renderer is ONE file (`SurfaceRenderer.tsx`). It handles 13 ARIA roles, four input backings, five visibility mechanisms, and detach timing. No per-facet files.

The entropy wrapper is ONE file (`EntropyWrapper.tsx`). It applies every fuzz axis orthogonally to any SurfaceSpec. Ported from the policy-journey.tsx fuzz profile and made universal.

## What the rung-3 parity proves now

The substrate-invariance claim from memo §8.2 holds literally now — the vocabulary the probe declares IS the vocabulary the substrate renders IS the vocabulary the classifier queries. A probe's receipt is honest because the three layers speak the same axis language.

Rung-3 parity verification at branch head:
```
$ npm run verify:rung-3-parity
rung-3 parity: 7 probes across 2 classified verbs (interact, observe)
rung-3 parity: launching Chromium + substrate server...
rung-3 parity: PASS — 7/7 probes agree across rungs
```

## What shipped alongside — demo-harness retirement

The first-principles substrate made the retirement trivial. Since no v2 code speaks demo-harness vocabulary, and the v1 callers (speedrun, MCP, dashboard, convergence-proof) only needed a running HTTP server at a baseUrl, the swap was mechanical:

1. `startSubstrateServer` is a drop-in for `startFixtureServer` (same return shape).
2. The substrate server treats every non-bundle path as the React shell, so legacy URLs (`/policy-search.html`) get a 200 response (with empty DOM until the caller supplies a `?shape=...`).
3. All four callers swap one import and rename.
4. Delete demo-harness + fixture-server + the one v1 integration test that read HTML fixtures from disk.

Net deletion: 11 files removed, ~24,700 lines gone.

## Test count

The test count drops from 122 (verdict-05-era) to 97 — not regression, but deletion:
- FacetRenderer laws: retired.
- ScreenPreset laws: retired.
- WorldConfig laws: retired.
- compiler-harvest-idempotence integration test: retired.

The 97 remaining tests cover the first-principles primitives end to end:
- substrate-server laws (6)
- world-shape laws (8)
- surface-spec laws (3)
- entropy-profile laws (6)
- derive-probes laws (12)
- spike-harness laws (9)
- fixture-replay-harness laws (5)
- substrate-parity laws (3)
- verb-classifier laws (4)
- per-verb classifier laws (24 across 6 classifiers)
- seam-enforcement laws (3 rules)
- additional per-fixture loader and cohort laws

## The spike, at branch head

```
$ node dist/bin/tesseract.js probe-spike
Coverage: 8/8 verbs (100.0%) — gate PASS @ 80%
Probes synthesized: 22
Receipts confirming expectation: 22/22

$ node dist/bin/tesseract.js probe-spike --adapter fixture-replay
Coverage: 8/8 verbs (100.0%) — gate PASS @ 80%
Probes synthesized: 22
Receipts confirming expectation: 22/22

$ node dist/bin/tesseract.js probe-spike --adapter playwright-live
Coverage: 8/8 verbs (100.0%) — gate PASS @ 80%
Probes synthesized: 22
Receipts confirming expectation: 22/22
```

All three rungs 22/22. Every declared error family fires against real Playwright behavior at rung 3 or rung-2 axis inspection at rung 2 — always via the same substrate vocabulary.

## The substrate's two-file heart

```
workshop/substrate/
  surface-spec.ts    — axis-based surface description
  entropy-profile.ts — seeded fuzz axes
  world-shape.ts     — canonical substrate input + URL wire format

workshop/synthetic-app/src/
  SurfaceRenderer.tsx  — one component for all specs
  EntropyWrapper.tsx   — one component for all entropy
  SubstrateRenderer.tsx — root composing both
  bootstrap.tsx        — entry
```

That's it. Seven files, three of which are the substrate equation's primitives and four of which are the React instantiation. No per-facet renderer. No screen preset registry. No fixture-server shim. No demo-harness.

Screens return as a concept — per the sign-off — when they reappear as "end-to-end synthetic integration tests" (named compositions of surfaces + entropy, not business-domain HTML pages). Today the substrate has no need for the concept; we didn't force it.

## Next actionable tasks

1. **Screen-level integration tests** (future): reintroduce screens as `{ name: 'search-form', surfaces: [...], entropy: {...} }` compositions when a real need arises — e.g., the first rung-3 test that needs >1 surface in a probe to test a real workflow. No code exists for this today; the primitives don't block it.

2. **Second-wave rung-3 classifiers** (future): currently `observe` + `interact` have rung-3 classifiers. If a future verb gains a browser-bound runtime path (e.g., a future `ui-navigate` verb), its rung-3 classifier lands alongside.

3. **Scenario corpus rewrite** (v1 wind-down, separate workstream): v1 speedrun scenarios still reference `/policy-search.html`-style paths. They'll 404-land on the React shell and render no-world. When v1 retires (Step 7+), those scenarios retire with it.

4. **Customer-incident ratchet** (memo §8.5): the first real customer incident produces a new SurfaceSpec-described probe. The fixture authoring pattern is now canonical — no vocabulary to invent.

## Pointers

- Memo: `docs/v2-probe-ir-spike.md`.
- Prior verdicts: `workshop/observations/probe-spike-verdict-{01..05}.md`.
- First-principles substrate primitives: `workshop/substrate/`.
- Universal renderer + entropy: `workshop/synthetic-app/src/`.
- Rung-3 parity script: `scripts/verify-rung-3-parity.ts`.
