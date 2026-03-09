# Tesseract Vision

Tesseract is not a test framework.

It is a compiler from human verification intent to executable verification, backed by a living knowledge system that grows through use.

The source program is the Azure DevOps manual test case. The emitted object code is Playwright. The durable value is the knowledge captured between those two surfaces and the typed runtime receipts that explain how intent was resolved.

## The six concern lanes

The repo now treats its moving parts as six explicit lanes:

- `intent`: source snapshots and scenario IR
- `knowledge`: reviewed structural and semantic UI knowledge
- `control`: datasets, runbooks, and persistent overrides
- `resolution`: task packets and interpretation receipts
- `execution`: execution receipts and run records
- `governance/projection`: trust policy, review projections, and graph/reporting surfaces

The point of the split is not taxonomy for its own sake. It is to make each concern independently optimizable without collapsing into hidden shared state.

## The bet

If a manual test is written clearly enough for a QA to infer step-wise behavior from it, then an agent can infer the same behavior from it when given a constrained, reviewable knowledge surface plus a task packet that makes the available memory explicit.

That is the core bet behind Tesseract:

- manual tests are not second-class prose
- they are upstream source code
- the preparation lane should preserve their wording
- the runtime lane should resolve them through approved knowledge before touching the live DOM

## What changes with this model

Traditional automation stores too much irreplaceable knowledge inside hand-written tests.

A tester reads a case, infers the UI, writes selectors, hardcodes data, sprinkles assertions around the file, and then maintains that code forever while both the product and the test intent drift.

Tesseract externalizes that knowledge instead.

It captures small facts in small files and keeps the handshake between those files explicit:

- what a screen is structurally
- what an element is semantically
- how a field behaves under different postures
- what phrases on one screen map to what known elements or snapshots
- what cross-screen patterns have been promoted into shared knowledge
- what datasets, runbooks, or approved overrides should tune runtime behavior without mutating application truth

That knowledge is then projected into a runtime task packet so both humans and agents can see the same working context. Each handoff is carried in a typed envelope with stable lineage and fingerprints.

The generated tests are disposable. The knowledge is the asset.

The readable spec surface matters too. A generated test should read like a workflow facade over the machine contract, not like a raw object dump. The runtime handshake owns execution; the emitted spec owns legibility.

## The new governance boundary

The most important operating rule is simple:

- deterministic derivations from approved artifacts are auto-approved
- knowledge confidence grows through successful use without requiring human blessing
- human review is reserved for destructive changes to leading hypotheses

That means a QA team does not need to bless every working bound step one by one. If the preparation lane used approved elements, postures, hints, patterns, and snapshots through deterministic precedence rules, the output is executable now.

Confidence accrues automatically through repeat runs. When an element's locator resolves successfully across multiple scenarios, its confidence score increases. When a hint's disambiguation proves consistent, its confidence increases. The system biases in the agent's favor as long as evidence keeps flowing. A well-reasoned agent thesis is inherently trustworthy within tolerance thresholds.

Human review is reserved for destructive changes to the leading hypothesis:

- a selector must be created or healed because the DOM changed
- a snapshot template must be updated because the UI structure shifted
- a posture contract must be revised because application behavior changed
- a locator ladder needs a structural repair after evidence of degradation

In these cases the agent returns the proposed change with proof it works. Increasing confidence within a tolerance threshold is a signal to keep going, not to pause.

This keeps humans focused on exceptions and structural shifts, not on routine knowledge growth.

## QA workflow

The QA-facing loop should feel like this:

1. author or refine the manual case in Azure DevOps
2. sync and refresh the scenario
3. inspect the workflow map, bound envelope, task packet, and generated review surface
4. run the scenario and inspect interpretation and execution receipts
5. approve only when the system proposes new canonical knowledge
6. rerun and observe whether the knowledge ratchet reduced future effort

The QA should not need to read Playwright internals to answer whether the compiler was faithful.

That is why each scenario now emits:

- `.tesseract/bound/{ado_id}.json`
- `.tesseract/tasks/{ado_id}.resolution.json`
- `generated/{suite}/{ado_id}.spec.ts`
- `generated/{suite}/{ado_id}.trace.json`
- `generated/{suite}/{ado_id}.review.md`
- `generated/{suite}/{ado_id}.proposals.json`
- `.tesseract/runs/{ado_id}/{run_id}/run.json`

The spec is executable. The trace is machine-readable provenance. The review Markdown is the human explanation layer. The task packet and run receipts are the explicit handshake between the deterministic substrate and the runtime agent.

## Review fidelity

The generated review surface must let a QA answer, step by step:

- what exact ADO text was preserved
- how the preparation lane normalized and classified that text
- whether the step is `compiler-derived`, `intent-only`, or structurally `unbound`
- what task context and approved files were handed to the runtime agent
- what screen, element, posture, or snapshot the runtime actually resolved to
- which lane and precedence stack supplied the winning decision
- whether the step resolved safely, resolved-with-proposals, or still needs a human

