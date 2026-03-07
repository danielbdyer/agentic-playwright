# Copilot Instructions

Start with `docs/agent-context.md` for a concise generated repo brief. For deeper modeling rules, follow `AGENTS.md` and `docs/authoring.md`.

Treat `.ado-sync/`, `scenarios/`, `knowledge/`, `.tesseract/evidence/`, and `.tesseract/policy/` as canonical inputs. Never hand-edit `generated/`, `lib/generated/`, `.tesseract/bound/`, or `.tesseract/graph/`.

Prefer the command surface before wide file searches: `npm run context`, `npm run paths`, `npm run surface`, `npm run trace`, `npm run impact`, `npm run refresh`, and `npm run check`.

Use Node `>=20.9.0` and treat `npm run check` as the required local/CI gate. Its success path is intentionally terse, while failures should surface the first broken phase with full diagnostics.

Lint/typecheck contract:

- `npm run lint` covers hand-authored code only and ignores derived outputs such as `.ado-sync/`, `.tesseract/`, `generated/`, `lib/generated/`, `dist/`, and `test-results/`
- `npm run typecheck` includes `tests/` so branded fixtures and helper drift fail at compile time

Respect the enforced layer rules: `lib/domain` stays pure, `lib/application` depends on domain and application-local modules only, and `lib/runtime` stays isolated from application and infrastructure orchestration.

Scoped instructions in `.github/instructions/` still apply automatically by path. Keep changes deterministic, provenance-friendly, and aligned with the knowledge-first model.
