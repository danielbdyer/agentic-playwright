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

`init` creates `.tesseract/config.json`, a profile, `.gitignore` entries (snapshots, scratch, repair shadows, Playwright output, and `.tesseract/auth/`, where saved sessions live, so storage-state cookies are never committed) and `.gitattributes` entries, and prints the two lines to add to `playwright.config.ts` so emitted page objects get their base URL from the profile.

### As an MCP server

```json
{ "mcpServers": { "tesseract-qa": { "command": "npx", "args": ["tesseract-qa", "serve"] } } }
```

`serve` speaks MCP over stdio. `serve --http 7341` serves Streamable HTTP for a shared instance behind a gateway: localhost by default (with a Host-header check against DNS rebinding); `--host` binds elsewhere and then requires `--token-env NAME`, naming a variable that holds a bearer token of at least 16 characters (the server refuses to start without one). Each MCP session gets its own runtime and browser pool. A session ends on DELETE, after `--idle-timeout` with no request in flight (default `30m`; `0` never), or at shutdown, and its browsers and paused runs go with it; a request for an unknown or expired session gets 404, which tells the client to initialize again. SIGINT, SIGTERM, and SIGHUP close every session and exit.

### As a Claude Code plugin

`plugin/` is a Claude Code plugin: the playbook as a skill, the MCP server configuration, a session-start hook that runs a cached preflight, and `/author`, `/repair`, `/record`, `/preflight` commands. Install it from the team's marketplace; nobody copies the skill into another repository.

## Tools

<!-- tesseract:generated:tools:start -->
Contract 2.0.0-alpha.1. Generated from `src/contract/tools.ts`; do not edit by hand.

| Tool | MCP name | Release | What it does | Error families | Nature |
|---|---|---|---|---|---|
| `app.open` | `app_open` | A | Open a page (or attach to a running browser over CDP) and wait for the app to hydrate. | invalid-input, not-configured, not-found, timeout, unavailable, unclassified | writes |
| `app.observe` | `app_observe` | A | Snapshot the page the way its accessibility tree sees it: candidates with role, computed name, naming source, affordance, landmark, data-block. | invalid-input, not-found, timeout, malformed-response, unclassified | read-only, idempotent |
| `app.act` | `app_act` | A | Perform one action (click, fill, select, check, press, hover, navigate) on a verified target so the next step sees real state. | invalid-input, not-found, ambiguous, not-visible, not-enabled, timeout, assertion-like, stale-snapshot, unavailable, malformed-response, unclassified | writes, acts on the app |
| `app.assert` | `app_assert` | A | Check a web-first assertion (visible, text, value, url, count, …) and report what was observed. | invalid-input, not-found, ambiguous, timeout, stale-snapshot, unavailable, malformed-response, unclassified | writes |
| `memory.query` | `memory_query` | A | Find facets on a screen by the words a test author would use. | invalid-input, malformed-response, unclassified | read-only, idempotent |
| `memory.mint` | `memory_mint` | A | Record a new facet (a named, role-bearing element of a screen) with provenance; it starts as a candidate. | invalid-input, conflict, stale-snapshot, malformed-response, unclassified | writes, idempotent |
| `test.emit` | `test_emit` | A | Write a plain Playwright spec for the test case and regenerate the page objects it uses. | invalid-input, not-found, conflict, malformed-response, unclassified | writes, idempotent |
| `test.run` | `test_run` | A | Run emitted specs with Playwright, classify failures against facets, and write run receipts. | invalid-input, not-configured, not-found, timeout, unavailable, malformed-response, unclassified | writes |
| `ado.fetch` | `ado_fetch` | B | Read Azure DevOps test cases with steps, parameters, data rows, and shared steps expanded inline. | invalid-input, not-configured, not-found, rate-limited, unavailable, malformed-response, unclassified | read-only, idempotent |
| `ado.publish` | `ado_publish` | B | Publish run results to Azure DevOps test points, with per-step outcomes, so the test plan shows green and red. | invalid-input, not-configured, not-found, rate-limited, unavailable, malformed-response, unclassified | writes, idempotent |
| `handoff.raise` | `handoff_raise` | B | Ask a human, with everything they need, instead of guessing: writes the handoff file and comments on the ADO test case. | invalid-input, not-found, unavailable, unclassified | writes |
| `review.record` | `review_record` | B | Record a human reviewer's accept / accept-with-edit / reject of an emitted test; acceptance promotes its facets to trusted. | invalid-input, not-found, malformed-response, unclassified | writes, human decision |
| `memory.enrich` | `memory_enrich` | B | Add aliases or a better locator to an existing facet, with the evidence that justifies the change. | invalid-input, not-found, conflict, stale-snapshot, malformed-response, unclassified | writes, idempotent |
| `memory.preflight` | `memory_preflight` | B | Check, on the live app, that a screen's facets and flows still resolve before trusting its page object. | invalid-input, not-found, not-configured, timeout, unavailable, malformed-response, unclassified | writes, idempotent |
| `flow.record` | `flow_record` | C | Record a path walked once (by a QA in a headed browser, or by your app.act calls) into facets and a deterministic flow. | invalid-input, not-configured, not-found, conflict, timeout, unavailable, malformed-response, unclassified | writes |
| `flow.run` | `flow_run` | C | Execute a recorded deterministic flow (log in, seed a record, reach a screen) with no model in the loop. | invalid-input, not-found, not-configured, not-visible, not-enabled, timeout, unavailable, malformed-response, unclassified | writes, acts on the app |
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
| `.tesseract/snapshots/` | PII-gated observations receipts cite (gitignored; files older than `snapshotRetentionDays` are pruned when a server or CLI runtime starts) | `app.observe` |

