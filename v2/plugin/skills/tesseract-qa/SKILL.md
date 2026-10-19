---
name: tesseract-qa
description: Author plain Playwright tests for OutSystems applications from Azure DevOps test cases with the tesseract-qa MCP tools (observe pages, act, assert, keep a facet memory, emit specs and page objects, run them, publish results to ADO test points). Use when asked to automate an ADO test case, write or repair a Playwright test for an OutSystems screen, record a login or precondition flow, check whether page objects still match the app, or publish results to a test plan.
---
<!-- Generated from PLAYBOOK.md by `tesseract-qa generate`; edit the playbook, not this file. -->

# Tesseract QA playbook

You author plain Playwright tests for an OutSystems application from Azure DevOps test cases. Tesseract gives you eyes (observe), hands (act, assert), memory (facets), a pen (emit), a harness (run), and a ledger (receipts, ADO results). It never calls a model. You decide; the tools verify and record.

## The loop, one test case

1. **Fetch.** `ado.fetch {ids:["10001"]}` (or by plan and suite). Read every step: action, expected result, parameters (`@policyNumber`), data rows. Shared steps arrive expanded inline.
2. **Open.** If memory knows the screens, `memory.preflight` first: it tells you whether yesterday's facets still resolve. Then `app.open {profile}`. If the profile has a recorded login flow, `auth:"flow"` runs it; never author a login by hand when a flow exists.
3. **Each step, in order:**
   1. `memory.query {screen, phrase: <step wording>}`. A trusted facet with healthy locators resolves the step without looking.
   2. On a miss, `app.observe {pageId, intent: <step wording>, scope}`. Scope to the landmark the step names ("search field" → `search`, "menu" → `navigation`); it shrinks the snapshot and the ambiguity. The hints are a cheap pre-filter; you choose.
   3. `app.act` on the chosen target (`{facetId}`, `{snapshotId, ref}`, or `{locator}`), so the next step sees the real state. Pass `decision` with what you chose, what you rejected, and why.
   4. Verify the expected result with `app.assert` on content: a row containing the value, a field's value, a heading's text, a count, the URL. Bare `visible` is the weakest assertion; reviewers reject tests that only check visibility.
   5. `memory.mint` the element you used, named with the test author's words (`displayName` plus `aliases` like "search field"), with the verified locator `app.act` returned and the snapshot candidate as evidence. Reuse beats re-minting: `memory.enrich` adds words to an existing facet.
4. **Emit.** `test.emit {testCase, steps}`. Steps reference facets; unresolved steps carry a `handoffId`. You get a spec under `tests/` and regenerated page objects under `pages/`, plus a diff. Nothing emitted imports Tesseract.
5. **Run.** `test.run {specPaths}`. Green means the spec runs with `npx playwright test` alone. Red on a locator means drift or a wrong choice: repair (below) and run again.
6. **Hand back.** Tell the human the spec path. A human reviews and records the verdict with `review.record`; you never call it on your own judgement. When asked, `ado.publish {planId, suiteId, runName, fromRunId}` turns test points green or red.

## When you cannot resolve a step

Try at most three times with different evidence (a different scope, a different candidate, a re-observe after waiting). Then `handoff.raise` with the blockage and everything a human needs:

- **ambiguous-target**: list the plausible candidates and why each fits.
- **text-mismatch**: the expected text paraphrases the page ("count decreases by one" against "0 items left"); propose the assertion you would write.
- **missing-data**, **auth**, **environment**, **not-found**, **unsupported**: say what is missing.

Carry the returned `handoffId` on that step to `test.emit`; the spec gets `test.fixme` with the reason inline and the ADO test case gets a comment. Never guess silently.

## Repair in place

When `test.run` fails on a locator in an interactive session, run it again with `pauseOnFailure:true`. It returns `paused.cdpEndpoint`. `app.open {attach:{cdpEndpoint}}`, `app.observe` the paused page, `app.act` to try the repair, `memory.enrich` the facet with the verified locator, then `test.run` again (this releases the paused browser). The repaired facet stays a candidate until a run confirms it.

## Recording instead of authoring

For logins and long preconditions, have a QA walk the path once: `app.open {headed:true}` then `flow.record {name, pageId, stopOn:"manual"}`; they press Stop in the page. Every control touched becomes a candidate facet with the recording as provenance, and `flows/<name>.ts` is emitted for tests to call in `beforeEach`. Secrets typed into password fields become parameters supplied at run time (`TESSERACT_PARAM_<NAME>`), never stored. `flow.run {name}` replays it with no model in the loop.

## Rules that keep the output trustworthy

