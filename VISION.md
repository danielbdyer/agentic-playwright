# Tesseract Vision

Tesseract is not a compiler-only test generator.

It is an interface intelligence and agent workbench system that happens to emit Playwright.

The authoritative architecture doctrine is now `docs/master-architecture.md`. This document stays intentionally shorter: it captures the product bet, the durable asset, and the operator-visible promise.

## The product bet

If a manual test is written clearly enough for a QA to infer behavior from it, then Tesseract should be able to:

- harvest the relevant application reality
- preserve selectors and state knowledge once
- lower the case into a grounded task packet
- emit a normal-looking test
- execute it with provenance-rich receipts
- learn from the run without silently mutating canon

The source program is still the Azure DevOps manual test case. The emitted object code is still Playwright. The durable value sits between them: interface intelligence, session receipts, and learning surfaces grounded in shared truth.

## What remains stable

The six concern lanes remain the public operating vocabulary:

- `intent`
- `knowledge`
- `control`
- `resolution`
- `execution`
- `governance/projection`

The task packet remains the machine handshake for one scenario. The emitted spec remains the readable facade. `.tesseract/runs/{ado_id}/{run_id}/run.json` remains the durable explanation of what the runtime actually did.

## What changed

The old compiler-centered framing was incomplete.

The durable semantic spine is now `Interface Intelligence`:

- interface graph
- canonical targets
- selector canon
- state and event topology
- discovery and provenance

The durable operational spine is now `Agent Workbench`:

- session ledgers
- provider-agnostic agent host adapters
- replay and review surfaces
- intervention and rerun workflows

Both share one interpretation surface. That is how a generated spec, a runtime receipt, a workbench session, and a learning corpus can all agree on what the application meant.

## The operator promise

At scale, the system should feel like a machine that:

- understands the DOM instead of repeatedly poking at it
- remembers selector and state knowledge once
- exposes the bottleneck instead of hiding it
- makes review a governance boundary, not a routine tax
- stays readable enough that a QA can trust what was emitted

That is how Tesseract can realistically grow toward thousands of scenarios without multiplying brittle test logic.

## Readable emission still matters

The emitted surface is standard Playwright with QA-grade narrative. It is not Gherkin and not a custom user-facing DSL.

Readable tests matter because they are the human inspection layer over the same shared interpretation surface used by runtime and learning. The spec should read like a strong authored test even when every helper ultimately resolves through one canonical event-driven implementation.

## Learning stays bounded

Derived layers may ratchet automatically:

- selector health
- observed transitions
- session artifacts
- replay and training corpora

Canonical truth still requires proposals and trust-policy review.

That boundary is what lets the system learn aggressively without becoming opaque.

## Optimization lane

The offline optimization and evaluation lane still matters.

DSPy, GEPA, and similar tooling belong there for:

- proposal ranking
- prompt and workflow tuning
- replay and benchmark analysis
- finding where the bottleneck still lives

They do not replace the deterministic compiler core or the shared interpretation surface.
