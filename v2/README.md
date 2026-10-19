# tesseract-qa

> Status: v2 implementation (2026-10-19). The design is [`docs/app-v2-vision.md`](../docs/app-v2-vision.md) §§4–5; this package is the MCP server, CLI, and plugin it describes. It is self-contained: nothing here imports `product/`, `workshop/`, or `dashboard/`.

An MCP server that lets an agent author **plain Playwright tests** for **OutSystems** applications from **Azure DevOps** test cases, and keeps a provenance-threaded memory of the application in the team's own repository.

The agent is the compiler; Tesseract is its toolbox. Sixteen tools give the agent eyes that understand OutSystems pages, hands that verify before they act, a memory of facets with locator health, a pen that writes specs and page objects, a harness that runs them, and a ledger that publishes results to Azure DevOps test points. The tools never call a model. The emitted tests never import Tesseract.

## Who it serves

- **QAs** author an ADO case end to end, record a path once so the next case on that screen starts warm, get a readable spec they can edit, and see results on the test plan they already own. Handoffs arrive as ADO comments with the reason inline.
- **Developers** get `tesseract-qa preflight` as a pull-request check against a preview environment: before the suite runs, it reports which controls a change broke and how the page fingerprint moved. `tesseract-qa audit <url>` reports unnamed controls, duplicate names, structural-id-only widgets, and roleless clickables, the same things OutSystems' own testability guidance asks teams to fix. Repair in place works on their branch.
- **Both** share one vocabulary: the facet catalog is YAML under `.tesseract/catalog/`, reviewed in the same pull requests as the code.

## Install

```bash
npm install --save-dev tesseract-qa @playwright/test
npx tesseract-qa init --profile qa --base-url https://qa.example.com/MyApp/
```

`init` creates `.tesseract/config.json`, a profile, `.gitignore` and `.gitattributes` entries, and prints the two lines to add to `playwright.config.ts` so emitted page objects get their base URL from the profile.

### As an MCP server

```json
{ "mcpServers": { "tesseract-qa": { "command": "npx", "args": ["tesseract-qa", "serve"] } } }
```

`serve` speaks MCP over stdio. `serve --http 7341` serves Streamable HTTP for a shared instance behind a gateway (localhost by default, `--host` to bind elsewhere, `--token-env NAME` to require a bearer token); each MCP session gets its own browser pool.

### As a Claude Code plugin

`plugin/` is a Claude Code plugin: the playbook as a skill, the MCP server configuration, a session-start hook that runs a cached preflight, and `/author`, `/repair`, `/record`, `/preflight` commands. Install it from the team's marketplace; nobody copies the skill into another repository.

## Tools

<!-- tesseract:generated:tools:start -->
<!-- tesseract:generated:tools:end -->

Every call appends one line to `.tesseract/receipts/authoring.jsonl`: the tool, redacted input, summarized output, duration, outcome, error family, and the agent's stated decision with the host's model id and token counts when the host reports them.

## What lands in the repository

| Path | What | Written by |
|---|---|---|
| `tests/<area>/<adoId>-<slug>.spec.ts` | the emitted Playwright test | `test.emit` |
| `pages/<screen>.page.ts` (+ `.overrides.ts`) | page objects, one per screen | `test.emit`, `flow.record` |
| `flows/<name>.ts` | recorded deterministic flows | `flow.record` |
| `.tesseract/catalog/<screen>.yaml` | facets: names, aliases, locators with health, status, provenance | `memory.*` |
| `.tesseract/evidence/<screen>.jsonl` | append-only evidence per facet | tools |
| `.tesseract/receipts/*.jsonl` | authoring, run, review, publish, emit receipts | tools |
| `.tesseract/handoffs/<adoId>-<step>.json` | open questions for a human | `handoff.raise` |
| `.tesseract/snapshots/` | PII-gated observations receipts cite (gitignored, pruned) | `app.observe` |

Generated files carry a header. Regions between `// tesseract:keep-start <id>` and `// tesseract:keep-end <id>` survive regeneration, and `pages/<screen>.page.overrides.ts` overrides any page-object member. A QA-authored change is never discarded.

## CLI

```text
tesseract-qa serve [--http <port>] [--host <host>] [--token-env <NAME>] [--root <dir>] [--headed]
tesseract-qa <tool> [--<field> <value> ...] [--json '<input json>']   e.g. tesseract-qa ado.fetch --ids 10001
tesseract-qa call <tool> '<input json>' | @input.json
tesseract-qa init [--profile <name>] [--base-url <url>]
tesseract-qa record <flow-name> --url <url> [--profile <name>]
tesseract-qa preflight [--screen <s>] [--profile <p>] [--format text|md|json|hook] [--fail-on stale|missing|none]
tesseract-qa audit <url> [--profile <p>] [--format md|json]
tesseract-qa author --ids <id,...> | --plan <p> --suite <s> [--profile <p>] [--run] [--publish --run-name <n>]
tesseract-qa report [--case <id>] [--format md|json]
tesseract-qa tools | generate | drift-check | version
```

`author` is the batch mode: it loops over a suite with the same tools and a decider. The default decider is the deterministic heuristic pre-filter (no model); `--decider anthropic` uses the Messages API when `ANTHROPIC_API_KEY` is set. Anything it cannot resolve becomes a handoff, never a guess.

## Configuration

- `.tesseract/config.json`: `testsDir`, `pagesDir`, `flowsDir`, `playwrightConfig`, `pii` (`standard` | `strict` | `off`), `promoteAfterPasses`, `staleHealthFloor`, `staleMinAttempts`, `snapshotRetentionDays`, `observe` caps, `ado` (`orgUrl`, `project`, `patEnv`).
- `.tesseract/profiles/<name>.json`: `{ name, baseURL, storageStatePath?, loginFlow?, tenant?, dataSet?, headed?, viewport? }`. Select with `--profile` or `TESSERACT_PROFILE`; `TESSERACT_BASE_URL` overrides the base URL (how CI points a profile at a preview environment).
- Azure DevOps: `AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PROJECT`, and a personal access token in `AZURE_DEVOPS_PAT` (or the variable `ado.patEnv` names) with Work Items (read, and write for comments and automation association) and Test Management (read and write).
- Flow parameters: `TESSERACT_PARAM_<NAME>` supplies secrets recorded flows need (passwords are never stored).

## Security and data

- Credentials come from the environment or the host's secret store and never enter receipts; fields named like secrets are scrubbed from every receipt.
- Page text is PII-gated before it leaves the browser: emails, SSNs, card numbers, phone numbers, and long digit runs are replaced with typed placeholders in snapshots, ARIA text, titles, URLs, and receipts.
- The server keeps no state between calls beyond the browser pool. Attached browsers are never closed, only disconnected; attachment is for interactive repair and never runs in CI.
- Over HTTP the server binds to localhost with DNS-rebinding protection unless told otherwise.

## Development

```bash
npm run build          # bundle the in-page walker, then tsc
npm test               # unit tests (real Chromium for page-facing code)
npm run test:e2e       # MCP client over stdio against a fixture OutSystems-shaped app
npm run drift          # fail if PLAYBOOK.md, README.md, the skill, or the in-page bundle drifted from their sources
```