That is the contract. If the review artifact cannot explain a step, the model is incomplete.

## Supplement hierarchy

Not every useful fact deserves a runtime code change.

Tesseract treats supplements as first-class knowledge:

- screen-local supplements live in `knowledge/screens/{screen}.hints.yaml`
- promoted shared supplements live in `knowledge/patterns/*.yaml`

This hierarchy matters because it lets the system learn without over-generalizing too early.

A local hint can encode:

- aliases
- default value refs
- parameter cues
- snapshot aliases
- local affordances

A promoted pattern can encode:

- shared action vocabularies
- shared posture vocabularies
- promoted interaction or repair abstractions that proved reusable

The promotion rule is deliberate:

- local first
- shared second

That keeps the knowledge base grounded instead of turning it into abstract prompt lore.

## Locator ladders and brittle-green visibility

Selector drift is unavoidable in OutSystems. The answer is not to bury more selectors in more tests.

Tesseract centralizes locator strategy in element signatures and supports ordered ladders such as:

1. `test-id`
2. `role-name`
3. `css`

If a fallback rung succeeds, the run may still be green, but it is not healthy in the same way. The system should surface that as degraded locator use so the knowledge can be hardened before a wider failure appears.

This is part of the broader product goal: make silent brittleness visible.

## Negative testing through posture

The posture model remains the breakthrough.

A field should not be described only by the value typed into it. It should also be described by the disposition taken toward it:

- valid
- invalid
- empty
- boundary

Once a posture contract is authored, negative scenarios become data transformations over approved behavior knowledge rather than bespoke handwritten scripts.

That is how Tesseract reduces the cost of the 50th test instead of increasing it.

## Bottleneck visibility is a feature

The system should reveal where it still needs help.

A useful Tesseract installation should make it obvious which work is currently blocked by:

- missing screen knowledge
- missing local hints
- missing promoted patterns
- missing snapshot templates
- unmodeled widget affordances
- review-required proposals waiting on a human decision

This is not failure reporting alone. It is product-level observability over the knowledge bottleneck.

## Why the CLI matters

QAs and agents should be able to navigate the repo through a stable command surface rather than institutional memory.

Core commands:

- `npm run refresh`
- `npm run paths`
- `npm run surface`
- `npm run trace`
- `npm run impact`
- `npm run graph`
- `npm run types`
- `npm run capture`

A good agent should be able to answer what changed, what is canonical, what was derived, and what must be reviewed by using those commands and the emitted artifacts.

## Agents are bounded optimization passes

Agents are not the compiler core.

They are useful when constrained to narrow, inspectable surfaces:

- propose a locator ladder repair from evidence
- propose a screen hint for a phrase that inference missed
- promote a repeated local supplement into a shared pattern
- classify failures and localize structural drift
- observe runs and zoom into error logs to figure out what went wrong
- inherit provenance from prior agents (snapshots, notes, evidence) to avoid re-spending tokens

Agents should be defensively strategic. The agent should submit the ideal selector or specification only after reviewing to confirm no other option seems better. When confidence is low, the agent scores that and persists the signal but trends toward making the test succeed.

The system should preserve those contributions as reviewable proposals, not absorb them as invisible runtime mutations.

Humans and agents should also be able to author compatible testable concerns against the same typed seams. A generated spec, a human-authored supplement, and an agent-authored proposal should all fit the same contract rather than living in separate hidden worlds.

That same rule should apply to generated tests: they should read like inspectable authored concerns, not opaque black-box emissions. If a human writes to the same interface, the system should accept it without forcing a second-class path.

## Development-time feedback as artifact

While the interaction model is still being shaped, it is reasonable to collect agent feedback after a task run, but only as a non-blocking derived artifact.

Useful questions are:

- was the context packet right-sized for the task
- should unresolved concerns be grouped by step or by scenario
- what did the agent have to rediscover that should live in repo instructions next time

That feedback should drive unit-sized recursive improvements to prompts, docs, or supplemental knowledge. It should never outrank the run receipt, and it should never become a shortcut around the last-resort escalation rule.

## The next optimization lane

There is a natural next step once trace and evidence corpora become rich enough: an offline evaluation and optimization lane.

Tools like DSPy or GEPA may help with:

- proposal ranking
- hint or pattern suggestion quality
- benchmark-driven prompt optimization
- discovering where the deterministic grammar still leaves too much on the table

But that lane must remain outside the deterministic compiler path.

The compiler should stay explainable, reproducible, and testable. Optimization systems should compete to improve proposals and workflows around it, not silently replace the core semantics.

## The six-month asset

If this system is built carefully, the repo stops being just a test suite.

It becomes a machine-readable model of the application's interactive surface, its behavior partitions, its structural assertions, its proposal history, and its repair bottlenecks.

That is the enduring asset:

- a QA-readable compiler
- an agent-operable knowledge base
- a reviewable path from human intent to executable verification