Generated files carry a header. Regions between `// tesseract:keep-start <id>` and `// tesseract:keep-end <id>` survive regeneration, and `pages/<screen>.page.overrides.ts` overrides any page-object member. A QA-authored change is never discarded.

## CLI

```text
tesseract-qa serve [--http <port>] [--host <host>] [--token-env <NAME>] [--idle-timeout 30m] [--root <dir>] [--headed]
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
- Batch decider (`author --decider anthropic`): `ANTHROPIC_API_KEY`; `TESSERACT_MODEL` picks the model; `TESSERACT_EFFORT` sets effort (`low` to `max`, default `medium`); `TESSERACT_ANTHROPIC_FALLBACKS=0` turns off server-side refusal fallbacks. The default heuristic decider needs none of these.
- Other switches: `TESSERACT_ROOT` (workspace root for `serve`), `TESSERACT_HEADED=1` (show browsers), `TESSERACT_PII` (`standard` | `strict` | `off`).

## Security and data

- Credentials come from the environment or the host's secret store and never enter receipts; fields named like secrets are scrubbed from every receipt.
- Page text is PII-gated before it leaves the browser: emails, SSNs, card numbers, phone numbers, and long digit runs are replaced with typed placeholders in snapshots, ARIA text, titles, URLs, and receipts. In receipts every string, error messages included, is redacted before it is truncated, and URL query and fragment values (session tokens) are dropped, keys kept, wherever a URL appears.
- Tool results inline only `app.observe`'s viewport screenshot as an image, and only when it is under 1 MB and 8000 px a side; other screenshots (such as `handoff.raise`'s full page) are returned as a path.
- The server keeps no state between calls beyond the browser pool. Attached browsers are never closed, only disconnected; attachment is for interactive repair and never runs in CI.
- Over HTTP the server binds to localhost with DNS-rebinding protection unless told otherwise, and refuses a non-loopback bind without a bearer token.

## Development

```bash
npm run build          # bundle the in-page walker, then tsc
npm test               # unit tests (real Chromium for page-facing code)
npm run test:e2e       # MCP client over stdio against a fixture OutSystems-shaped app
npm run drift          # fail if PLAYBOOK.md, README.md, the skill, or the in-page bundle drifted from their sources
```
