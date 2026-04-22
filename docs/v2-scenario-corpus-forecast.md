# Scenario Corpus — v2 Forecast

> Status: forward-looking design memo (2026-04-22). Written after
> Tier-1–3 substrate completion (verdict-07). Describes the
> anticipated shape of a v2 scenario corpus — where it fits above
> the probe IR and what production fidelity it captures that
> primitives alone cannot.

## Context

The v2 substrate after verdict-07 is axis-first, composable, and
entropy-faithful. It covers the atomic and shallow-compositional
cases. What it does not capture — and where a scenario corpus
must eventually sit — is **sequenced world-state** and **cross-verb
invariants**.

This memo forecasts the shape of that corpus so we can design the
probe IR today with the right seams for tomorrow's corpus. The
corpus has not been built; this is how it will likely look.

## Primary claim

**Scenarios are sequences of probes with state dependencies.**

A probe asserts a point: "under world W, verb V produces
classification C." A scenario asserts a trajectory: "given initial
world W₀, under actions A₁…Aₙ, the system's state evolves through
observable states S₁…Sₙ, each with its own classification." The
probe IR is the atomic unit; scenarios compose atoms into
meaningful workflows.

## Where the primitives already suffice

These cases the current substrate handles without a scenario
corpus:

1. **Single-surface probing** — any atomic axis combination.
2. **Role disambiguation** — target among siblings via name.
3. **Composed ARIA** — nested topologies to arbitrary depth.
4. **Form validation at submit** — required-field check + success/error reveal.
5. **Entropy-invariant classification** — same outcome under chrome perturbation.
6. **Landmark-aware queries** — banner / navigation / main / complementary / contentinfo.
7. **Upstream-hook failure routing** — rate-limited / transport-failure / malformed-payload / unreachable.

If a test question reduces to "what happens at ONE point in time
under ONE world shape," the probe IR is sufficient.

## Where a scenario corpus is needed

### Sequenced workflows

The substrate can render "form with success alert shown" OR "form
before submit." A probe cannot assert the **transition** from one
to the other. A scenario can.

Examples:
- **Checkout flow**: fill address → fill payment → review → confirm → observe receipt. Five probes in a sequence; each assumes the prior probe's world-state held.
- **Correction path**: submit invalid → observe error → clear field → re-fill correctly → submit → observe success. The *correction* depends on having seen the error.
- **Dependent-field cascade**: select country → state dropdown repopulates → select state → city dropdown repopulates. Each selection's effect is visible only in the next probe.

### Cross-page state persistence

Probes are stateless; each navigates fresh to a new URL with a new
WorldShape. Real flows retain state:

- **Session cookies** carry auth across pages.
- **localStorage / sessionStorage** persists UI preferences.
- **Form draft state** survives navigation.
- **URL history** drives back/forward semantics.

The substrate deliberately doesn't model these. Scenarios must.

### Timing and flakiness

The substrate renders instantly. Real apps have:

- CSS transitions (300–600ms animations during which targets are ambiguous).
- Lazy-loaded content (elements appear N ms after load).
- Skeleton placeholders (wrong DOM first, right DOM after data arrives).
- Progressive hydration (server-rendered HTML, client JS takes over, event handlers become live later).
- Debounced input handling (typing → validation fires on stop).

Scenarios encode expected timing envelopes: "within 500ms, the
alert must become visible."

### Content variability at semantic layer

- **Pagination**: 0, 1, 10, 100 results. The empty state differs semantically from the populated state; rendering logic may differ per size tier.
- **Locale**: English, RTL languages, long-string stress. The substrate's axis vocabulary is language-agnostic; scenarios test actual content handling.
- **Data-driven branches**: "if user is admin, show admin panel; otherwise hide it." Roles that predicate entire surfaces.

### Network-coupled state

`intent-fetch` today has upstream hooks. What's missing:

- Submitting a form produces a backend response; the DOM updates accordingly.
- Polling: the page periodically re-fetches; observations change over time.
- WebSocket / SSE push: the DOM mutates on external events, not user actions.

These require scenario-level orchestration of the upstream + DOM
together.

### Accessibility invariants over time

- `role=alert` must announce exactly once (not re-announce on unrelated re-renders).
- Focus must return to a sensible element after modal close.
- Live regions should debounce announcements (avoid screen-reader spam).

These are multi-event properties. Scenarios can encode them;
probes cannot.

### Cross-verb invariants

- "After `locator-health-track` records a failure for strategy S on facet F, subsequent `observe` on F prefers strategy S'."
- "After `facet-enrich` adds an alias to F, subsequent `facet-query` by that alias resolves F."
- "After `navigate` to page P, subsequent `observe` queries run against P's DOM."

Each invariant crosses ≥2 verb calls with shared state. Scenarios.

## Anticipated corpus shape

### Layer placement

```
                  scenarios/           ← sequences + invariants
                       │
                       ▼
                  probe IR             ← atomic verb probes
                       │
                       ▼
              world-shape + substrate  ← axis-first rendering
```

Scenarios sit *above* the probe IR, composing probes into
sequences. They never replace probes; they invoke them.

### Scenario grammar sketch

