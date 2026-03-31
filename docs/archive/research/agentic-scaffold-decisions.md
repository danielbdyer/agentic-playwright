# Agentic Scaffold Decisions

_As of March 10, 2026._

## Summary

- The first scaffold should remain artifact-first, CLI-first, and host-agnostic.
- The recommended order is:
  1. behavior shaping with repo instructions
  2. repeatable inspection flows with prompt files and, later, Agent Skills
  3. explicit actions via VS Code tasks and problem matchers
  4. optional coordinator veneers with custom agents and subagents
  5. optional extension code with LM tools or a chat participant only if repo-local customization is no longer enough

## Locked Defaults

- The artifact envelope is the only durable contract.
- Playwright runtime stays outside MCP.
- Tasks and problem matchers are the first VS Code integration layer.
- Instructions, prompt files, and Agent Skills shape behavior but do not hold workflow state.
- Custom agents and chat participants are optional veneers over CLI and artifact seams.
- Dogfood orchestration remains CLI-led even when launched from agent-facing surfaces.

## Non-Binding Capability Profiles

| Capability profile | Responsibility | Good candidate surfaces |
| --- | --- | --- |
| Artifact reader | Read task packets, reviews, traces, inbox items, proposals, rerun plans, and scorecards without mutating canon | Prompt files, Agent Skills, LM tools, MCP resources |
| Operator action | Execute explicit commands such as run, rerun, approve, inbox, or workflow | VS Code tasks, LM tools, MCP tools |
| Coordinator | Sequence multiple reads and actions, possibly with review checkpoints | Custom agents, prompt files, subagents |
| Behavior shaper | Keep all agent hosts aligned to repo vocabulary, governance, and review expectations | `AGENTS.md`, `.github/copilot-instructions.md`, `*.instructions.md`, Agent Skills |

## Use-Case Matrix

