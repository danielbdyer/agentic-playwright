# Tesseract Authoring Guide

This document explains how to add or change approved knowledge without collapsing the preparation pipeline or runtime agent into ad hoc code.

For a fast generated repo brief, read `docs/agent-context.md`. For the operational entrypoint, read `README.md`. For the product model, read `VISION.md`. For operator loops and approval/rerun flow, read `docs/operator-handbook.md`.

## Authoring principle

Author the smallest approved artifact that improves the shared human-agent interface.

Preferred order:

1. preserve raw scenario intent and add explicit `resolution` only when needed
2. fix or extend screen-local hints
3. fix or extend element signatures or postures
4. promote a shared pattern only when reuse justifies it
5. touch runtime code only when the behavior is truly procedural

## The approved artifact set

| Artifact | Owns |
|---|---|
| `.ado-sync/snapshots/{ado_id}.json` | upstream ADO truth snapshot |
| `benchmarks/*.benchmark.yaml` | benchmark field catalogs, drifts, and expansion rules |
| `controls/datasets/*.dataset.yaml` | canonical dataset bundles and generated-token defaults |
| `controls/resolution/*.resolution.yaml` | canonical persistent resolution overrides |
| `controls/runbooks/*.runbook.yaml` | canonical run selection and interpreter defaults |
| `scenarios/{suite}/{ado_id}.scenario.yaml` | canonical scenario IR |
| `knowledge/surfaces/{screen}.surface.yaml` | structural screen decomposition |
| `knowledge/screens/{screen}.elements.yaml` | element identity and locator ladder |
| `knowledge/screens/{screen}.postures.yaml` | behavior partitions and effect chains |
| `knowledge/screens/{screen}.hints.yaml` | screen-local supplement layer |
| `knowledge/patterns/*.yaml` | promoted shared supplement layer |
| `knowledge/snapshots/**` | ARIA assertion templates |
| `.tesseract/evidence/**` | evidence for proposed canonical changes |

## Deterministic vs active canon

Use this rule when deciding whether a change should exist at all:

- if the compiler can derive it from existing canonical artifacts, do not create a new canonical file
- if the compiler cannot derive it and the missing fact should persist, encode or activate that fact in canonical knowledge with provenance and certification metadata

Outputs derived from approved artifacts become:

- `confidence: compiler-derived`
- `governance: approved`

Intent-preserving steps that are valid but not yet resolved become:

- `confidence: intent-only`
- `binding.kind: deferred`
- `governance: approved`

Runtime-acquired canonical knowledge should carry:

- `certification: uncertified | certified`
- `activatedAt`
- lineage back to runs, evidence, and source artifacts

New or changed canonical knowledge can activate immediately when it is schema-valid. Certification is an official designation, not an execution brake.

## Scenario IR

`scenarios/**/*.scenario.yaml` is canonical IR, not generated output.

Rules:

- preserve `intent`, `action_text`, and `expected_text` from ADO
- use optional `resolution` only when human or approved structure must constrain runtime interpretation
- keep scenario data declarative
- do not encode DOM trivia or widget choreography here

A scenario file should answer: what should happen, not how Playwright should do it. The runtime agent consumes this canonical intent through the task packet, not through hidden repo lore.

## Controls

`controls/` is the persistent tuning surface for operator and agent overrides. It is canonical input, not a scratch directory.

Use `controls/datasets/*.dataset.yaml` for:

- named fixture bundles
- default element values keyed by `screen.element`
- generated-token seeds that should persist across runs

Use `controls/resolution/*.resolution.yaml` for:

- scenario or step-scoped resolution overrides that should survive regeneration
- operator-approved action, screen, element, posture, override, or snapshot fixes

Use `controls/runbooks/*.runbook.yaml` for:

- run selection by suite, tag, or explicit scenario
- interpreter defaults
- default dataset and resolution-control bindings

Keep application truth in `knowledge/`. Use `controls/` to tune how approved truth is selected and executed.