```yaml
# workshop/scenarios/form-success-recovery.scenario.yaml
scenario: form-success-recovery
surface: login-form      # topology preset
entropy:
  seed: scenario-login-recovery
steps:
  - name: initial-observe
    probe:
      verb: observe
      target: { role: button, name: Submit }
    expected: { classification: matched }
  - name: submit-empty
    probe:
      verb: interact
      target: { role: button, name: Submit }
      action: click
    expected: { classification: matched }
    assert-substrate-state:
      - role: alert
        name: "Please complete required fields"
        visible: true
  - name: fill-identifier
    probe:
      verb: interact
      target: { role: textbox, name: Identifier }
      action: input
      value: alice
    expected: { classification: matched }
  - name: fill-passphrase
    probe:
      verb: interact
      target: { role: textbox, name: Passphrase }
      action: input
      value: secret
    expected: { classification: matched }
  - name: resubmit
    probe:
      verb: interact
      target: { role: button, name: Submit }
      action: click
    expected: { classification: matched }
    assert-substrate-state:
      - role: status
        name: "Signed in"
        visible: true
```

Each step carries its own probe. The scenario's correctness is the
conjunction of all step outcomes plus any `assert-substrate-state`
predicates evaluated between steps.

### Scenario types

**Trajectory scenarios**: linear sequence of N steps with expected outcomes at each. Most common.

**Branching scenarios**: "at step K, if X holds, continue with path A; else path B." Encodes conditional flows (admin vs non-admin, logged-in vs guest).

**Invariant scenarios**: "across these N steps, property P must hold at every step." Checks for ARIA stability, focus management, live-region discipline.

**Replay scenarios**: "run sequence of steps; observe replay run produces byte-identical outcomes." Reproducibility at scenario level.

### Generation patterns

**Parametric scenarios**: one scenario template × M parameter combos = M concrete scenarios. Example: "fill-form-with-K-invalid-inputs" for K ∈ {1..5}.

**Fuzzed scenarios**: scenario template + entropy seed spectrum. Same trajectory, perturbed chrome, M scenarios.

**Recorded scenarios**: captured from customer-reported incidents. Each incident becomes a scenario whose expected outcomes are the resolution criteria.

## Design constraints on today's probe IR (that the corpus will inherit)

To make scenario composition natural, the probe IR should preserve
these properties as it evolves:

1. **Probes are idempotent wrt substrate state.** A probe's receipt
   is a function of `(probe, substrate-state-at-observation)`. This
   composes cleanly — a scenario's invariant is a conjunction of
   receipt predicates.

2. **World-shape is declarative.** Scenarios reuse topology presets;
   the preset registry scales. If world-shape becomes imperative,
   scenario authoring multiplies.

3. **Receipts are append-only.** A scenario can assemble a full
   trajectory by concatenating its steps' receipts. No mutation
   means no per-scenario replay divergence.

4. **Substrate-version stamped.** Scenarios spanning weeks of
   substrate evolution correlate receipts against the substrate
   version they were emitted under. Drift detection.

5. **Axis-invariance gate.** Entropy perturbation must not alter
   receipt outcomes (verdict-07 axis-invariance law). Scenarios can
   run under fresh seeds without the expected trajectory changing.

## When the corpus lands

Scenarios are Phase 3 (Step 8+) work per `docs/v2-direction.md §6`.
Indicators that the corpus is ready to land:

- **Classifier coverage at 9/9**: ✓ today.
- **Form state realized**: ✓ (FormRenderer's submit-reveal).
- **Flow primitive available**: pending T4-full (deferred from verdict-07).
- **First customer incident with a multi-step flow**: triggers corpus authoring.

Until then, single-probe fixtures continue to extend the substrate's
coverage matrix; scenarios wait for a real trajectory-shaped test
question.

## Non-goals

- **No scenario corpus ported from v1.** v1 dogfood scenarios
  referenced demo-harness and carry business-domain thematic weight.
  The v2 corpus starts empty; scenarios author from the primitives
  + customer incidents.
- **No "screens as scenarios."** A screen is a surface composition
  (handled by topologies). A scenario is a sequence through surfaces
  (the new concept). They don't overlap.
- **No scenario-as-business-logic.** Scenarios exercise invariants
  of the substrate + probe IR; they don't encode product-domain
  logic (which belongs in `product/domain/`).

## Open questions for corpus design

1. **Scenario identity**: content-addressable via fingerprint of
   (steps, surface, entropy)? Stable-ID per scenario?
2. **Receipt sequencing**: emit one receipt per step or one envelope
   per scenario? Current ProbeReceipt is per-probe; scenarios
   likely want a wrapper.
3. **Failure-at-step semantics**: does a scenario fail fast on first
   step mismatch, or run to completion and report all divergences?
4. **Scenario-level entropy**: per-step seeded RNG, or one seed
   governs the whole trajectory? The second is more reproducible;
   the first tests more axis variation.

These resolve at first scenario authoring. The memo's purpose is
to name the shape; the details fall out of the first real use case.

## Pointers

- Memo: `docs/v2-probe-ir-spike.md` (the parent probe-IR doctrine).
- Primitives: `workshop/substrate/` — the surface vocabulary the
  corpus will compose.
- Topology catalog: `workshop/substrate/test-topology-catalog.ts`
  — the shapes scenarios reuse.
- Verdicts 01–07: the probe-IR graduation history.
- Direction: `docs/v2-direction.md §6 Step 8+` — the construction
  order placement for this corpus.
