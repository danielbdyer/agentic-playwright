# Agentic Scaffold Research Set

_As of March 10, 2026._

This research set is meant to make Backlog Item A1 implementable without overfitting Tesseract to any one agent runtime or VS Code integration feature. It treats the current repo as the source of truth for lifecycle and artifact seams, and treats the current VS Code and GitHub Copilot documentation as the source of truth for platform capabilities.

## Audience

- Mixed: implementation-minded engineers, design reviewers, and future agents that need one compact map of the current decision surface.
- Primary use: decide how to scaffold A1, the later VS Code integration surface, and dogfood-oriented orchestration without inventing new domain concepts.

## Source Policy

- Repo lifecycle claims are grounded in the current implementation and generated artifacts, not only in prose docs.
- Platform claims are grounded only in official documentation from [code.visualstudio.com](https://code.visualstudio.com/) and [docs.github.com](https://docs.github.com/).
- If a platform feature is documented but could not be exercised here, it is marked `unvalidated here`.
- If backlog intent and current code disagree, the docs call that out explicitly instead of smoothing it over.

## Confidence Labels

| Label | Meaning |
| --- | --- |
| `documented` | Directly supported by current official docs or current repo code/artifacts. |
| `inferred` | A reasoned conclusion drawn from multiple documented facts; not stated verbatim in one source. |
| `unvalidated here` | Documented externally, but not runnable or testable in this workspace during this research pass. |

## Reading Order

1. [A1 runtime lifecycle map](./a1-runtime-lifecycle-map.md)
2. [VS Code and Copilot ecosystem survey](./vscode-copilot-ecosystem-survey.md)
3. [Agentic scaffold decisions](./agentic-scaffold-decisions.md)
4. [Scenario kernel and interpreter family](./scenario-kernel-and-interpreters.md)

## Additional Notes

- The temporal-epistemic specification addendum was **promoted out
  of this archive on 2026-04-10** and now lives as active doctrine
  at [`docs/temporal-epistemic-kernel.md`](../../temporal-epistemic-kernel.md).
  It is load-bearing for the alignment-targets wall and the
  cold-start convergence plan.

## Glossary

| Term | Meaning in this research set |
| --- | --- |
| Artifact envelope | The durable Tesseract handoff shape across lanes: `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, and `payload`. |
| Runtime lifecycle event | A major transition in the Tesseract flow, such as parsing, binding, task-packet creation, runtime interpretation, evidence persistence, or approval. |
| Artifact reader | A future-facing, non-binding category for any surface that reads Tesseract artifacts without mutating canon. |
| Operator action | A future-facing, non-binding category for explicit user-approved actions such as run, rerun, approve, or inspect. |
| Capability profile | A future-facing, non-binding category for the role a platform surface plays: reader, action invoker, coordinator, or behavior shaper. |
| Interactive profile | The current operator-oriented execution profile in code and docs. |
| CI-batch profile | The current headless, non-interactive execution profile in code and docs. |
| Dogfood profile | A backlog-level execution profile that is planned to reuse the same artifacts, but is not yet a first-class runtime enum in the current code. |

## Table Ownership

| Owning table | Owning doc | Reason |
| --- | --- | --- |
| `Lifecycle events` | [a1-runtime-lifecycle-map.md](./a1-runtime-lifecycle-map.md) | Canonical map of current Tesseract execution stages and decisions. |
| `Artifact handoffs` | [a1-runtime-lifecycle-map.md](./a1-runtime-lifecycle-map.md) | Canonical map of file/envelope boundaries and degradation behavior. |
| `Platform surface inventory` | [vscode-copilot-ecosystem-survey.md](./vscode-copilot-ecosystem-survey.md) | Canonical map of current VS Code and Copilot ecosystem surfaces. |
| `Use-case matrix` | [agentic-scaffold-decisions.md](./agentic-scaffold-decisions.md) | Canonical mapping from Tesseract use cases to recommended primary and fallback surfaces. |

## Core Readout

- Tesseract already has the important A1 seam: parse preserves `intent-only` steps, compile emits a scenario task packet, and runtime execution emits typed interpretation, execution, evidence, proposal, inbox, and rerun artifacts.
- The safest scaffold path is still artifact-first and CLI-first.
- The first VS Code integration layer should be `tasks` and `problem matchers`, because they expose explicit operator actions and navigable diagnostics without creating a second hidden orchestration core.
- Instructions, prompt files, and Agent Skills should shape agent behavior and task framing, but should not become the system of record for workflow state.
- Custom agents and subagents are useful as coordinator veneers, not as the durable contract.
- Chat participants, LM tools, and MCP are viable later surfaces, but they should sit on top of the same artifact envelope and CLI actions rather than replacing them.