| Use case | Recommended primary surface | Fallback surface | Why this is the default | Profiles | Decision quality | Unknowns | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Workspace orientation | Repository instructions (`AGENTS.md` plus repo/path instructions) | Prompt file such as `/tesseract-orient` | Orientation should be always-on, lightweight, and shared across agents. The repo already uses this pattern. | `interactive`, `dogfood` | `high` | Nested `AGENTS.md` behavior is still setting-gated; some orgs may rely more on `.instructions.md` than nested agent files | [VS Code custom instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions), [GitHub repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions) |
| Inbox and hotspot discovery | VS Code tasks plus problem matchers | Prompt file or custom agent that reads `.tesseract/inbox/*` | This keeps discovery explicit and operator-visible while reusing existing `tesseract inbox` and hotspot outputs. | `interactive`, `dogfood` | `high` | Current hotspot JSON may need matcher-friendly textual projection for the cleanest Problems integration | [VS Code tasks](https://code.visualstudio.com/docs/debugtest/tasks), [Task Provider API](https://code.visualstudio.com/api/extension-guides/task-provider) |
| Task and review inspection | Prompt files | Agent Skill | Inspection is a mostly read-only workflow that benefits from manual slash invocation, file references, and explicit output instructions. | `interactive`, `dogfood` | `medium-high` | Agent Skill rollout in stable VS Code remains uncertain; prompt-file ergonomics may be enough for v1 | [VS Code prompt files](https://code.visualstudio.com/docs/copilot/customization/prompt-files), [VS Code Agent Skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills) |
| Run and rerun invocation | VS Code tasks | Custom agent or prompt file that delegates to the task/terminal | Runtime execution is an explicit operator action with existing CLI verbs, so a task is the thinnest safe wrapper. | `interactive`, `dogfood` | `high` | Terminal auto-approval and org policy may affect how smooth task invocation feels in practice | [VS Code tasks](https://code.visualstudio.com/docs/debugtest/tasks), [VS Code agents overview](https://code.visualstudio.com/docs/copilot/agents/overview) |
| Proposal inspection | Prompt files | Problem matchers linked from proposal-oriented tasks | Proposal bundles are JSON artifacts that often need summarization and contextual explanation before approval, which prompt files handle well. | `interactive`, `dogfood` | `medium` | If proposal inspection must feel more IDE-native, a later extension tree view or LM tool may be warranted | [VS Code prompt files](https://code.visualstudio.com/docs/copilot/customization/prompt-files), [Language Model Tool API](https://code.visualstudio.com/api/extension-guides/ai/tools) |
| Approval flow | VS Code tasks | Custom agent handoff that prepares but does not hide the approval command | Approval mutates canon. The default should preserve explicit human intent and make `ci-batch` blocking behavior obvious. | `interactive`, `dogfood` | `high` | A friendlier proposal picker may eventually need extension code, but the underlying action should still be the same approval seam | [VS Code tasks](https://code.visualstudio.com/docs/debugtest/tasks), [VS Code custom agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents) |
| Degraded-locator and `needs-human` handling | Problem matchers | Prompt file or Agent Skill for triage | Detection should surface as navigable problems first; richer agent help should be layered on after the operator can see the issue. | `interactive`, `dogfood` | `medium` | Current artifact locations may not yet be rich enough for line-precise matchers in every case | [VS Code tasks](https://code.visualstudio.com/docs/debugtest/tasks), [VS Code prompt files](https://code.visualstudio.com/docs/copilot/customization/prompt-files), [VS Code Agent Skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills) |
| Dogfood-loop orchestration | CLI-led task entrypoint | Custom agent with handoffs and selective subagent use | The dogfood loop should remain a thin wrapper over existing CLI/artifact seams. A custom agent can coordinate, but should not own the only working implementation. | `dogfood` | `high` for CLI-led default, `medium` for the fallback | `dogfood` is not a first-class runtime enum yet, and a single `npm run dogfood` command is still backlog work rather than present code | [VS Code tasks](https://code.visualstudio.com/docs/debugtest/tasks), [VS Code custom agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents), [VS Code subagents](https://code.visualstudio.com/docs/copilot/agents/subagents), [VS Code agents overview](https://code.visualstudio.com/docs/copilot/agents/overview) |
| Behavior shaping via instructions, prompts, and skills | Repository instructions first, Agent Skills second | Prompt files | Always-on norms belong in instruction files. Rich reusable workflows belong in skills. Prompt files remain the manual, task-local escape hatch. | `interactive`, `dogfood` | `high` for instructions, `medium` for skills | Stable VS Code rollout for skills remains the main uncertainty; prompt files may need to carry more weight until that settles | [VS Code custom instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions), [VS Code Agent Skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills), [VS Code prompt files](https://code.visualstudio.com/docs/copilot/customization/prompt-files), [GitHub about agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) |

## What Not to Build First

- Do not start with a Chat Participant API implementation.
  - It would create a bespoke conversational control plane before the artifact and task surfaces are fully stabilized.
- Do not route Playwright execution through MCP.
  - MCP is useful for tools, resources, and prompts. Tesseract's runtime value comes from keeping Playwright observable and local to the runtime seam.
- Do not make custom agents the only way to use Tesseract.
  - They are useful orchestration veneers, but they should sit above the same `tesseract` commands and artifact files that the CLI and humans already use.

## Suggested Scaffold Order

### Phase 1: Repo-first, no extension code required

- Keep [AGENTS.md](../../AGENTS.md) and `.github/instructions/*.instructions.md` as the durable behavior layer.
- Add a small set of prompt files for:
  - artifact orientation
  - inbox triage
  - proposal review
  - rerun planning
- Optionally add one or two Agent Skills only if the same flow needs to work in Copilot CLI or coding-agent contexts.

### Phase 2: Thin VS Code integration

- Add tasks for `workflow`, `inbox`, `run`, `approve`, and `rerun-plan`.
- Add problem matchers for actionable proposals, hotspots, degraded locators, and `needs-human` cases.
- Keep the extension thin: it should expose the same commands and artifacts, not invent a parallel state model.

### Phase 3: Optional coordinator surfaces

- Add custom agents for planner, reviewer, and dogfood coordinator roles if the Phase 1 and 2 surfaces prove insufficient.
- Use handoffs for explicit stage transitions.
- Use subagents only for isolated research or parallel analysis, not for core mutation flows.

### Phase 4: Optional extension-author APIs

- Consider LM tools for artifact-reader tools or carefully bounded action wrappers.
- Consider a Chat Participant API surface only if Tesseract needs a packaged `@tesseract` conversational assistant that materially improves on tasks, prompt files, and custom agents.
- Consider MCP only for portable artifact readers, resources, or prompt/tool bundles that need to work outside VS Code as well.

## Open Questions to Carry into Implementation

- Which Tesseract outputs should gain matcher-friendly textual projections so that proposal and hotspot navigation is crisp in the Problems view?
- Should a future extension shell out to the CLI, link directly to application-layer code, or wrap a smaller stable action boundary?
- How much of the eventual dogfood loop should target local agent sessions versus Copilot CLI or cloud/background agents?
- Is Agent Skills support stable enough in the target team environment to make skills part of the first scaffold, or should prompt files carry the initial load?