- Verify before you write: only mint locators `app.act` or `app.assert` verified on the live page.
- Names come from the test author, locators from the page. A facet's aliases are the words people use in ADO; its locator is what the browser resolves.
- Prefer role and accessible name, scoped by landmark; then label, placeholder, text, test id; css last. Never mint an OutSystems structural id (`b3-…`) as the only locator.
- Values come from the test case: `@param` references bind to ADO parameters and data rows. Do not invent test data; a missing value is a handoff.
- Never pass a secret as a literal. Use `value:"@password"` with `params`, or a recorded flow whose secrets come from `TESSERACT_PARAM_<NAME>`; receipts record `<secret>` in their place.
- One `test.step` per ADO step, titled with the ADO wording verbatim. Do not merge or reorder steps.
- Candidate facets become trusted when a human accepts a test that uses them or after enough passing runs. Do not try to promote facets yourself.
- Budgets: three attempts per step; if a whole case stalls, hand off the current step and move to the next case.

## Tools

<!-- tesseract:generated:tools:start -->
Contract 2.0.0-alpha.1. Generated from `src/contract/tools.ts`; do not edit by hand.

| Tool | MCP name | Release | What it does | Error families | Nature |
|---|---|---|---|---|---|
| `app.open` | `app_open` | A | Open a page (or attach to a running browser over CDP) and wait for the app to hydrate. | invalid-input, not-configured, not-found, timeout, unavailable, unclassified | writes |
| `app.observe` | `app_observe` | A | Snapshot the page the way its accessibility tree sees it: candidates with role, computed name, naming source, affordance, landmark, data-block. | invalid-input, not-found, timeout, unclassified | read-only, idempotent |
| `app.act` | `app_act` | A | Perform one action (click, fill, select, check, press, hover, navigate) on a verified target so the next step sees real state. | invalid-input, not-found, ambiguous, not-visible, not-enabled, timeout, assertion-like, stale-snapshot, unavailable, unclassified | writes, acts on the app |
| `app.assert` | `app_assert` | A | Check a web-first assertion (visible, text, value, url, count, …) and report what was observed. | invalid-input, not-found, ambiguous, timeout, stale-snapshot, unavailable, unclassified | read-only, idempotent |
| `memory.query` | `memory_query` | A | Find facets on a screen by the words a test author would use. | invalid-input, malformed-response, unclassified | read-only, idempotent |
| `memory.mint` | `memory_mint` | A | Record a new facet (a named, role-bearing element of a screen) with provenance; it starts as a candidate. | invalid-input, conflict, stale-snapshot, unclassified | writes, idempotent |
| `test.emit` | `test_emit` | A | Write a plain Playwright spec for the test case and regenerate the page objects it uses. | invalid-input, not-found, conflict, malformed-response, unclassified | writes, idempotent |
| `test.run` | `test_run` | A | Run emitted specs with Playwright, classify failures against facets, and write run receipts. | invalid-input, not-configured, not-found, timeout, unavailable, malformed-response, unclassified | writes |
| `ado.fetch` | `ado_fetch` | B | Read Azure DevOps test cases with steps, parameters, data rows, and shared steps expanded inline. | invalid-input, not-configured, not-found, rate-limited, unavailable, malformed-response, unclassified | read-only, idempotent |
| `ado.publish` | `ado_publish` | B | Publish run results to Azure DevOps test points, with per-step outcomes, so the test plan shows green and red. | invalid-input, not-configured, not-found, rate-limited, unavailable, malformed-response, unclassified | writes, idempotent |
| `handoff.raise` | `handoff_raise` | B | Ask a human, with everything they need, instead of guessing: writes the handoff file and comments on the ADO test case. | invalid-input, not-found, unavailable, unclassified | writes |
| `review.record` | `review_record` | B | Record a human reviewer's accept / accept-with-edit / reject of an emitted test; acceptance promotes its facets to trusted. | invalid-input, not-found, malformed-response, unclassified | writes, human decision |
| `memory.enrich` | `memory_enrich` | B | Add aliases or a better locator to an existing facet, with the evidence that justifies the change. | invalid-input, not-found, conflict, stale-snapshot, unclassified | writes, idempotent |
| `memory.preflight` | `memory_preflight` | B | Check, on the live app, that a screen's facets and flows still resolve before trusting its page object. | invalid-input, not-found, not-configured, timeout, unavailable, unclassified | writes, idempotent |
| `flow.record` | `flow_record` | C | Record a path walked once (by a QA in a headed browser, or by your app.act calls) into facets and a deterministic flow. | invalid-input, not-configured, not-found, conflict, timeout, unavailable, malformed-response, unclassified | writes |
| `flow.run` | `flow_run` | C | Execute a recorded deterministic flow (log in, seed a record, reach a screen) with no model in the loop. | invalid-input, not-found, not-configured, not-visible, not-enabled, timeout, unavailable, unclassified | writes, acts on the app |
<!-- tesseract:generated:tools:end -->

Names are dotted here and on the CLI (`tesseract-qa app.open`); on the MCP wire the dot is an underscore (`app_open`), because several model APIs reject dots in tool names.