## Element signatures

`knowledge/screens/{screen}.elements.yaml` defines identity.

Use it for:

- role
- accessible name
- ordered locator ladder
- widget type
- surface membership
- optional affordance when the runtime needs a stable declarative hint

Prefer locator ladders in this order:

1. `test-id`
2. `role-name`
3. `css`

A selector repair should usually update one element signature, not many generated specs.

## Posture contracts

`knowledge/screens/{screen}.postures.yaml` defines behavior partitions.

Use postures for durable semantic dispositions such as:

- `valid`
- `invalid`
- `empty`
- `boundary`

Keep effects flat and reviewable:

- `target`
- `state`
- optional `message`

A posture contract should be reusable by every future scenario that applies the same disposition to the same field.

## Screen hints

`knowledge/screens/{screen}.hints.yaml` is the first supplement layer.

Use it for screen-local facts that help runtime interpretation without changing runtime behavior globally:

- screen aliases
- element aliases
- default value refs
- ADO parameter cues
- snapshot aliases
- local affordances

Examples of good hint usage:

- a field is consistently called "policy no" in ADO but "Policy Number" in ARIA
- a step refers to "search field" and there is one screen-local input that should win
- a snapshot assertion phrase should map to one specific section template

Do not put cross-screen abstractions here.

## Shared patterns

`knowledge/patterns/*.yaml` is the promoted supplement layer.

Use it for abstractions that are intentionally cross-screen:

- reusable action alias sets
- reusable posture alias sets
- promoted repair or affordance patterns after they are proven locally

Promotion rule:

- prove value locally first
- promote only after repeated use or deliberate standardization

If a pattern is still only meaningful on one screen, keep it in that screen's hints.

Additional boundary:

- only persist artifacts here when they express operator-approved, intentionally reusable knowledge
- do not store site-specific experimental harvests or synthetic proof artifacts in `knowledge/patterns/`
- if a behavior YAML exists only to exercise compiler/runtime invariants, keep it under `tests/fixtures/` and seed it into a temp workspace during the test

`knowledge/patterns/` is not a staging area for disposable agent output. Runtime or agentic discovery should activate screen-local canon first, stay provenance-rich, and promote into shared patterns only after repetition or deliberate standardization.

## Test fixtures vs canonical knowledge

Use `tests/fixtures/knowledge/**` for artifacts that exist only to prove determinism, validation, promotion boundaries, or runtime closure.

Use `knowledge/**` only when all of the following are true:

- the fact is intended to persist beyond one test run
- the fact is not just a scaffold for a demo or experimental site
- an operator would plausibly review and approve it as canonical knowledge

Examples that belong in `tests/fixtures/knowledge/**`:

- duplicate-transition proofs
- support-cycle proofs
- synthetic behavior patterns used only to exercise projection reuse

Examples that may belong in `knowledge/**`:

- globally reusable alias/posture vocabularies
- screen-local knowledge for a deliberately curated site after operator/agent alignment
- promoted shared patterns that have proven reuse across independently curated screens

## Runtime affordances

Affordances are declarative runtime hints. They do not replace widget handlers.

Use them when:

- the widget family is already known
- one screen variant needs a stable behavioral hint
- the hint can stay small and declarative

Do not turn affordances into mini scripts. Procedural interaction still belongs in `knowledge/components/*.ts` and `lib/runtime/`.

## Evidence, proposals, and generated tests

When an agent discovers missing knowledge, persist evidence before proposing canonical change.

Evidence should explain:

- what triggered the discovery
- what artifact would change
- what field would change
- what observation supports it
- how risky the change is

Typical proposal classes:

- locator repair
- step binding supplement
- widget affordance supplement
- pattern promotion
- snapshot template update

Agents may also emit or update generated tests that exercise the same typed interfaces a human would use. That is allowed because generated specs are disposable object code, not canonical truth. The durable review surface remains:

- canonical scenario intent
- task packets
- run receipts
- evidence
- proposal bundles

