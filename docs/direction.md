# Tesseract Direction

`docs/master-architecture.md` is now the authoritative architecture specification.

This document remains as a shorter owner-direction note: it captures transition decisions, sequencing, and non-negotiable implementation bias while the repo moves toward the master architecture.

## Directional shift

The most important change is conceptual:

- compiler-only framing is no longer sufficient
- `Interface Intelligence` is the durable semantic spine
- `Agent Workbench` is the durable operational spine
- both must share one interpretation surface

That shift should drive future design decisions even when older implementation names still exist in code.

## Transition guardrails

As the repo moves toward the master doctrine, preserve these rules:

- deterministic first, structured translation second, agentic last
- observable Playwright runtime, never MCP-driven execution
- approved artifacts remain canonical truth
- derived learning layers may ratchet without mutating canon
- selectors and dynamic state knowledge must converge toward single-source representations

## Near-term owner priorities

The current implementation program is:

1. make the interface graph and selector canon deterministic and reviewable
2. model dynamic state and event topology explicitly instead of rediscovering it ad hoc
3. lower ADO scenarios into grounded decomposition before emission
4. keep emitted tests readable while routing behavior through one canonical runtime interface
5. standardize provider-agnostic session ledgers and workbench event vocabularies
6. use replay and evaluation corpora to improve the system without weakening governance

## Scale posture

The immediate system target is thousands of scenarios against a shared application model.

That means the architecture must bias toward:

- bounded incremental recomputation
- reuse of target, selector, and state knowledge
- explicit change detection and bottleneck visibility
- clear promotion boundaries between derived knowledge and approved canon

If a design increases scenario count by duplicating selectors, rediscovering DOM structure, or smuggling dynamic behavior into emitted code, it is moving in the wrong direction.
