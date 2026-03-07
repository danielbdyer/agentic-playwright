# Tesseract Authoring Guide

This document explains how to add or change approved knowledge without collapsing the compiler into ad hoc code.

For a fast generated repo brief, read `docs/agent-context.md`. For the operational entrypoint, read `README.md`. For the product model, read `VISION.md`.

## Authoring principle

Author the smallest approved artifact that makes the intent deterministic.

Preferred order:

1. fix or extend screen-local hints
2. fix or extend element signatures or postures
3. promote a shared pattern only when reuse justifies it
4. touch runtime code only when the behavior is truly procedural

## The approved artifact set

| Artifact | Owns |
|---|---|
| `.ado-sync/snapshots/{ado_id}.json` | upstream ADO truth snapshot |
| `scenarios/{suite}/{ado_id}.scenario.yaml` | canonical scenario IR |
| `knowledge/surfaces/{screen}.surface.yaml` | structural screen decomposition |
| `knowledge/screens/{screen}.elements.yaml` | element identity and locator ladder |
| `knowledge/screens/{screen}.postures.yaml` | behavior partitions and effect chains |
| `knowledge/screens/{screen}.hints.yaml` | screen-local supplement layer |
| `knowledge/patterns/*.yaml` | promoted shared supplement layer |
| `knowledge/snapshots/**` | ARIA assertion templates |
| `.tesseract/evidence/**` | evidence for proposed canonical changes |

## Deterministic vs review-required

Use this rule when deciding whether a change should exist at all:

- if the compiler can derive it from already approved artifacts, do not create a new canonical file
- if the compiler cannot derive it and the missing fact should persist, encode that fact in canonical knowledge and route it through review

Outputs derived from approved artifacts become:

- `confidence: compiler-derived`
- `governance: approved`

New or changed canonical knowledge remains review-gated.

## Scenario IR

`scenarios/**/*.scenario.yaml` is canonical IR, not generated output.

Rules:

- preserve `intent` exactly from ADO
- use explicit fields only when deterministic inference is not enough or when human intent must override it
- keep scenario data declarative
- do not encode DOM trivia or widget choreography here

A scenario file should answer: what should happen, not how Playwright should do it.

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

Use it for screen-local facts that help deterministic inference without changing runtime behavior globally:

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

## Runtime affordances

Affordances are declarative runtime hints. They do not replace widget handlers.

Use them when:

- the widget family is already known
- one screen variant needs a stable behavioral hint
- the hint can stay small and declarative

Do not turn affordances into mini scripts. Procedural interaction still belongs in `knowledge/components/*.ts` and `lib/runtime/`.

## Evidence and proposals

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

## Review artifacts

After `npm run refresh`, inspect:

- `.tesseract/bound/{ado_id}.json`
- `generated/{suite}/{ado_id}.trace.json`
- `generated/{suite}/{ado_id}.review.md`
- `.tesseract/graph/index.json`

These should answer:

- what was derived deterministically
- which hints were used
- which patterns were used
- whether anything is review-required
- what else would be impacted by a canonical change

## Common workflows

### Add a new screen

1. capture or author `knowledge/surfaces/{screen}.surface.yaml`
2. author `knowledge/screens/{screen}.elements.yaml`
3. add `knowledge/screens/{screen}.postures.yaml` when the screen has durable data behavior
4. add `knowledge/screens/{screen}.hints.yaml` only for inference gaps
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
4. update affected hints or inference rules to reference the promoted pattern
5. keep provenance visible in trace and graph outputs

## Anti-patterns

Do not introduce:

- hidden runtime conditionals for one screen when a hint would do
- parallel truth stores outside canonical artifacts
- hand-edits to generated specs, trace JSON, or review Markdown
- stringly typed pseudo-DSLs embedded in runtime code
- human-only lore that is not captured in canonical knowledge or evidence

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

