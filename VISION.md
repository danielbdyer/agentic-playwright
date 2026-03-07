# Tesseract Product Vision

Tesseract is a deterministic compiler that transforms Azure DevOps manual test cases into executable Playwright specs for OutSystems projects. This document describes the product-level design intent — the *why* and *how* from the perspective of QA teams and the agents that assist them.

For authorship guidance (how to write code in this repo), see `AGENTS.md`.

## The bet

If a manual test case is well-written enough for a human QA to follow step by step, it is well-written enough for an agent to infer executable intent against. The ADO test case is not a loose suggestion; it is a structured document with steps, expected results, and implicit data requirements. Tesseract treats it as a source program.

## How QAs work with this system

QAs write manual test cases in Azure DevOps. They do not write Playwright code. The system flow is:

1. ADO test cases are synced into `.ado-sync/` as snapshots.
2. The compiler parses each snapshot into a scenario (structured YAML with intent, actions, elements, data references).
3. The compiler binds each scenario step to the knowledge layer (screens, elements, postures, surfaces).
4. The compiler emits a Playwright spec where each `test.step()` carries the ADO step's semantic intent string.
5. QAs review the generated spec and confirm: does each step do what the ADO case says it should?

The QA's review target is **mapping fidelity** — not Playwright APIs, not DOM selectors, not runtime internals. The generated spec is disposable object code.

## Single source of truth

Every selector, element identity, posture, fixture reference, and snapshot template lives in one canonical place under `knowledge/`. When a selector breaks in one test out of thirty, the fix happens in one element definition, the compiler regenerates all affected specs, and the regression is resolved everywhere at once.

This is the central scalability property. Without it, selector drift silently poisons test suites.

### The self-healing cycle

With single-source knowledge, a single agent-driven repair cycle can:

1. Detect the selector failure in a test run.
2. Re-snapshot the affected screen section to capture the current DOM/ARIA state.
3. Propose a hardened selector in the element definition, optionally keeping the old selector as a fallback in a ladder strategy.
4. Regenerate all affected specs.
5. Rerun the impacted tests to confirm the regression is fixed.
6. Submit the knowledge update with evidence for trust policy review.

## Agent interaction model

QAs interact with agents (GitHub Copilot, Claude, or similar) through the Tesseract CLI. The agent's operating surface is:

| Command | Purpose |
|---------|---------|
| `npm run refresh` | Recompile everything from canonical inputs |
| `npm run surface` | Inspect what the system knows about a screen |
| `npm run trace` | See what a scenario touches without executing it |
| `npm run impact` | Understand what a knowledge change affects |
| `npm run capture` | Re-snapshot a screen section from a live page |
| `npm run paths` | Show canonical artifact paths for a scenario |
| `npm run graph` | Build and inspect the dependency graph |

The agent does not need to understand Playwright APIs, DOM structure, or test framework internals. It works at the level of screens, elements, postures, scenarios, and evidence. The compiler handles the translation to executable code.

## QA readability contract

Generated specs must be transparent projections of the ADO test case. A QA reviewing a generated spec should be able to confirm:

- The ADO test case ID and revision are visible as test annotations.
- Each step in the spec maps 1:1 to a step in the ADO case.
- Each step carries the semantic intent string from the ADO case (e.g., "Enter policy number in search field") as the `test.step()` label.
- The function calls within each step correspond to what the step semantically describes — navigating, entering data, clicking, asserting.

## Escape hatches and the knowledge ratchet

Not every ADO step maps cleanly to the deterministic grammar. An agent may encounter:

- An interaction pattern the knowledge layer has never seen (a combobox, date picker, multi-step modal).
- A DOM structure that does not fit the current surface decomposition.
- A step whose intent is clear but whose mechanical execution requires domain-specific logic.

The current `custom-escape-hatch` instruction kind marks these gaps. The interpreter classifies them as `semantic-gap`. The design intent is that escape hatches feed back into the knowledge layer rather than remaining as dead code:

- The agent encodes the discovered pattern as a **persistent override** — a reusable pattern contract in the knowledge layer, not a hardcoded function.
- Pattern contracts describe the interaction mechanics of a widget type (how to select from a combobox, how to navigate a date picker) in a way the compiler can bind against in future scenarios.
- When the same pattern appears in a different scenario, it resolves deterministically rather than requiring another escape hatch.
- The trust policy governs promotion of agent-proposed patterns, requiring evidence and review.

This creates a ratchet: every escape hatch is an opportunity to extend the knowledge layer. The system gets more deterministic over time as pattern coverage grows.

## Locator strategy and fallback ladders

Element definitions should support an ordered locator strategy rather than a single flat selector:

1. **Primary**: `data-testid` — most stable in OutSystems apps where test IDs are explicitly added.
2. **Fallback**: ARIA role + accessible name — semantic, survives cosmetic refactors.
3. **Last resort**: CSS selector — fragile, but sometimes necessary for OutSystems-generated DOM.

When an agent hardens a selector, it proposes an updated strategy with the new primary and optionally retains the previous selector as a fallback rung. The runtime tries the ladder in order. The evidence record captures which rung succeeded, feeding back into confidence scoring.

## Trust policy and governance

Agents can propose freely. Promotion to approved knowledge requires evidence.

The trust policy (`.tesseract/policy/trust-policy.yaml`) enforces:

- Minimum confidence thresholds per artifact type.
- Required evidence kinds and counts (DOM snapshots, ARIA snapshots, runtime observations, assertion runs).
- Forbidden auto-heal classes (assertion mismatches, structural mismatches) that must always go through human review.

Policy decisions are graph nodes with full provenance. The system can always answer: "Why was this element definition approved? What evidence supported it? What policy version governed the decision?"

The agent is a proposal engine. The trust policy is the review gate. The QA remains the approver for semantic changes.

## Why OutSystems specifically

OutSystems generates volatile DOM that is hostile to brittle automation:

- Element IDs and class names change across deployments.
- ARIA semantics are inconsistent across platform versions.
- Layout structure shifts without functional changes.

This makes the knowledge layer essential — not optional. Hard-coded selectors in test files break constantly. A centralized, evidence-governed knowledge layer is the only way to maintain a large test suite against an OutSystems application without constant manual repair.