A human may also author a testable concern directly against the generated type surface. If it fits the same typed contract, it should run through the same runtime handshake and remain inspectable through the same trace, review, and graph outputs.

## Review artifacts

After `npm run refresh`, inspect:

- `npm run workflow`
- `.tesseract/bound/{ado_id}.json`
- `.tesseract/tasks/{ado_id}.resolution.json`
- `generated/{suite}/{ado_id}.trace.json`
- `generated/{suite}/{ado_id}.review.md`
- `.tesseract/graph/index.json`

After `npm run run`, also inspect:

- `.tesseract/runs/{ado_id}/{run_id}/interpretation.json`
- `.tesseract/runs/{ado_id}/{run_id}/execution.json`
- `.tesseract/runs/{ado_id}/{run_id}/run.json`
- `generated/{suite}/{ado_id}.proposals.json`

These should answer:

- what was preserved deterministically
- which control surface won when intent did not decide on its own
- what task context the agent received
- which hints, patterns, and prior evidence were used
- whether the agent resolved, resolved-with-proposals, or truly needed a human
- whether anything is uncertified, certified, or still needs operator follow-up
- what else would be impacted by a canonical change

## Development feedback loop

While the runtime interaction model is still evolving, treat agent feedback as another unit-sized artifact candidate, not as implicit chat-only lore.

Good feedback asks:

- was task granularity right for the job
- was unresolved context better presented step-by-step or in bulk
- what did the agent have to discover that should have been present in docs or instructions
- what safe recursive update would improve the next run without mutating canon blindly

Guardrails:

- feedback should never block execution or replace the formal run receipt
- feedback should prefer small prompt, doc, or supplement updates over foundational churn
- feedback should not escalate to a human unless the runtime path already exhausted approved knowledge, prior evidence, live DOM exploration, and safe degraded resolution

## Common workflows

### Add a new screen

1. capture or author `knowledge/surfaces/{screen}.surface.yaml`
2. author `knowledge/screens/{screen}.elements.yaml`
3. add `knowledge/screens/{screen}.postures.yaml` when the screen has durable data behavior
4. add `knowledge/screens/{screen}.hints.yaml` only for runtime interpretation gaps
5. run `npm run surface`, `npm run refresh`, `npm run graph`, and `npm test`

### Repair a brittle selector

1. update the element's locator ladder in one place
2. keep the older rung only if it still adds safe fallback value
3. rerun `npm run refresh`
4. inspect the review artifact and trace
5. confirm impact through `npm run impact`

### Promote a local supplement

1. prove the behavior with a screen hint first
2. collect repetition or evidence
3. move the shared abstraction into `knowledge/patterns/`
4. update affected hints or task-facing runtime knowledge to reference the promoted pattern
5. keep provenance visible in trace and graph outputs

## Anti-patterns

Do not introduce:

- hidden runtime conditionals for one screen when a hint would do
- parallel truth stores outside canonical artifacts
- hand-edits to generated specs, trace JSON, or review Markdown
- stringly typed pseudo-DSLs embedded in runtime code
- human-only lore that is not captured in canonical knowledge or evidence
- escalating to a human before the agent has exhausted approved knowledge, prior evidence, DOM exploration, and safe degraded resolution

## Verification checklist

Before finishing a change, verify:

- `npm run check`
- `generated/...review.md` still matches the ADO wording and the inferred step program
- graph/trace still show the right supplement and policy edges

Guardrail notes:

- `npm run check` is intentionally quiet on success and fully diagnostic on the first failing phase
- `npm run lint` ignores derived outputs such as `.ado-sync/`, `.tesseract/`, `generated/`, `lib/generated/`, `dist/`, and `test-results/`
- `npm run typecheck` includes `tests/` so fixture drift fails before runtime
- `npm run knip` is maintainer-only in this pass and is not part of the blocking gate yet

If the system cannot explain the change through its artifacts, keep modeling.
