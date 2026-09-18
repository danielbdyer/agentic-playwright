# Tesseract v2 — what the next application looks like

> Status: vision (2026-09-18). Written from a full read of the repository at commit `9714891` — every active document, every folder, the git history, the emitted artifacts, the test and lint gates as they run today. It treats the entire current application as **v1**, including the internal "v2 reshape" that landed in April 2026, and describes the application that should come after it.

## 0. How to read this, and a note on the name

The repository already uses "v2" for its April 2026 compartmentalization into `product/`, `workshop/`, and `dashboard/`. That reshape is part of what this document calls v1: it changed the folder layout and the seam, not the product's shape. Where this document says "v1" it means everything at `HEAD` today. Where it says "v2" it means the application this document proposes. Where a v1 document is quoted, its own vocabulary is kept and marked.

Sections 1 through 3 are about v1 and are evidence-based; every number was measured in this session or is quoted from a file at `HEAD` with its path. Sections 4 through 9 are about v2 and are design; they are opinionated on purpose, and where a choice could reasonably go the other way, the alternative is named. Section 10 holds the evidence index, the glossary, and sample artifacts.

If you read one section, read §1. If you read two, add §2.12. If you are a QA lead, read §4.6, §5.3, §5.5 and §6.1; that is the whole product from your seat. v1 terms used in §§2–3 (probe, rung, verdict, cohort, posture, M5, C6) are v1's own and are defined in `docs/glossary.md`; v2 terms are defined in Appendix B and are not used before §4.

## 1. The one-page answer

**What v1 is.** A 126,000-line TypeScript engine (79k product, 28k workshop, 18k dashboard, excluding 73k lines of tests) that ingests Azure DevOps test cases and is designed to compile them into Playwright tests for OutSystems applications through an eleven-rung deterministic resolution ladder, with a workshop that measures the engine against probes derived from the engine's own manifest on a synthetic React app, a three-dimensional dashboard that visualizes that loop, and 59,000 lines of documents describing the substrate, the levels, the invariants, the theorem groups, and a thirteen-step plan. Eighty percent of its 497 commits were authored by an agent.

**What v1 has actually done.** It has never authored a test for a real customer backlog. Its flagship emitted test is four opaque calls into the engine, every step deferred, default mode `dry-run`. No default code path calls a model; the "agent" in every measurement loop is a regular expression. The workshop graduated two verdicts on the synthetic app in April; the first real OutSystems page in September showed the synthetic app could not render the shapes real pages have — content-named controls, placeholder-named inputs, roleless clickables, `data-block` nesting. The one thing that worked on real websites, at 15 of 18 steps, is an 835-line runner that bypasses the engine's parser, binder, and ladder entirely. The unit suite is green (4,161 tests); the lint gate the README calls authoritative has been red since March (298 errors today).

**What v1 got right.** Provenance minted at the event. Append-only evidence. A structured needs-human handoff instead of a thrown error. The facet — a named, role-bearing, provenance-carrying unit of memory queryable by intent phrase — as the compounding asset. Role-and-name-first locators. Four named error families on interaction, plus `unclassified`. ADO identity annotated on every test. The clean-room evaluation discipline: declare the partition before contact, promote one way, evaluate with a fresh session, retract when contaminated. And, in its last thirty days, a method: touch a real page, write down what broke, fix it with a law, spend one held-out route, report the number.

**What v2 is.** The inversion. The agent is the compiler and the engine is its toolbox: thirteen tools with stable names and receipts — fetch intent, open, observe, act, assert, query memory, mint, enrich, emit, run, publish, raise a handoff, record a review — exposed over MCP to whatever agent host the customer already runs and to a thin batch driver. The product surface is the customer's own repository: plain Playwright specs with the ADO wording as step titles and a generated page object per screen, runnable with `npx playwright test` and nothing else. Memory is a facet catalog earned from real screens through the observation harness v1 built in its final month, living in YAML beside the tests, gated so agent-minted facets are candidates until a human accepts a test that uses them. Measurement is three numbers a QA lead already cares about — acceptance, survival, cost — on held-out real applications, with synthetic fixtures downstream of incidents and never upstream of any verdict. Results go back to Azure DevOps as test runs, closing the loop v1 never closed.

**What changes in size.** About 25,000 lines instead of 126,000. Thirteen tools instead of thirty-seven commands. Four moves instead of eleven rungs. Seven artifact kinds instead of a dozen-directory runtime root. Five documents under 3,000 lines instead of ninety documents at 59,000. Forty terms instead of a hundred and some, with no collisions.

**What changes in method.** Every pull request lands with a receipt from a real application. Plans are pull-request descriptions. No verdict is declared on synthetic evidence. The gate is green or the work does not merge.

**Why this is the answer and not a smaller course correction.** Because v1's own trajectory already found it. The cold-start spike in May and the reality study in September are the two moments the repository stopped measuring itself and touched the world, and both produced more truth per day than the preceding months of substrate work. v2 is the repository trusting that method enough to be rebuilt around it.

## 2. What v1 actually is — an evidence-based portrait

This section is the ground the rest stands on. Every claim was checked against the tree at `HEAD` (`9714891`, 2026-09-17) by reading the file, running the command, or both; Appendix A lists them. Where a document says one thing and the code another, the code is reported and the document is quoted.

### 2.1 Size and shape

| Measure | Value |
|---|---|
| hand-written TypeScript, excluding tests | `product/` 79,391 lines · `workshop/` 28,420 · `dashboard/` 18,143 · total ≈ 126,000 |
| tests | ≈ 73,000 lines; 347 spec files; 4,161 vitest tests passing, 10 skipped, in 64 seconds |
| documents | 90 Markdown files under `docs/` (59,330 lines) plus README, VISION, BACKLOG, AGENTS (1,574) ≈ 60,900 lines; of which active v2 planning ≈ 25,000, v1 reference 15,682, archive 8,456 |
| plan documents | 10 surveyed (about 17,500 lines); the largest unexecuted plan (substrate study, 3,947 lines) and the plan for the project's largest gap (live adapter, 1,023) have landed no code between them |
| commits | 497 between 2026-03-29 and 2026-09-17; Claude 398, Daniel Dyer 85, Copilot bot 10, Danny 4; 56 pull requests merged, 54 by Daniel; branch prefixes claude 28, codex 24, copilot 2 |
| commit gap | zero commits between 2026-05-04 and 2026-09-03 (122 days) |
| CLI commands | 37 (23 product, 14 workshop) |
| MCP tools | 27 hand-curated in `product/domain/observation/dashboard.ts` plus 9 manifest-derived, about 36 |
| manifest verbs | 9 |
| resolution rungs | 11 (code); CLAUDE.md and the glossary each list 7 |
| fingerprint tags | 42 in a closed registry |
| algebraic structures | 15–16 modules under `product/domain/algebra/` |
| append-only logs in the registry | 10 |
| terms of art | about 132, with at least seven words carrying two or more meanings |
| `TODO` / `FIXME` / `HACK` in code | 0 |

The last row is not a compliment. A 126,000-line codebase with zero TODOs and 298 lint errors is one where no note to a future self ever survived a session; the coding notes forbid deprecation markers, and the sessions that wrote the code ended.

### 2.2 What works end to end

Being fair about this matters, because a great deal of v1 is real and some of it is excellent.

**Real and exercised:**

- The ADO adapter: WIQL query plus work-item fetch against REST 7.1, parsing `Microsoft.VSTS.TCM.Steps` XML, parameters, and the local data source (`product/instruments/intent/live-ado-source.ts`, 270 lines). Read-only. Does not parse shared steps (`<compref>`), does not query plan or suite membership, and there is no code anywhere that publishes results back.
- Parse, bind, task packet, and emission: the deterministic pipeline from a fixture ADO case to a spec, trace, review, and proposals file runs (`compile --ado-id 10001` was run in this session and wrote all four).
- The runtime interpreter with three modes (`playwright`, `dry-run`, `diagnostic`), role-affordance dispatch, navigation strategy, ARIA observation, state-topology observation, evidence persistence, proposal generation, trust-policy-gated activation, hints writer, semantic dictionary, interface graph, selector canon, state graph, drift analysis, learning corpora. All in-memory tested; none exercised against a real customer application.
- The workshop machinery: speedrun (corpus / iterate / fitness / score / baseline), convergence proof, scorecard with Pareto frontier, six of seven metric visitors (the seventh, C6, returns zero), the compounding engine with its hypotheses, receipts, trajectories and graduation gate, probe derivation across three rungs, the synthetic React substrate with 33 roles and nine axes, the customer-backlog corpora (8 fabricated resolvable cases, 14 fabricated needs-human cases), the public-AUT cold-start runner, the pattern ladder (8 patterns).
- The observation harness in `workshop/substrate-study/`: hydration detector, DOM walker with an accessible-name ladder and an affordance ladder, variant classifier, PII gate, snapshot store, page fingerprint, external harness with subresource relay. Used against a real OutSystems Reactive application on 2026-09-16/17.
- The dashboard: an 18,000-line React and three.js application with a five-zone shell, a spatial scene, playback, bookmarks, narration, and an MCP server; a 522-line VS Code extension with a task provider and a chat participant. No test file lives under `dashboard/`; its 13 specs sit in `tests/dashboard/`, and none drives the React or three.js layer.
- Architecture laws: seam enforcement, governance-verdict discipline, log-registry invariants, manifest drift check, phantom-axis laws, and 28 architecture test files (6,525 lines).

**Real but never used as designed:** the Reasoning port and its adapters. `select` defaults to `deterministic-token-overlap`; `interpret` defaults to `disabled`, whose stub rationale reads "No interactive agent session available. Escalating to needs-human." The `llm-api` and `session` adapters expect a caller to inject a `createChatCompletion` function; no file in the repository defines one. `synthesize` is a no-op in every adapter. There are zero model call sites in the codebase.

**Declared and not built:** the facet catalog. `product/domain/memory/facet-record.ts` is 64 lines of types that no product module imports; its only importer is its own law test, and the manifest names the file as a string. There is no store, no writer, no reader, and no data. `product/catalog/` — named in CLAUDE.md, the direction document, the product README, and the lookup-chain table — does not exist. The four memory verbs in the manifest carry the comment "implementations land at Step 7." Step 7 has not started. The five-slot lookup chain that the catalog was to feed handles two slots (the canonical-artifact ones) and says of the other three, in its own header: "Slots 1, 4, and 5 are stub paths that record their slot in `slotsConsulted`."

### 2.3 What the flagship test actually looks like

The seeded demo scenario is ADO case 10001, "Verify policy search returns matching policy," four steps. Running `compile --ado-id 10001` at `HEAD` emits this file (reproduced whole, comments included):

```ts
// AUTO-GENERATED by tesseract -- do not hand-edit
import { test } from "../../../../fixtures/index";
import { createScenarioContext } from "../../../../product/composition/scenario-context";
test("Verify policy search returns matching policy @smoke @billing @P1", async ({ page, demoSession }) => {
    test.info().annotations.push({ type: "ado-id", description: "10001" });
    test.info().annotations.push({ type: "ado-revision", description: "1" });
    test.info().annotations.push({ type: "content-hash", description: "sha256:1930319e…" });
    test.info().annotations.push({ type: "confidence", description: "intent-only" });
    test.info().annotations.push({ type: "deferred-steps", description: "1, 2, 3, 4" });
    const scenario = createScenarioContext(page, "10001", { demoSession });
    // [intent-only]
    await scenario.executeNavigateToPolicySearchScreen();
    // [intent-only]
    await scenario.executeEnterPolicyNumberInSearch();
    // [intent-only]
    await scenario.executeClickSearchButton();
    // [intent-only]
    await scenario.executeVerifySearchResultsShowPolicy();
});
```

Five things a reviewer should notice:

1. **There is no test here.** No locator, no assertion, no action. Four method names and the word `intent-only` four times. The review artifact confirms it: "Knowledge hit rate: 0", "Step provenance: … unresolved=4". A QA cannot say what will be clicked.
2. **It re-enters the engine at run time.** `createScenarioContext` (`product/composition/scenario-context.ts`) loads the run plan from `<cwd>/dogfood`, builds a runtime environment, and each generated method calls `runScenarioHandshake` — the full eleven-rung resolver — inside a `test.step`. The test is a client of the engine that happens to be shaped like a test.
3. **By default it does not drive a browser.** `TESSERACT_INTERPRETER_MODE` defaults to `'dry-run'`. A green run means nothing happened.
4. **It cannot run as emitted.** The fixture import resolves to `<repo>/fixtures/index`, which does not exist (the fixture lives at `dogfood/fixtures/index.ts`, one directory shallower). And `ScenarioContext` exposes only `screen()` and `executeStep()`; `executeNavigateToPolicySearchScreen` is not defined on it. `tsconfig.json` excludes `dogfood/generated`, so nothing typechecks it, and the file is not tracked by git.
5. **It cannot leave the repository.** It imports the engine by relative path and depends on the `dogfood/` root, the `.tesseract/` workspace, and the Effect graph. A customer cannot copy it into their Playwright project.

The v2 substrate document, written in April, says a generated test must have "readable assertions, sensible sequencing, no leaked selectors in the body." The design achieved "no selectors" by removing the test. The same document warns that "a test that invites edits at the wrong layer is a credibility trap." This file is a `.spec.ts` in a `tests`-shaped folder that a QA would try to edit; every edit is meaningless.

Nothing in `.tesseract/runs/` exists for 10001 in this checkout. The flagship has been compiled and never executed here.

### 2.4 The agent that is not there

The vision document says "Claude is the first citizen of this loop today." The direction document says the codebase is "an API for an agent." The measurement documents describe "the agent" authoring against probes, resolving with reasoning, and earning batting averages.

At `HEAD`, no default code path calls a model, and nothing outside the test tree supplies the `createChatCompletion` the adapters require; `scripts/agent-speedrun.ts` documents the socket, in prose, and leaves it unplugged. Every number the project has ever reported — the 33% to 78% cold-start climb, Verdict-10, Verdict-11, 29 of 29 parity, 100% probe coverage — was produced by regular expressions, token overlap, and lookup tables. The design intent, visible in the reasoning port's comments and the live-adapter plan, was that a Copilot session in VS Code would be the primary provider, an Azure OpenAI deployment the secondary, and Anthropic third; the plan to make the coding session itself the adapter (Z11d, 1,023 lines) has been "planning — no code has landed" since April. The one adapter that could dial out has no dialer.

This is not a configuration oversight. It is the shape of the system: the engine was built to consult an agent at rungs 8 and 10 of an eleven-rung ladder whose first seven rungs read from a catalog that does not exist. On a new customer's first contact all seven are empty by definition. The cold-start path through the ladder is token overlap, then `getByRole`, then token overlap again, then needs-human.

### 2.5 The measurement that measured itself

The workshop's claim (direction document §5.2): "There is no separate evaluation runner. There is `product/`, invoked by `workshop/`." The code says otherwise.

- `workshop/probe-derivation/` imports nothing from `product/runtime/`, `product/composition/`, or the codegen. The rung-3 classifiers say in their own docstrings that they "mirror the real interact verb" and call `page.click()` themselves. The celebrated "rung-3 parity 29/29" proves the workshop's two models of a verb agree with each other — which is a real property, and the reason the reality study could quantify the gap the moment it saw a real DOM. It is a well-built substrate test. It is not a measurement of the product.
- Probes are "derived from the manifest" in the sense that the manifest supplies nine names; every probe's content is one of nine hand-written YAML files totaling 1,067 lines. The direction document's "not a handwritten scenario corpus" is a handwritten scenario corpus with a directory convention.
- Four of the nine verbs — the memory verbs with no implementation — have classifiers that read the fixture's own fields and report `matched` if the fixture is well-formed. Four ninths of "100% coverage" has no product code in the loop.
- Coverage is defined as verb × facet-kind × error-family. Error families are declared per verb in the manifest; the facet-kind axis is not in the manifest at all — it is read out of the same hand-written fixture the probe was derived from. One of the three dimensions is supplied by the thing being measured.
- The older speedrun and dogfood loop does invoke the real compile and run pipeline (`workshop/orchestration/` imports `application/resolution/compile` and `application/commitment/run`), against the synthetic app, with the deterministic adapters. That loop is the one whose flywheel the March archive said "has never turned once."

Then the reality study. On 2026-04-23 and 2026-04-24 the graduation gate returned `holds`, twice, with the verdict memos grading themselves "structural-plus-narrow" and "multi-cohort-synthetic" and saying plainly: "ADO cases are fabricated … CompilationReceipts are produced by a heuristic … NOT the real compile pipeline … No LLM reasoning." On 2026-09-16 the first real OutSystems Reactive page showed that 81% of accessible names come from element content, that roughly a quarter of visible interactive controls across the seven study routes carry no ARIA role, and 36–39% on the two routes re-measured after the walker was fixed, that search inputs are placeholder-named, that identity is `data-block` density and runtime globals rather than React fibers or `osui-*` classes, and that the synthetic substrate "has no way to render" the roleless-control shape at all, "so the ladder's blindness to it is currently unmeasurable." The graduation gate had passed on a device that could not pose the dominant failure mode, and nothing inside the workshop could have told it so.

The archived March assessment already contained the number that mattered: on the synthetic scenarios that "test real intelligence," the alias-matching path hit 32%.

### 2.6 The 835 lines that work

`workshop/customer-backlog/application/public-aut-runner.ts` is what ran on real websites. For each fixture case it classifies each step with the regex classifier, launches Chromium, probes the DOM with `getByRole` and `getByText` (falling back to the first word of a multi-word name), performs the action so the next step sees the resulting state, checks the found target against an `expectedTarget` the fixture author recorded, and writes a receipt. Its own header: "This is not the full compile pipeline; it skips parse/bind and the 11-rung resolution ladder."

On the two training sites in May: 15 of 18 step-actions matched something; of the eight verifiable matches, seven were the target the author meant and one silently clicked the wrong checkbox ("toggle all" instead of the per-todo one) while reporting `matched`. On the held-out marketing site in September: zero of three DOM-targeting steps, because the classifier captured "English language" instead of "English" and the receipt recorded neither page title nor URL nor snapshot, so the memo could not say whether the classifier, site drift, or a headless-only rendering was to blame.

The journal's own stakeholder summary of this runner is the most honest sentence in the repository: "We have a system that takes a written test case in normal English and runs it in a real browser, no Playwright code required." That sentence describes an interpreter, not a compiler, and it describes 835 lines, not 126,000.

### 2.7 The doctrine-to-delivery ratio

The plans that shipped inside the week they were written shipped completely (probe IR, scenario corpus, compounding engine — about 4,100 lines, all landed); the plans that named an external gate (legal review for the substrate study; an operator-confirmed URL for the harness) stalled for months or entirely. That bimodality is the finding. The aggregate ratio — roughly one line of active planning per five lines of hand-written code — is the symptom. The live-adapter plan, whose subject is the single largest gap between what the system calls itself and what has run, is the one plan nobody executed.

The direction document — the one CLAUDE.md tells a fresh session to read first — carries "Status as of 2026-04-21" and marks Step 1.5, the "customer-reality probe," as landed. No artifact of it exists anywhere in the tree; the directory it names (`workshop/observations/customer-probe-01/`) was never created. The transmogrification document's definition-of-done table marks the dashboard MCP server split into `handlers/context/actions` as complete; the file is a single 1,806-line module with no such folders. Sixty-five files, including CLAUDE.md, VISION.md, README.md, BACKLOG.md, `knip.json`, and the ESLint config, still reference a `lib/` tree deleted on 2026-04-19. CLAUDE.md contradicts itself between its third line ("the code lives under `lib/`") and its eighty-third ("The `lib/` tree is gone"). README documents five npm scripts that do not exist and three doc paths that moved.

### 2.8 Vocabulary load

About 132 terms of art. "Probe" has three meanings and a glossary section to say so. "Rung" names positions on three different ladders (eleven resolution rungs, four substrate rungs, six locator strategies), and a `Ladder<RungId>` typeclass was built to keep them apart. "Manifest" names the agent vocabulary file, the envelope header, the learning-corpus index, the route index, and the discovery run. "Verdict" is a governance outcome and also a numbered graduation milestone. "Source" is a lookup-chain slot, a provenance brand, and an intent channel. "Substrate" is the synthetic app and also the envelope-type foundation. "Cohort" keys the M5 metric and also partitions public applications. A fresh agent is instructed to read roughly eight documents totalling several hours before touching code, and the instructions are themselves stale.

### 2.9 The gates

| Gate | README says | Today |
|---|---|---|
| `npm run build` | emits runtime artifacts | passes; manifest drift check clean |
| `npm run typecheck` | "strict repo-wide typecheck including tests" | fails, 50 diagnostics; the shipping build relaxes `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` and excludes `tests/` |
| `npm run lint` | "typed lint over hand-authored sources" | fails, 298 errors (the checked-in output from March shows 415) |
| `npm run test:unit` | — | passes: 4,161 tests, 64 seconds, with `@playwright/test` aliased to a 39-line shim |
| `npm run test:integration` | — | cannot start: all three Playwright configs point their web server at `dogfood/fixtures/demo-harness/server.cjs`, deleted on 2026-04-22 |
| `npm test` | "run compiler/runtime/documentation law tests" | red since 2026-04-22 |
| `npm run check` | "the authoritative gate for both local work and Azure DevOps" | red since at least 2026-03-29 |
| seam law | "a compile error, not a convention" | a vitest regex scan with 26 grandfathered workshop files and 3 dashboard files; `dashboard/` also imports `workshop/orchestration/speedrun` and `workshop/synthetic-app/server` and hosts the speedrun, so it is not the read-only observer the doctrine names |

### 2.10 What is genuinely good and must survive

Ideas, in the order they should be carried:

1. **Provenance minted at the event**, compile-gated against synthetic sources, with a closed tag registry. The right invariant for anything a human must trust.
2. **Append-only evidence** with a registry of logs, each with a writer, a format, and an idempotency key. Contradictions stack; nothing overwrites.
3. **The needs-human handoff as a structured terminal**, not an exception: unresolved intent, attempted strategies, evidence slice, blockage type, candidates, next moves, reversal policy.
4. **The facet** as the unit of memory: named, role-bearing, alias-carrying, provenance-threaded, queryable by intent phrase, with locator health as a fact about the facet. Designed; not built.
5. **Named error families** on interaction and on reasoning, with exhaustive folds.
6. **Role-and-name-first locators**, the ladder order, and the reality-study corrections: accessible names computed the way the browser computes them, landmark scoping, row scoping, roleless handler owners by exact text last.
7. **ADO identity on every test** — id, revision, content hash — as annotations.
8. **The clean-room evaluation rules**: declare the partition before contact, promote one way, evaluate with a fresh session, spend a route once per version, retract when contaminated.
9. **The observation harness**: hydration detection, the naming ladder, the affordance ladder, landmarks, `data-block`, ids, variant classification, PII gate, page fingerprint, subresource relay.
10. **The habit of writing down what broke**, with a law, on the same day.

Code that carries these and is worth lifting is listed in §7.

### 2.11 The last thirty days, and the method that works

Two episodes, four months apart, ran the same loop: name what you expect a change to do, make the smallest change, run against a live target, record the outcome against the prediction, reserve untouched targets to test generalization later.

In May, eight cycles in 48 hours took a cold-start runner from 3 of 9 to 7 of 9 on TodoMVC, built the semantic-correctness check that caught a false positive, discovered that the held-out site had been used to drive code changes, promoted it to training with a written reason, and retracted the generalization numbers while keeping the code. The journal's last entry switched to plain English on purpose: "No 'probe seeds' as the headline; no 'confirmation rate' as a number to chase. The numbers that matter: hit rate, verified rate, false-positive rate, cost, and — eventually — generalization rate against a clean held-out."

In September, a fresh session ran the held-out evaluation exactly once and relayed the JSON without interpretation. Twelve days later the reality study harvested seven study routes of a real Reactive application, found the walker had never executed, fixed it, produced six findings, refuted one of them the next day by checking Chromium before writing code, landed ten substrate and product changes with laws, added the page fingerprint the September 4 memo said receipts were missing, and spent one held-out route to show that five of six findings generalize. Thirteen held-out routes remain untouched.

That is the method. It produced more verified truth about the problem in nine working days than the preceding five months of substrate construction, and it did so with a fraction of the code.

### 2.12 The pattern, named plainly

The system built an elaborate account of how it would know it was improving before it had done the thing once for anyone. Theorem groups, proof obligations, seven metric visitors, a compounding engine, a convergence machine, a graduation gate, a scorecard with a Pareto frontier, a three-dimensional observatory — every one of them a way of measuring the system by the system, on a world the system's authors built. Meanwhile the one loop that touched the world was 835 lines that bypassed the engine, and the emitted "test" was a pointer back into the engine.

The thinking is not the problem. The Galois connections are correct. The phantom axes do what they say. The documents are lucid and self-critical in a way most codebases never manage; the archive already said "the flywheel has never turned once" in March and "the system is ~60% of its own specification." The problem is that nothing in the loop required contact. Every gate the system built could be satisfied from inside it, so the work went where the gates were. That is a property of the structure, not of the people, and it is the one thing v2 changes first: the only gate that counts is one test, for one real screen, read by someone who did not build the system.

The May journal and the September study are the repository finding its way out. v2 is what it looks like to trust that.

## 3. What v1 taught

Fifteen lessons, each traceable to something the repository did, measured, or admitted. The history roll-up behind this section holds sixty-seven verbatim admissions; these are the ones that change what v2 builds.

1. **A measurement the authors can satisfy without leaving the building measures nothing.** §2.5 is the evidence; the only instrument that found the gap was contact with a real page.

2. **Contact produces more truth per day than construction.** Nine working days across May and September produced the false-positive detector, the contamination retraction, the walker fix, six findings, ten corrections, and a held-out generalization result. Five months of substrate work produced a substrate that had to be corrected on first contact.

3. **The step-to-target problem is inferential, not deterministic.** The substrate document says so ("intent is underspecified by construction — that is why the agent must interpret, not execute") and the code does the opposite. Seven of eleven rungs read a catalog that does not exist; the default reasoning adapters are token overlap and `disabled`. The regex runner reached 75% on training sites and 0% on a held-out one. Parsing ADO XML and emitting Playwright are deterministic; the middle is judgment.

4. **A test that re-enters the engine is not a test.** It cannot be read, cannot be run without the engine, cannot be debugged with the trace viewer, cannot be owned, and — in the one emitted example — cannot execute at all. The repository's own §3.2 argues against the shape it ships.

5. **"Landed" must mean an artifact exists.** Step 1.5 is marked landed with no artifact. The MCP split is marked done and did not happen. The build gate is described as authoritative and has been red for six months. Status lines froze in April while prose was patched in September.

6. **Plans that ship in the same week ship; plans that wait on a gate wait forever.** About 4,100 lines of same-week plans landed completely; about 5,000 lines of gated plans landed nothing. The gate that mattered most — putting a model in the loop — was never opened.

7. **Held-out means held out.** Cycles 5–7 used the held-out site to drive code changes and then measured generalization on it; the journal caught this and retracted. A one-way partition, a fresh evaluator, and retraction-in-place are the whole discipline, and the repository already wrote it down correctly.

8. **Receipts must explain failures, or the next evaluation is wasted.** The September 4 memo could not distinguish a classifier bug from site drift from a headless-only render, because the receipt carried no page title, URL, or snapshot. The page fingerprint fixed this; it should have been there from the first run.

9. **Verified-correct is the number, not hit rate.** A step that "matched" the toggle-all checkbox reported success for cycles. Every match needs an expected target, and the report should show verified-correct over verified-plus-false-positive.

10. **Real pages name things by content and placeholder, hide controls behind roleless handler owners, and scope by landmark and `data-block`.** Role-and-name-first is right as a first strategy and structurally insufficient alone on OutSystems Reactive. The accessible name must be computed the way the browser computes it, and the affordance ladder must rank by handler ownership, not by inherited cursor.

11. **Synthetic fixtures belong downstream of incidents.** The substrate's genuine value — a controlled renderer for a shape that once broke something — survives; its role as the benchmark of improvement does not.

12. **Vocabulary is a cost paid by every future session.** Three probes, three rungs, five manifests, two verdicts. A fresh agent pays the disambiguation tax on every read; the repository's own glossary is a warning label.

13. **Seams are enforced by build configuration, not by a regex test with a grandfather list.** Twenty-nine grandfathered files, a dashboard that hosts the speedrun, and a document that calls it a compile error.

14. **Strictness that is switched off for the shipping build is decoration.** The two strict flags most likely to catch real bugs are disabled in `tsconfig.build.json`; full typecheck fails with 50 diagnostics; the unit suite runs with the browser library shimmed out.

15. **Plain English at the end of the loop.** The journal's Entry 35 is the best status report in the repository because it was written for a stakeholder: what it does, what is proven, what is not. The three numbers it names — hit rate, verified rate, false-positive rate, plus cost and generalization — are the ancestors of §6.

### 3.1 Five facts from the customer's world

These come from the domain brief prepared for this document, which verified them against OutSystems' and Microsoft's own documentation and Playwright's release notes; they shape §5 directly.

- **OutSystems' recommended testability path requires the app team to annotate every widget** — set a widget Name so the generated id ends with it (`input[id$=UserNameInput]`), or add an `os-test-id` extended property. Enterprises rarely fund this retroactively. Resolving un-annotated DOM as it ships is the wedge; and for teams that did annotate, Playwright's `testIdAttribute: 'os-test-id'` makes it first-class for free.
- **"AI writes Playwright" is now free and first-party.** Playwright ships planner, generator, and healer agents and a bundled MCP server, hosted in Claude Code, VS Code, Codex, and others. v2 must not compete on generation. What Playwright's agents do not do: read an ADO backlog, report to ADO test points, keep a provenance-threaded memory of the application across runs, know OutSystems, or gate memory writes.
- **Microsoft's own test-plan automation task does not support Playwright or TypeScript.** `AzureTestPlan@0` supports Java, Python, and Jest. The Test Results REST API does everything needed — `testCase`, `testPoint`, `testCaseRevision`, per-step `actionResults` with `stepIdentifier`, outcomes, attachments — and JUnit publishing alone does not turn test-plan points green. Nobody is closing this loop for this stack.
- **Enterprises factor preambles into shared steps (`<compref>`), and suites are defined by plan and suite membership.** v1's adapter parses neither; a case may silently start mid-flow, and "everything in suite Y" needs the Test Plans API, not WIQL alone.
- **Reviewers reject tests that only assert `toBeVisible()`.** Assertion substance is a first-class quality property of an agent-authored test, alongside no sleeps, no brittle CSS, no branching, and no logic hidden in helpers.

## 4. v2 — the inversion

v1 put the engine at the center. The agent was an "instrument" the engine consulted at rungs 8 and 10 of an eleven-rung ladder, behind a port whose default adapters are token overlap and `disabled`. The customer's test was a facade that re-entered the engine at run time. The measurement was the engine measuring itself on a substrate the engine's authors built. The human QA was at the edge, in an inbox.

v2 turns that inside out. Six commitments, each traceable to something v1 learned the hard way.

### 4.1 The agent is the compiler; the engine is its toolbox

The evidence in §2 is unambiguous. The eleven-rung deterministic ladder produced `intent-only` on the flagship scenario. The thing that worked on real websites — 15 of 18 steps on TodoMVC and httpbin, in a real browser — was a regex classifier plus `getByRole`/`getByText` plus "do the action so the next step sees real state", written in one 835-line file that skips parse, bind, and the ladder. A regex is the floor of what "read the step, look at the page, pick the target" can do. A model with an accessibility snapshot in front of it is the ceiling, and v1 never once put one in the loop.

So v2 stops trying to be the thing that understands the test case. The host agent — Claude Code, Copilot, Codex, whatever the customer already runs — reads the ADO steps, looks at the page through Tesseract's eyes, decides, and writes the test. Tesseract provides the eyes (observation), the memory (facets), the hands (verified interaction), the pen (emission), the harness (execution), and the ledger (receipts and ADO results). Every one of those is a tool with a stable name and a receipt. The "vocabulary manifest" v1 wanted becomes what it always should have been: the tool list an agent host shows the model, plus a two-page playbook.

What this preserves from v1: the manifest idea, the Reasoning receipt (provider, model, tokens, latency, prompt fingerprint — recorded on every authoring decision), provider polymorphism, the four named error families (plus `unclassified`) on interact. What it retires: the ladder as the seat of judgment; the heuristic classifier as anything but a fallback and a candidate pre-filter.

### 4.2 The product surface is the customer's repository

The emitted test is plain Playwright TypeScript that a QA lead can read, run with `npx playwright test`, edit, review in a pull request, and keep if Tesseract disappears tomorrow. No `createScenarioContext`. No runtime interpretation. No import of the engine. No `dry-run` default that makes a green test mean nothing.

Concretely: one spec file per ADO test case, `test.step` blocks carrying the ADO wording verbatim, annotations carrying the ADO id and revision and content hash (v1 already does this well), web-first assertions, and a page object per screen generated from the facet catalog so that the same button is named the same way in every test. Locators resolve at authoring time to one best strategy — role and accessible name first, then label, placeholder, text, test id, css — and the page object records why, in a comment, with the fallback the agent verified.

Regeneration respects a handoff boundary (v1's substrate doc named this correctly and never built it): generated files carry a header; a `// tesseract:keep` region or a sibling override file survives regeneration; a QA-authored change to intent or memory is never discarded. A test that invites edits at the wrong layer is a credibility trap. v2 ships the boundary in month one, not at "Level 3."

### 4.3 Contact is the only measurement

v1 graduated Verdict-10 and Verdict-11 on a synthetic React app before the first real OutSystems page revealed that the substrate could not even render the shapes real pages have. That is the whole argument. A measurement the product's authors can satisfy without leaving the building is not a measurement of the product.

v2 keeps three numbers on the wall and nothing else:

- **Acceptance** — did a human QA accept the emitted test into the suite, as written or with at most a small edit? Measured per test, reported per screen and per suite.
- **Survival** — did the accepted test keep passing across the next N runs and the next application release without maintenance, and what was its flake rate?
- **Cost** — wall-clock minutes and model tokens per accepted test, and the trend on revisited screens (this is v1's M5 "memory worthiness" in language a QA lead understands).

The held-out discipline the cold-start spike wrote down — partition declared before contact, one-way promotion, a fresh evaluator for held-out runs, retraction when contaminated — carries forward as a one-page checklist. Held-out means real applications: the thirteen untouched routes on the OutSystems UI website, other public OutSystems apps as they are found, and the customer's own unseen screens. The synthetic app survives only as a renderer for regression fixtures: every real incident becomes a fixture, and the fixture suite proves the incident stays fixed. Synthetic coverage is never again a graduation criterion.

### 4.4 Memory earned from real screens

The facet catalog was v1's declared compounding asset. It was never built; the verbs were declared with frozen signatures and their implementations were scheduled for "Step 7." Meanwhile the reality study built, in three days, the instrument that a catalog actually needs: a walker that computes accessible names the way the browser does, records where the name came from, ranks interactive affordance by who owns the handler, keeps landmarks and `data-block` scope, and fingerprints the page.

v2 builds memory from that instrument. Every observed screen yields facets — element, state, vocabulary, route — with provenance minted at observation, an evidence log that is append-only, locator health derived from run results, and confidence derived on read. The catalog lives in the customer's repository next to the tests it feeds, in YAML a reviewer can read, gated so that an agent-minted facet is a candidate until a test that uses it has been accepted or a human has approved it. Platform knowledge that generalizes across OutSystems apps — placeholder-named search inputs, roleless handler-owning clickables, reliable landmarks, `data-block` scoping, designer ids — lives in Tesseract's pattern library, grounded in public apps, versioned by OutSystems variant. App knowledge lives with the app. That is the 80/20 the v1 vision document described as its long arc.

### 4.5 Determinism where it matters, agency where it pays

v1's founding rule was "deterministic first, structured translation second, agentic last." The rule was right about run time and wrong about authoring time, and v1 applied it to both. Tests must be deterministic: they run in CI without a model, without the engine, without network calls to anything but the application. Authoring may be agentic: a model reads, looks, decides, and every decision is receipted with the model id, the prompt fingerprint, the evidence it saw, and the alternatives it rejected. Memory writes are gated. Drift repair is a proposal in a pull request, never a silent patch and never a live model in the CI path.

This is the compile framing done properly. The agent is the compiler. The compiled artifact is deterministic. The receipts are the compiler's trace.

### 4.6 The operator is a QA lead, not a developer

v1's operator runs thirty-seven CLI commands, reads a review file that is a hundred lines of "none" per step, and watches a three-dimensional scene of particles and glass panes. v2's operator points the agent at an ADO suite, a URL, and credentials; watches the agent author in a headed browser or reads the pull request; reviews plain tests; and sees results as green and red points on the ADO test plan they already own.

The dashboard becomes three things a QA lead already understands: the pull request, a one-page authoring receipt per test (what was observed, which facets were used or minted, what the agent decided and why, where it needed a human), and the ADO test run. Azure Test Plans is a paid add-on (on the order of fifty dollars per user per month, with no free seats), so every prospect who can use the ADO loop already has a budget owner for it; that is the qualifying question for a pilot, and the reason the results loop is the purchase justification rather than a feature. The needs-human handoff — v1's genuinely good idea — becomes a comment on the ADO test case and a `test.fixme` in the spec with the structured reason inline, not an item in a bespoke inbox.

### 4.7 Why an inversion and not a repair

The obvious smaller move is to fix v1 in place: define the missing `createChatCompletion`, point the reasoning port at a real model, change the emitter to write real locators, and run ten real test cases past a QA lead. That experiment is worth doing, and §8.2's week one is exactly it, using lifted v1 code. The question is what you keep afterward.

Keeping v1 means keeping the eleven-rung ladder as the seat of judgment with a model bolted on at rung 8, the runtime facade the tests re-enter, the twelve-directory workspace, the workshop that measures itself, the dashboard that hosts the loop, the 26 grandfathered seam files, sixty thousand lines of documents that describe three different repository layouts, and a gate that has been red for six months. Every one of those would have to be either maintained or removed, and removing them one at a time inside a live tree is how v1 spent April. The evidence in §2 is that the parts of v1 worth keeping are about eight thousand lines, most of them written in the last month, and that they are easier to lift than to excavate.

The other reason is the process rules in §8.5. They only hold in a tree where the reality budget is the norm from the first commit. Grafting them onto v1 means arguing, for every existing module, whether it has ever been exercised against a real application; the answer, for most of it, is no, and the argument is the cost.

### 4.8 What the inversion is not

It is not a rewrite for its own sake, and it is not a rejection of v1's ideas. Provenance minted at the event, append-only evidence, the structured handoff, the facet as the unit of memory, the interaction error families, the locator ladder order, the accessible-name ladder, the affordance ladder, the clean-room evaluation rules, the annotation of tests with ADO identity — all of these are v1's, and all of them survive. What does not survive is the shape that put an engine where an agent should be and a synthetic mirror where a customer should be.

## 5. v2 — the system

This section is concrete on purpose. Where v1's documents described a substrate in the language of adjunctions and Galois connections, this one describes files, tools, and the order in which a QA lead's afternoon happens. Sizes are targets, not promises; they exist so that growth past them is a signal.

### 5.1 Components

Eight components, one package, one process boundary (the host agent). Target total: 20–25k lines of TypeScript excluding tests, which is roughly one eighth of v1.

| # | Component | Responsibility | Inherits from v1 | Target LOC |
|---|---|---|---|---|
| 1 | `ado/` | Fetch test cases (WIQL + work items), parse `Microsoft.VSTS.TCM.Steps` XML, parameters, local data source, shared steps; publish results to a test run | `product/instruments/intent/live-ado-source.ts` (270 lines, read-only today) | 1.5k |
| 2 | `observe/` | Open a page, wait for hydration, walk the DOM the way the browser's accessibility tree does, classify the OutSystems variant, gate PII, fingerprint the page, capture a screenshot and the ARIA snapshot | `workshop/substrate-study/` walker, hydration detector, variant classifier, snapshot record, page fingerprint; `product/instruments/observation/aria.ts` | 4k |
| 3 | `memory/` | The facet catalog: per-screen YAML records, an in-memory index queryable by intent phrase, mint and enrich with provenance, append-only evidence log, locator health, confidence on read, aging, candidate-to-trusted gating | `product/domain/memory/facet-record.ts` (schema only), the trust-policy evaluator (simplified), the append-only log adapter | 3k |
| 4 | `resolve/` | Candidate generation for one step on one screen: memory hit, heuristic pre-filter, pattern library (OutSystems-generic and app-specific), locator verification (exactly one visible match), the four-step ladder in §5.9 | `intent-classifier.ts`, the seven pattern matchers, `role-affordances.ts`, the locator ladder, `interact.ts` error families | 3k |
| 5 | `emit/` | Generate the spec and the per-screen page object from the resolved flow and the catalog; regenerate idempotently; honor keep-markers and override files; format | `product/instruments/codegen/spec-codegen.ts` (AST emission; new target shape) | 2k |
| 6 | `run/` | Execute one spec or a suite with Playwright, collect the trace, classify failures against facets, write run receipts, publish to ADO | the run-record shape, failure families, `navigation-strategy.ts` idempotence check | 1.5k |
| 7 | `tools/` | The MCP server and CLI that expose §5.2, the playbook the agent reads, and the batch driver that loops a model over a suite | `dashboard/mcp/` reduced to a dozen tools; `public-aut-runner.ts` as the driver skeleton | 2.5k |
| 8 | `eval/` | Held-out cohorts, clean-room manifest, the three numbers, incident-to-fixture regression suite, the fixture renderer | `workshop/customer-backlog/public-aut/` cohort manifest and runner; `workshop/synthetic-app/` as renderer only | 3k |

Plus `report/` (≤1k): a static HTML or Markdown authoring receipt per test and a suite summary, generated from receipts. This replaces the dashboard.

There is no `domain/application/runtime/instruments` layering ceremony. Each component has a `types.ts`, pure functions, and the one or two adapters it needs. Effect stays where it earns its keep (concurrency in the batch driver, retries on ADO and browser calls, structured errors); it is not required in pure code.

### 5.2 The tool surface

Thirteen tools. This is the manifest reborn: every tool has a name, a typed input and output, named error families, a version, and a receipt. The same thirteen are exposed over MCP for interactive hosts and called directly by the batch driver; the last, `review.record`, is the one a human calls, through the CLI or the pull request, because acceptance is a human decision and the number in §6.1 is derived from its receipts. Adding capability means adding a tool; changing a tool's meaning means a new name.

| Tool | Input | Output | Error families |
|---|---|---|---|
| `ado.fetch` | `{ planId?; suiteId?; ids?: string[]; wiql?: string }` | `TestCase[]` with steps (action, expected), parameters, data rows, shared steps expanded inline with each expanded step keeping its ADO `stepIdentifier` (`"<parentId>;<childIndex>"`), revision, content hash | rate-limited, unavailable, malformed-response, unclassified |
| `ado.publish` | `{ planId; suiteId; runName; results: { testCaseId; testPointId; testCaseRevision; outcome; durationMs; errorMessage?; failureType?; traceRef?; steps?: { stepIdentifier; outcome }[] }[]; associateAutomation?: boolean }` | `{ runId; url; resultIds[] }` | rate-limited, unavailable, unclassified |
| `app.open` | `{ url; auth?: 'storage-state' \| 'form'; profile? }` | `{ pageId; finalUrl; variant: 'reactive' \| 'traditional' \| 'unknown'; hydration }` | timeout, unavailable, unclassified |
| `app.observe` | `{ pageId; scope?: 'page' \| landmark \| dataBlock; includeScreenshot? }` | `Snapshot`: `snapshotId`; candidates with role, accessible name, naming source, affordance source, landmark, data-block scope, ids, visibility, enabled; page fingerprint; ARIA snapshot text; `truncated: boolean`. Capped at 200 candidates and 32 KB of ARIA text per scope; non-interactive nodes are dropped first, then disabled, then off-screen | timeout, unclassified |
| `app.act` | `{ pageId; action: click \| fill \| select \| check \| press \| hover; target: Locator; value? }` | `{ outcome; postState: Snapshot delta; errorFamily? }` | not-visible, not-enabled, timeout, assertion-like, unclassified |
| `app.assert` | `{ pageId; assertion: visible \| text \| value \| url \| count; target?; expected }` | `{ passed; observed }` | timeout, assertion-like |
| `memory.query` | `{ screen; phrase; kind?; scope? }` | at most 8 `Facet`s scoring above 0.3, ordered by status weight × phrase score × locator health, trusted never below candidate at equal score; empty on an unseen screen | malformed-response, unclassified |
| `memory.mint` | `{ screen; facet: FacetDraft; evidence: { snapshotId; candidateRef } }` | `Facet` (status `candidate`) | conflict, unclassified |
| `memory.enrich` | `{ facetId; aliases?; locator?; evidence: { snapshotId; candidateRef } }` | `Facet` | conflict, unclassified |
| `test.emit` | `{ testCase; flow: ResolvedStep[]; screens: ScreenRef[]; handoffs: HandoffRef[] }` | `{ specPath; pageObjectPaths[]; diff }` | malformed-response, unclassified |
| `test.run` | `{ specPaths[]; profile; headed?; retries? }` | `RunReceipt[]` with per-step outcomes, failure family, facet references, trace path, page fingerprint at failure | timeout, unclassified |
| `handoff.raise` | `{ testCaseId; stepIndex; unresolvedIntent; attempted; evidence: { snapshotId }; candidates; nextMoves }` | `{ handoffId; adoCommentUrl? }` | unavailable, unclassified |
| `review.record` | `{ testCaseId; decision: accept \| accept-with-edit \| reject; reviewer; changedLines?; locatorEdited?; note? }` | `AcceptanceReceipt` | malformed-response |

`ResolvedStep` is the centre of the loop: `{ index; stepIdentifier; actionText; expectedText; verb; target?: { facetId } \| { locator; strategy; snapshotId; candidateRef }; value?; assertion?; }` or the `unresolved` variant `{ index; stepIdentifier; actionText; expectedText; handoffId }`. `Locator` is a Playwright locator expression plus the strategy that produced it; `FacetDraft` is a facet without provenance or status; `ScreenRef` is a screen name plus its page fingerprint; `HandoffRef` is a handoff id.

Every tool call appends one line to `receipts/authoring.jsonl` with the tool name, inputs (redacted), outputs (summarized), duration, and — for any step where a model decided something — the host's model id, prompt fingerprint, and token counts as reported by the host. That is v1's `ReasoningReceipt` moved to where decisions actually happen.

The playbook (`PLAYBOOK.md`, under 200 lines) tells the agent: read the test case, open the app, for each step query memory then observe then act, verify before you write, mint facets with the words the test author used, emit, run, publish, and raise a handoff instead of guessing. The playbook is the fluency manifest. A fluency check is a fixture test case the agent must author correctly end to end on a fixture app; it runs in CI against a pinned model.

### 5.3 The authoring loop, one work item end to end

1. `ado.fetch` returns test case 10001 with four steps and one parameter (`policyNumber = POL-001`).
2. `app.open` on the QA environment with a saved storage state; hydration detector waits until the OutSystems runtime is mounted and the DOM is quiet.
3. For step 1, "Navigate to Policy Search screen": `memory.query('policy-search', 'navigate to policy search')` finds a route facet from a previous session; the agent uses it. If memory were empty, `app.observe` scoped to the `navigation` landmark returns the menu links; the agent picks "Policy Search" by accessible name; `app.act` clicks; the page fingerprint changes; `memory.mint` records a route facet with provenance.
4. For step 2, "Enter policy number in search field": `memory.query` misses. `app.observe` scoped to the `search` landmark returns one textbox named by placeholder "Search Policy" (naming source: placeholder). The agent binds the parameter value, `app.act` fills it, and mints an element facet `policy-search:policy-number-input` with alias "search field", locator `getByRole('textbox', { name: 'Search Policy' })`, naming source recorded.
5. Step 3, "Click Search button": one `button` named "Search" inside the same landmark; act; mint.
6. Step 4, "Verify search results show policy": `app.observe` after the action shows a table whose row contains `POL-001`; `app.assert` visible on `getByRole('row', { name: /POL-001/ })`. The expected text "Matching policy appears in Search Results" is kept as the step title.
7. `test.emit` receives the four `ResolvedStep`s (and any handoffs, which become `test.fixme` steps with the reason inline), writes `tests/policy/10001-verify-policy-search-returns-matching-policy.spec.ts`, and regenerates `pages/policy-search.page.ts` from the catalog.
8. `test.run` executes the emitted spec headless with the engine out of the loop; it passes; the run receipt links the Playwright trace.
9. `ado.publish` creates a test run and marks the test point passed; the authoring receipt is written; the pull request is opened by the host.

If step 4's table had no row for the value, the agent tries the alternatives the snapshot offers (a "No results" alert, a different data row), and if nothing resolves, `handoff.raise` writes a structured reason, marks the step `test.fixme` in the spec with the reason inline, and comments on the ADO test case. The QA lead fixes the intent, the data, or the memory, and re-runs. Nothing is guessed silently.

### 5.4 Memory: the facet catalog

A facet is the unit of memory. v1's Step-3 schema is kept almost verbatim because it was right:

```yaml
# .tesseract/catalog/policy-search.yaml   (lives in the customer's repo)
screen: policy-search
route:
  url: /PolicySearch
  variant: reactive
  fingerprint: sha256:…            # landmarks + role counts + data-block count
facets:
  - id: policy-search:policy-number-input
    kind: element
    displayName: Policy number search field
    aliases: [search field, policy number, policy number in search field]
    role: textbox
    namingSource: placeholder          # content | aria-label | label-for | label-wrap | placeholder | none
    affordance: native                 # native | aria-role | handler-owner | tabindex | none
    scope: { landmark: search, dataBlock: SearchBlock }
    locators:
      - { strategy: role-name, value: "textbox|Search Policy", health: 12/12 }
      - { strategy: placeholder, value: "Search Policy", health: 12/12 }
      - { strategy: css, value: "#b3-Input_Search", health: 3/12, note: structural id, fragile }
    status: trusted                    # candidate | trusted | stale | retired
    provenance:
      mintedAt: 2026-09-20T14:02:11Z
      instrument: app.observe
      session: claude-code/…
      model: claude-…
      testCase: 10001
    evidence: .tesseract/evidence/policy-search.jsonl#L14
```

Rules:

- **Provenance at mint.** A facet without provenance cannot be written. The evidence log is append-only; contradictions stack, they do not overwrite.
- **Confidence on read.** Derived from the evidence log and run results, never stored as a hand-edited number. Locator health is a count of successful resolutions over attempts from real runs.
- **Candidate until earned.** An agent-minted facet is `candidate`. It becomes `trusted` when a test that references it is accepted by a human or passes N runs; a human can promote or demote in the pull request. This replaces v1's seven-artifact-type trust policy with one rule a reviewer can hold in their head.
- **Query by phrase.** The index matches intent phrases against display name and aliases with the same scoring the heuristic classifier already uses (token overlap, role compatibility), plus landmark and data-block scope hints. When the host model is present, ranking is a suggestion; the model decides.
- **Two tiers.** App facets live with the app. Platform patterns — how OutSystems Reactive names things, where roleless handler owners hide, how `data-block` scopes a screen — live in Tesseract's `patterns/` grounded in public apps and versioned by variant. A pattern is code plus the public-route fixtures that justify it.
- **Aging and drift.** A locator whose health drops below a floor marks the facet `stale`; the next authoring pass re-observes and proposes an enrichment in the pull request. A run failure classified as `not-found` against a trusted facet raises a drift proposal with the before and after snapshots attached. Nothing patches itself.

### 5.5 The emitted test

The target shape, for the same test case v1 emitted as four opaque facade calls:

```ts
// tests/policy/10001-verify-policy-search-returns-matching-policy.spec.ts
// Generated by Tesseract from ADO 10001 rev 1 — edit intent in ADO or facets in .tesseract/catalog/;
// regions marked tesseract:keep survive regeneration.
import { test, expect } from '@playwright/test';
import { PolicySearchPage } from '../../pages/policy-search.page';

test('ADO 10001 — Verify policy search returns matching policy @smoke @billing @P1', async ({ page }) => {
  test.info().annotations.push(
    { type: 'ado-id', description: '10001' },
    { type: 'ado-revision', description: '1' },
    { type: 'content-hash', description: 'sha256:1930319e…' },
  );
  const policyNumber = 'POL-001'; // ADO parameter policyNumber, data row 1
  const policySearch = new PolicySearchPage(page);

  await test.step('Navigate to Policy Search screen', async () => {
    await policySearch.goto();
    await expect(policySearch.heading).toBeVisible();
  });

  await test.step('Enter policy number in search field', async () => {
    await policySearch.policyNumberInput.fill(policyNumber);
  });

  await test.step('Click Search button', async () => {
    await policySearch.searchButton.click();
  });

  await test.step('Verify search results show policy', async () => {
    await expect(policySearch.resultRow(policyNumber)).toBeVisible();
  });
});
```

```ts
// pages/policy-search.page.ts — generated from .tesseract/catalog/policy-search.yaml
import { type Page, type Locator } from '@playwright/test';

export class PolicySearchPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/PolicySearch');
    await this.page.getByRole('main').waitFor();
  }

  /** facet policy-search:heading — content-named heading, banner landmark */
  get heading(): Locator { return this.page.getByRole('heading', { name: 'Policy Search' }); }

  /** facet policy-search:policy-number-input — placeholder-named textbox in the search landmark */
  get policyNumberInput(): Locator {
    return this.page.getByRole('search').getByRole('textbox', { name: 'Search Policy' });
  }

  /** facet policy-search:search-button — native button, content-named */
  get searchButton(): Locator { return this.page.getByRole('search').getByRole('button', { name: 'Search' }); }

  /** facet policy-search:results-table — row scoped by cell text */
  resultRow(policyNumber: string): Locator {
    return this.page.getByRole('table').getByRole('row', { name: new RegExp(policyNumber) });
  }
}
```

When a test case carries more than one data row, the emitter writes one spec file with one `test()` per row, titled with the row's values, inside a `test.describe` named for the case; each row publishes as an iteration of the same test point with its parameters, which is how Azure DevOps models parameterized cases, and acceptance is recorded per case.

Properties a reviewer can check in a minute: no selectors in the test body; the ADO wording is the step title; the page object is the only place locators live and each carries its facet id and naming rationale; a failing step shows up in the Playwright report under its ADO wording with a trace; nothing imports Tesseract. When the catalog changes, the page object regenerates; when a QA edits a locator by hand, they mark it `tesseract:keep` or move it to `policy-search.page.overrides.ts`, and regeneration honors it.

OutSystems-specific waiting (feedback messages, loading overlays, hydration) goes into a small optional helper package a customer can read in ten minutes, never into hidden runtime behavior.

### 5.6 Execution and reporting

`test.run` is a thin wrapper over the Playwright test runner: it runs the emitted specs with the customer's own config, collects the JSON report and traces, classifies each failed step against the facets it references (not-found against a trusted facet is drift; assertion mismatch on expected text is a candidate real bug; timeout after a navigation is an environment signal), and writes one run receipt per test.

**Monday morning.** When a release goes out and the suite goes red, `test.run` diffs each failing screen's current page fingerprint against the fingerprint its facets last saw, groups the failures by suspect facet, re-observes those screens, and opens one drift pull request per screen: the facets it proposes to enrich, the before-and-after snapshots, and the tests that would go green. The failing `test.step` names the ADO step; the receipt names the strategy that resolved the locator and the evidence it rested on; the fix is accepting the pull request or editing one override. That is the five-minute path, and it is the reason a QA team keeps the tool after the first release. Staleness is announced by the fingerprint diff before anyone opens a trace.

`ado.publish` closes the loop v1 never closed. Results go back to Azure DevOps as a test run: create the run against the plan and suite, add one result per test point with outcome, duration, error message, and a link to the trace. The test case gains the automation association fields so that the plan shows it as automated. A QA lead sees green and red where they already look. Publishing is idempotent per run id and never modifies test case steps.

### 5.7 The needs-human handoff

v1's `InterventionHandoff` shape is kept: unresolved intent, attempted strategies, evidence slice, blockage type, candidates, next moves, reversal policy. What changes is where it lands. A handoff is written into three places the QA lead already sees: a `test.fixme(...)` on the step with a one-line reason and a pointer, a comment on the ADO test case with the structured reason and a screenshot, and the authoring receipt. There is no inbox to poll. When the human resolves it — by clarifying the step in ADO, by adding a facet alias, by supplying test data — the next authoring pass picks it up because the ADO revision or the catalog changed.

Two blockage types get first-class treatment because they dominated the real runs: **ambiguous target** (several plausible controls; the handoff lists them with screenshots) and **observation text mismatch** (the expected text is a paraphrase of what the page shows, as in "verify the count decreases by one" against "0 items left"; the handoff proposes the assertion it would write).

### 5.8 Observation: the harvester as the product's eyes

The reality study's harness is the most valuable code v1 produced in its last month and it lives in the workshop, where the product could not use it. In v2 it is the product's `observe/` component:

- **Hydration detection** — network quiet, DOM mutation quiet, `readyState`, signature stability, re-snapshot; twenty-second budget; disclosed user agent.
- **Accessible-name ladder** — `aria-labelledby`, `aria-label`, `<label for>`, wrapping label, placeholder, content — computed the way accname does, with the naming source recorded, and cross-checked against the browser's own `ariaSnapshot()` so disagreement is measured.
- **Affordance ladder** — native control, explicit ARIA role, handler owner, `tabindex` or platform attribute, own cursor (recorded, never sufficient). Roleless controls are admitted only as handler owners named by their own text.
- **Structure** — landmarks (100% reliable on Reactive), `data-block` and `data-container` scopes, structural ids recognized as fragile, designer ids recognized as locator sources, module ownership from the manifest's version tokens.
- **Variant classification** — runtime globals plus bundle names plus `data-block` density for Reactive; `__OSVSTATE` for Traditional; framework markers corroborating only.
- **PII gate** — only label-classified nodes retain text; email-shaped and number-shaped values are redacted before anything leaves the process or is written to disk.
- **Page fingerprint** — title, final URL, landmarks, role counts, interactive and roleless-interactive counts, placeholder-only inputs, `data-block` count, runtime global. Every receipt carries one, so a held-out failure is self-explaining.

The snapshot handed to the model is the candidates list plus the ARIA snapshot text, scoped by landmark when the step's wording names one, capped in size, with a screenshot on request. This is the thing v1's synthetic substrate could not render and v2 refuses to approximate.

### 5.9 Resolution: from eleven rungs to four steps

v1's ladder had eleven rungs; two of them (semantic dictionary, approved-equivalent overlay) had no producer at all, a third (structured translation) had only a token-overlap adapter, and the two rungs meant to do the judging (live DOM, agent-interpreted) were never exercised against a real application, let alone with a model. v2 resolves a step in four moves, each of which is a tool call the host makes, not a rung the engine walks:

1. **Memory** — `memory.query` on the current screen. A trusted facet with healthy locators resolves the step without observation. This is v1's Level 3 "DOM-less authoring," available from the first revisit rather than deferred to a later level.
2. **Observe and decide** — `app.observe`, scoped by any landmark or row cue in the wording; the host model picks from candidates; the tool verifies the locator resolves to exactly one visible element before anything is written. The heuristic classifier and pattern library run first as a cheap pre-filter and as the fallback when no model is present.
3. **Try** — `app.act` performs the action so the next step sees the real state (narrative execution, the one mechanism that made the cold-start runner work); failures come back in the four families and the model may retry with different evidence, bounded to a small number of attempts.
4. **Handoff** — `handoff.raise`. No further fallthrough. Determinism has not been exhausted; judgment has, and the human is asked with everything they need.

Precedence inside step 2 is the locator ladder — role and name, label, placeholder, text, test id, css — with the reality-study corrections baked in: names computed like accname, landmark scoping first, row scoping by cell text, roleless handler owners by exact text last.

### 5.10 Data on disk

Seven artifact kinds, all in the customer's repository, all reviewable:

| Path | What | Written by | Append-only |
|---|---|---|---|
| `tests/**/<adoId>-<slug>.spec.ts` | emitted tests | `test.emit` | no (rewritten only when the ADO revision changes or on request; keep-markers survive) |
| `pages/<screen>.page.ts` (+ `.overrides.ts`) | page objects | `test.emit` | no (regenerated freely; overrides survive) |
| `.tesseract/snapshots/<snapshotId>.json` | PII-gated observations the receipts cite | `app.observe` | yes, gitignored, pruned by age |
| `.tesseract/catalog/<screen>.yaml` | facets | `memory.mint/enrich`, human edits | no (proposal-gated) |
| `.tesseract/evidence/<screen>.jsonl` | observations and run outcomes per facet | tools | yes |
| `.tesseract/receipts/authoring.jsonl`, `runs.jsonl` | every tool call and every run | tools | yes |
| `.tesseract/handoffs/<adoId>-<step>.json` | open handoffs | `handoff.raise` | yes (resolved by a later record) |

Nothing else. No dozen-directory runtime engine, no graph index, no interface index, no learning manifest, no scoreboard snapshots. If a projection is needed for a report, it is computed from these.

The alternative for the spec file deserves naming, because it is stronger in one respect: emit the spec exactly once, never rewrite it, and land any re-authoring as a diff in a proposals file for the human to apply. That removes the keep-marker parser entirely and makes the spec unambiguously human-owned. v2 does not choose it for one reason: an ADO revision changes step wording, and a spec whose `test.step` titles no longer match the test case it is annotated with is a lie the ADO loop would propagate. So the spec is rewritten on a revision change or on request, always as a pull-request diff, with keep-marked regions preserved; page objects regenerate freely. If the pilot shows that reviewers never edit spec bodies, switch to emit-once.

### 5.11 Hosting

Three ways to run the same thirteen tools:

- **Interactive** — an MCP server the QA lead's agent host connects to (Claude Code, Copilot, Codex, Cursor). The playbook ships as a skill. This is the mode for the first tests on a new app, for handoffs, and for review.
- **Batch** — a driver that loops a pinned model over a suite with the same tools; it is the descendant of `public-aut-runner.ts`, and the only place Tesseract itself calls a model. It runs nightly or per release to author new test cases and to re-author changed ones. The loop, per test case: the model's context holds the playbook, the test case, the current step, the most recent snapshot (scoped, capped as §5.2 says), the facets `memory.query` returned, and a one-line summary of each earlier step's outcome — never the full history of snapshots. Each step has a retry budget of three tool-call rounds; each test case has a token budget and a wall-clock budget, and exhausting either raises a handoff on the current step rather than failing silently. A `context-exceeded` error from the host drops the oldest step summaries first, then the ARIA text, then raises a handoff. A failed test case is re-authored from scratch on the next run, not resumed, because the page may have changed. The driver commits the emitted files to a branch and opens the pull request itself, with the authoring receipts attached; there is no other host in this mode.
- **CLI** — every tool callable from the shell for scripting and debugging, and `tesseract run`/`tesseract publish` for CI.

The host owns the model, the prompt loop, the context window, and the safety policy. Tesseract owns the tools, the memory, the emission, and the receipts. Provider polymorphism is free because it is the host's problem.

### 5.12 Security and data

An environment profile is a small file the customer owns: `.tesseract/profiles/<name>.json` holding `{ name, baseURL, storageStatePath, tenant, dataSet }`, selected with `--profile` or `TESSERACT_PROFILE`, and projected into the customer's `playwright.config.ts` by a generated snippet the README shows (that is where the page objects' relative `goto('/PolicySearch')` gets its base URL). Credentials for ADO and the application come from environment or the host's secret store and never enter receipts. Snapshots passed to a model are PII-gated and size-capped; a customer that cannot send page content to a hosted model runs the batch driver against an in-tenant model, which the host abstraction allows. Test data is declared, not scraped: ADO parameters and data rows are the source, environment profiles name the QA tenant, and a step that needs data the suite does not declare raises a handoff rather than inventing a value. Storage states for authenticated sessions are per-profile files the customer owns.

## 6. v2 — measurement

v1's workshop was twenty-eight thousand lines answering the question "is the product improving?" with probes, rungs, visitors, hypotheses, receipts, ratchets, trajectories, graduation gates, convergence machines, and theorem groups. It answered the question twice, on 2026-04-23 and 2026-04-24, with "yes." Five months later the first real page said no. v2's evaluation harness is small because the question is small: does a QA lead accept the tests, do they keep passing, and what did they cost.

### 6.1 Three numbers

| Number | Definition | Denominator | Where it comes from |
|---|---|---|---|
| **Acceptance** | fraction of emitted tests a human accepts into the suite as written or with a small edit (≤ 5 changed lines; a locator edit that lands in the overrides file counts as accepted-with-edit, because that is the edit §4.2 designs for) | tests emitted for a cohort | `review.record` receipts, written by the reviewer from the pull request |
| **Survival** | fraction of accepted tests still passing without edits after N runs and one application release; flake rate as a companion | accepted tests | run receipts over time, joined on ADO id |
| **Cost** | wall-clock minutes and model tokens per accepted test; reported separately for first visit to a screen and for revisits | accepted tests | authoring receipts (tool durations, host-reported tokens) |

Diagnostics underneath, reported but never optimized directly: handoff rate per step, handoff reasons by type, locator-edit rate among accepted tests (the signal that resolution is weak), assertion substance (the share of steps whose assertion checks a value or a row rather than mere visibility), facet reuse rate on revisits, locator strategy distribution, naming-source distribution on real screens, drift proposals per release.

Who accepts matters. The clean-room rules below restrict who may *evaluate a held-out route*; they do not forbid the owner from reviewing tests. In week one the accepting human may be the owner. From M1 onward the headline acceptance number comes from a reviewer who did not build v2 — the pilot's QA lead, or a contracted QA engineer if no pilot exists yet — and the owner's own acceptances are recorded under their name and reported separately.

The cost trend on revisited screens is v1's "memory worthiness" (M5) said plainly. The acceptance trend across revisions is v1's "intervention marginal value" (C6) said plainly. Neither needs a visitor tree.

### 6.2 Held-out real applications

The clean-room rules the cold-start spike wrote down in May are correct and survive as a one-page checklist in `eval/README.md`:

1. Declare the partition before contact. A cohort manifest names each application and each route as `training` or `held-out`.
2. Promotion is one-way and recorded. Held-out becomes training when a failure on it drives a code change. It never goes back.
3. The evaluator is not the improver. A held-out run is executed by a fresh session that cannot modify code, and its receipt is relayed verbatim.
4. A spent route is spent for that page version. The page fingerprint and version token are recorded; a new version re-opens the route.
5. Retract when contaminated. If a number was produced under a violated rule, the number is withdrawn in the same document that reported it.
6. Held-out fixtures are authored blind. The test cases for a held-out route are written by a human from screenshots, without reading the catalog, so that the evaluation measures resolution and not familiarity. (This is the reality study's C5, declared and never yet run.)
7. A leak names its replacement. If a held-out route is touched outside an evaluation, the leak is logged, the route is demoted to training, and a replacement held-out route is named in the same commit. (The reality study's C6.)

Cohorts at the start of v2: the thirteen untouched routes of the OutSystems UI website; further public OutSystems Reactive applications as they are found (the source survey's legal envelope applies — disclosed user agent, robots respected, PII gated, snapshots not committed); and, from the first pilot onward, the customer's own screens that the agent has not seen, chosen by the QA lead.

### 6.3 Incident to fixture

Every real failure that drives a code change becomes a fixture: a rendered synthetic page that exhibits the exact shape (a placeholder-only search input inside a `data-block`; a roleless `<th class="sortable">` that owns a click handler; a checkbox in a row whose only handle is the row's cell text) plus the ADO-shaped step that failed against it. The fixture renderer is the one piece of the synthetic app that survives. The regression suite runs in CI in a real browser and proves incidents stay fixed. It also runs against recorded HTTP archives of real public routes, replayed through Playwright's HAR routing, so that CI sees real DOM without network flake.

This inverts v1's relationship between synthetic and real. Synthetic fixtures are downstream of reality, never upstream of graduation.

### 6.4 What is deliberately not measured

- Coverage of a manifest by probes. The tool surface is small and fixed; its correctness is a unit-test matter.
- Hypothesis confirmation rate as a north-star. The habit survives — a pull request states the expected effect on the three numbers and the follow-up records the actual — but it is a review-template line, not a metric verb.
- Convergence of a self-improvement loop. There is no loop that changes code without a human reviewing a pull request.
- Theorem-group coverage, proof obligations, kernel and posture separability, memory-worthiness, surface-compressibility. These were narrative framings in v1 and remain available as narrative. None ships as a number.
- Anything the product's own authors can make green without a real application or a real reviewer.

## 7. What v2 keeps, transforms, and leaves — the ledger

Three dispositions. **Lift** means copy the file and its tests into the new package as they are, with history noted. **Transform** means the idea and usually some code survive, reshaped as §5 describes. **Leave** means it stays on the archive branch. Line counts are TypeScript lines from the ingestion reports unless a row says otherwise; the tables name where the weight is and are not a partition of every file, so each folder ends with a catch-all row for what is not enumerated.

### 7.1 `product/`

| v1 module | Lines (approx.) | Disposition | Note |
|---|---|---|---|
| `instruments/intent/live-ado-source.ts` | 270 | **Lift + extend** | WIQL and work-item fetch stay; add shared steps, plan/suite membership via the Test Plans API, and the publish path (`ado/`). |
| `instruments/observation/aria.ts` (35) + `domain/knowledge/aria-snapshot.ts` (144) + `instruments/observation/state-topology.ts` (506) | 685 | **Transform** | Snapshot normalisation and the tree walk survive; the deprecated `page.accessibility.snapshot()` call is replaced by `locator.ariaSnapshot()` per §5.8; state-topology observation is deferred until a pilot asks for it. |
| `instruments/codegen/spec-codegen.ts` | 412 | **Transform** | AST emission stays; the target becomes the §5.5 spec and page object; the `renderScreenFacadeModule` idea becomes the page object; the `scenario.executeX` emission goes. |
| `instruments/tooling/playwright-bridge.ts`, `browser-options.ts`, `discover-screen.ts` | ~600 | **Lift** | Browser launch, channel and headless resolution, the discovery walk (already resolves names via label, placeholder, content, and admits roleless handler owners). |
| `runtime/widgets/interact.ts`, `domain/widgets/role-affordances.ts` | ~800 | **Lift** | Action dispatch with precondition checks and the five error families; the role-affordance table. |
| `runtime/adapters/navigation-strategy.ts` | ~200 | **Lift** | Route classification and `page.url()` idempotence. |
| `runtime/resolve/` locator ladder (`locate.ts` lineage) | ~400 | **Lift + reorder** | Role-name, label, placeholder, text, test id, css; add the OutSystems id-suffix strategy and `os-test-id` support. |
| `domain/resolution/patterns/` (kernel, 8 patterns, registry, `intent-classifier.ts`) | ~2,000 | **Transform** | The classifier becomes the no-model fallback and candidate pre-filter; the patterns become `patterns/` versioned by variant; `SurfaceIndex` becomes the snapshot index. |
| `domain/resolution/precedence*.ts`, `runtime/resolution/` (stages, lattice, exhaustion, accumulator) | ~1,500 | **Leave** | The eleven-rung ladder is replaced by the four moves. The exhaustion trail idea survives inside the handoff's `attempted` list. |
| `domain/handshake/intervention.ts` | ~300 | **Lift** | The handoff shape, verbatim. |
| `domain/memory/facet-record.ts`, `kind-extensions.ts` | 64 + | **Lift as the schema** | Becomes the catalog record; the store, index, evidence log, health, and gating are new code (§5.4). |
| `domain/kernel/hash.ts` (stableStringify, sha256, `Fingerprint<Tag>`) | ~250 | **Lift, shrink the registry** | Keep content addressing and the branded tag; the registry drops from 42 tags to the handful v2 has artifacts for (screen, facet, evidence, receipt, run, test case, snapshot). |
| `domain/kernel/errors.ts`, `domain/algebra/closed-union.ts` | ~300 | **Lift** | Error hierarchy simplified to the families v2 names; `closedUnion` and exhaustive folds stay as the cheapest real safety. |
| `domain/governance/` (workflow types, phantom Stage/Source/Verdict, `foldGovernance`, mint functions) | ~1,500 | **Transform** | `Verdict` and `Source` survive as plain discriminated unions with folds; the phantom `Stage` axis and the envelope header ceremony go; `WorkflowEnvelope` is not carried. |
| `domain/algebra/` (monoid, lattice, Galois, hylomorphism, free-forgetful, product-fold, partial-iso, quotient, ladder, slice, contextual-merge, scoring, keyed-set, envelope-mergers) | ~1,500 | **Leave** (except `closed-union`, `monoid` where used) | Vocabulary, not leverage, for the job at hand. |
| `domain/logs/log-registry.ts` and the append-only adapter | ~400 | **Transform** | The discipline stays (registered logs, writer, idempotency key); the set shrinks from ten logs to the evidence log, the receipts, and the handoffs. |
| `reasoning/reasoning.ts`, `adapters/*` | ~2,300 | **Transform** | The receipt shape (provider, model, tokens, latency, prompt fingerprint) moves into every tool receipt. The port and its adapters go: the host owns the model. The deterministic translation adapter's scoring survives inside `memory.query`. |
| `application/policy/trust-policy.ts` + `.tesseract/policy/trust-policy.yaml` | ~500 | **Transform** | Seven artifact types with 0.90–0.98 thresholds become one rule: candidate until a human accepts a test that uses it. |
| `application/intent/parse.ts`, normalization | ~800 | **Lift** | Step normalization and parameter binding. |
| `application/observation/interface-intelligence.ts`, `domain/graph/derived-graph.ts`, interface index, selector canon, state graph | ~3,800 | **Leave** | Replaced by the catalog index and the page fingerprint. The state-topology idea (states, transitions, preconditions) is deferred until a pilot asks for it. |
| `application/knowledge/` (activate proposals, hints writer), `application/canon/`, `application/catalog/`, `instruments/catalog/` | ~2,500 | **Leave** | Replaced by `memory/` with the candidate/trusted rule. |
| `domain/knowledge/semantic-dictionary.ts`, `reasoning/translation-cache.ts`, overlays | ~900 | **Leave** | The catalog's alias index replaces the dictionary; there is no cache of model translations because tests are emitted once. |
| `application/pipeline/`, `application/commitment/` (compile, run, emit stages), `composition/scenario-context.ts`, `composition/local-services.ts` | ~4,000 | **Leave** | The staged pipeline and the runtime facade are the shape v2 inverts. |
| `application/drift/` (eight analyzers) | ~1,200 | **Transform** | Drift classification of run failures against facets survives as a function in `run/`; the regression vectors reduce to not-found, changed-name, changed-role, timeout. |
| `application/projections/`, `domain/projection/` (scene state, flywheel acts, summary view) | ~2,500 | **Leave** | Dashboard read models. |
| `application/agency/`, `domain/agency/`, `domain/commitment/`, `domain/aggregates/`, `domain/attention/`, `domain/synthesis/`, `domain/learning/`, `application/learning/`, `application/improvement/`, `domain/improvement/`, `domain/proposal/` (clusters, particle physics, glass pane) | ~8,000 | **Leave** | Measurement and workbench machinery. The proposal *kinds* (hypothesis, revision, candidate) survive as a review-template line and as the facet status. |
| `manifest/declarations.ts`, `build/emitter/` drift check | ~600 | **Transform** | Nine verbs become thirteen tools; the declaration shape (name, inputs, outputs, error families, since) survives as the MCP tool schema; the drift check survives as "the tool list in the playbook equals the tool list in code." |
| `cli/` (23 commands) | ~1,100 | **Transform** | About eight commands: `fetch`, `author`, `run`, `publish`, `catalog`, `eval`, `harvest`, `serve` (MCP). |
| `tests/architecture/` seam law, governance law, log-registry law | ~700 | **Transform** | The seam becomes TypeScript project references; the governance law survives as "no string comparison on status outside a fold"; the log law survives for the three logs. |
| everything in `product/` not enumerated above: schemas and validators (~4k), execution and interpretation types, widgets beyond the affordance table, runtime support (browser pool, concurrency), paths, reporting, build, `product/tests/` fluency and manifest harnesses | ~40k | **Leave** | Types and plumbing for the shape v2 inverts. Anything a lifted module imports comes with it, minimally. |

### 7.2 `workshop/`

| v1 module | Lines (approx.) | Disposition | Note |
|---|---|---|---|
| `substrate-study/` (dom-walk-capture, snapshot-record, hydration-detector, variant-classifier, aria-snapshot, block-ownership, view-bundle, study-partition, external-snapshot-harness, snapshot store) | ~3,000 | **Lift into `observe/`** | This is the product's eyes; it was built in the workshop because the product had no place for it. The partition guard becomes part of `eval/`. |
| `customer-backlog/application/public-aut-runner.ts`, `page-fingerprint.ts`, `intent-helpers.ts`, cohort loader, `cohort.json`, the public-AUT fixtures | ~1,500 | **Transform** | The runner's loop (classify, open, probe, act, verify expected target, receipt) is the batch driver's skeleton with the model in the decide step; the cohort manifest and clean-room rules move to `eval/`. |
| `customer-backlog/fixtures/` (8 resolvable, 14 needs-human fabricated ADO cases) | ~1,400 data lines (JSON, not code) | **Leave** | Fabricated cases against synthetic presets. Real ADO cases replace them. |
| `synthetic-app/` (server, `SubstrateRenderer`, `SurfaceRenderer`, `EntropyWrapper`) and `substrate/` (`SurfaceSpec`, `WorldShape`, `EntropyProfile`, topologies) | ~2,500 | **Transform** | Survives only as the fixture renderer for incident-to-fixture regression (§6.3). The axes that mirror real shapes (naming, placeholder, clickable, `reactive-block` chrome) are the reason it is worth keeping. |
| `probe-derivation/` (probe IR, derive, classifiers, three rung harnesses, parity, coverage) | ~3,200 | **Leave** | The probe IR is retired with the manifest-as-measurement idea. The `probe-target` grammar (`{role,name}`, `{placeholder}`, `{text}`, `inRow`) survives in the locator ladder. |
| `scenarios/` (corpus, harnesses, loader) and `synthesis/` (deprecated generators) | ~3,700 | **Leave** | |
| `compounding/` (hypotheses, receipts, trajectories, ratchets, graduation, scoreboard, snapshot store) | ~3,300 | **Leave** | The habit of predicting an effect before a change survives as a pull-request template line. |
| `orchestration/` (speedrun, dogfood, benchmark, fitness, convergence) and `convergence/` | ~7,400 | **Leave** | |
| `metrics/` (seven visitors, scorecard, Pareto), `measurement/` | ~3,400 | **Leave** | Replaced by the three numbers. |
| `observations/*.md` (verdict memos, handoffs, held-out memo) | — | **Archive** | Historical record; the held-out memo's protocol section is quoted in `eval/README.md`. |
| `cli/` (14 commands) | ~1,000 | **Leave** | |

### 7.3 `dashboard/`

| v1 module | Lines (approx.) | Disposition | Note |
|---|---|---|---|
| `mcp/dashboard-mcp-server.ts` and MCP tooling | ~2,400 | **Transform** | The server framework survives; the tool set becomes the thirteen in §5.2; the pending-decision closure, suggested-action scoring, and speedrun control go. |
| `bridges/` (file decision bridge, event bus, journal writer, WS adapter) | ~1,400 | **Leave** | No inbox, no live decision loop; handoffs land in ADO and the spec. |
| `server/`, `src/` (React, three.js scene, playback, bookmarks, narration, spatial overlays) | ~14,300 | **Leave** | Replaced by the authoring receipt page and the pull request. |

The top-level `extension/` folder (522 lines: a VS Code task provider, diagnostics, and a chat participant, with the task provider itself at `product/instruments/vscode/task-provider.ts`) is **deferred**: revisit after the pilot if the host is VS Code; the chat participant is subsumed by the MCP server.

### 7.4 Tests, docs, scripts, configuration

| Area | Disposition | Note |
|---|---|---|
| ~73k lines of tests | **Leave, then re-derive** | Tests that pin lifted code come with it (ADO XML parsing, locator ladder determinism, accname agreement, affordance ranking, codegen idempotence, handoff shape, catalog round trips, PII gate). Laws about phantom axes, algebra, visitors, compounding, projections, and the dashboard stay on the archive branch. Add what v1 never had: a real-browser fixture suite, HAR-replay tests of real routes, one end-to-end fluency check. |
| `docs/` (90 files) | **Archive wholesale** | `docs/archive/v1/`. Five documents replace them (§8.6). The reality study and the cold-start journal are the two v1 documents worth reading in full; `eval/README.md` links them. |
| `scripts/` (27) | **Transform** | Keep `harvest-external-snapshot.ts` and `substrate-reality-stats.ts` as `tesseract harvest`; keep `build.cjs`, `check.cjs`, `lint.cjs`, `typecheck.cjs` in spirit with the strict flags on; leave speedrun, evolve, experiments, graduate, sensitivity, convergence-proof, generate-synthetic, mcp-call, migrate-*. |
| `.tesseract/` (12 directories at checkout, 14 after one compile and typecheck) | **Leave** | Replaced by `.tesseract/catalog`, `evidence`, `receipts`, `handoffs` in the customer's repository. |
| `dogfood/` | **Leave** | The 10001 demo, its fixtures, runbooks, and generated output. A real ADO-shaped fixture set (with shared steps and parameters) replaces it under `eval/`. |
| `tsconfig.build.json` relaxations, `vitest` shim of `@playwright/test`, three Playwright configs pointing at a deleted server | **Leave** | v2 has one strict `tsconfig`, project references for the seam, and Playwright configs that point at things that exist. |
| `.github/instructions/*`, `AGENTS.md`/`CLAUDE.md`/`CODEX.md` symlinks | **Rewrite** | One CLAUDE.md under 200 lines; per-folder instructions only where a folder has a rule the root does not. |

### 7.5 The weight, summarized

| | Lift | Transform | Leave |
|---|---|---|---|
| `product/` (79k) | ≈ 3.5k | ≈ 6k (of which ≈ 2.5k survives as code) | ≈ 70k |
| `workshop/` (28k) | ≈ 3k | ≈ 4k (≈ 1.5k survives) | ≈ 21k |
| `dashboard/` (18k) | 0 | ≈ 2.4k (≈ 0.8k survives) | ≈ 15.6k |

Roughly eleven thousand lines of v1 code survive into a 20–25k-line v2 — about six and a half thousand lifted unchanged and about five thousand reshaped; the rest of v2 is new and small: the catalog store, the emitter's new target, the publish path, the batch driver, the eval harness, the report. The work is mostly deletion, and the deletion is what makes the rest legible.

## 8. Sizing and the ninety-day build

### 8.1 The rule that governs the build

Every pull request lands with a receipt from a real application or a HAR replay of one. Not a synthetic probe, not a law test alone. This one rule is the difference between v2 and v1; the rest of this section is its consequences.

The acceptance ladder, stated once: week one, at least one test accepted; the abort threshold in §9, below 50% at ten test cases; M1, at least 70% at ten cases across three or more screens; M2, at least 70% held at fifty cases with survival measured. No pilot customer is assumed by this document. If none is committed by week eight, M3 substitutes a public OutSystems application with a hand-authored ADO suite, and the QA-lead verdict comes from a contracted reviewer who did not build v2.

### 8.2 Week one: the vertical slice

Day one: branch `v2`; a `v2/` directory beside `product/` with its own `tsconfig` and a workspace entry in `package.json`; the old gates keep running unchanged on the old tree; the first commit is `v2/observe/` lifted from `workshop/substrate-study/` with its tests, and the first command is `npx tsx v2/cli.ts harvest <url>` printing a snapshot with a `snapshotId`.

Goal for the week: one real OutSystems Reactive screen, one ADO-shaped test case with real steps XML, a host agent with the thirteen tools (most stubbed), one emitted spec and page object of the §5.5 shape, passing under `npx playwright test` with Tesseract absent from the runtime path, read and accepted by a human, with an authoring receipt.

The application is the OutSystems UI website's Productcatalog route (a study route, already harvested, already known) or a customer DEV environment if one is available. Productcatalog is deliberately the easy route — it is the one study route with no roleless controls on first harvest — because the point of week one is the artifact shape and the loop, not resolution difficulty; the roleless and placeholder shapes are M1's problem, on Employeesdirectory and Requestmanagement. The test case is authored from a screenshot in the ADO steps format, including a parameter. The tools that must be real in week one: `app.open` with one storage-state profile against one authenticated environment (or the public route, which needs none), `app.observe` (the reality-study walker, lifted), `app.act`, `test.emit`, `test.run`, `review.record`. The tools that may be stubs: `ado.fetch` (fixture-backed), `ado.publish` (log-only), `memory.*` (in-memory), `handoff.raise` (file-only). The accepting human in week one is the owner; that is allowed, and it is recorded as such.

Exit: the spec in §5.5 exists for a real page, a human has accepted it, and the receipt names every decision. Nothing else counts.

### 8.3 Milestones

| Milestone | Weeks | Ships | Exit criterion (all measured on real applications) |
|---|---|---|---|
| **M1 — the toolbox is real** | 2–4 | all thirteen tools real; catalog on disk with provenance and evidence; ADO fetch against a live project; ADO publish creating a test run; the playbook; the CLI; HAR recording of the study routes | ten test cases authored on ≥3 screens; acceptance ≥ 70% on first emission; every test runs with the engine absent; results visible on an ADO test plan |
| **M2 — memory earns its keep** | 5–8 | batch driver with budgets; facet reuse on revisits; regeneration with keep-markers and overrides; handoff to ADO comment + `test.fixme`; incident-to-fixture regression suite in CI; the three-number report | fifty test cases; revisit cost ≤ 50% of first-visit cost on the same screen; survival ≥ 90% over ten runs; held-out cohort (five untouched routes) authored blind by a fresh session with acceptance reported and no retractions needed |
| **M3 — drift and the pilot** | 9–12 | drift classification on run failures with proposals as pull requests (the Monday-morning path in §5.6); OutSystems-generic pattern library grounded in ≥ 3 public apps and versioned by variant; multiple environment profiles and the single-sign-on and multi-factor edge cases of authentication; test-data declaration; the pilot on a customer backlog under the QA lead's review | first customer pilot: ≥ 25 accepted tests on their app; one release crossed with survival reported; a QA lead's written verdict on legibility; all docs ≤ 3,000 lines total |

Beyond M3, the roadmap is the pilot's handoffs, ranked by frequency. That is the only backlog.

### 8.4 What gets deleted, and when

The deletion is a single, early move, not a slow demotion. In week one the new package is created beside the old tree; in week four, when M1's exit is met, the old `product/`, `workshop/`, and `dashboard/` trees are moved to an archive branch with a tag, the documents under `docs/` are moved to `docs/archive/v1/` wholesale, and the repository root holds the new package and five documents (§8.6). Anything from v1 that v2 needs is lifted by copying the file and its tests into the new package with its history noted, which §7 enumerates. There is no migration scaffolding, no compatibility layer, no grandfather list.

### 8.5 Process rules for a codebase mostly written by agents

Eighty percent of v1's commits were authored by an agent, and the plans that outran the code were agent-authored too. v2 will be built the same way, so the rules are aimed at that failure mode, not at people:

1. **Plan equals pull request.** A plan is the description of the pull request that implements it. A design document longer than 300 lines does not merge without the code it describes.
2. **Reality budget.** Every pull request carries a receipt from a real application or a HAR replay. A pull request that only adds laws, types, or docs is a documentation change and says so.
3. **One CLAUDE.md, under 200 lines.** It names the thirteen tools, the seven artifacts, the three numbers, the clean-room checklist, and the playbook. It never describes a plan.
4. **No new vocabulary without a glossary line.** The glossary is capped at forty terms. A new term retires an old one or is not introduced.
5. **The gate is green.** Build, typecheck, lint, unit tests, the fixture suite in a real browser, and the fluency check on a pinned model. A red gate blocks merge; there is no "authoritative gate" that has been red for six months.
6. **Held-out runs are run by someone else.** A session that changed code in the last cycle does not evaluate held-out routes.
7. **Numbers are retracted in place.** When a measurement is found contaminated, the document that reported it says so at the line where it was reported.
8. **No graduation without a human.** No verdict, milestone, or "done" is declared on synthetic evidence alone.

### 8.6 The five documents

`README.md` (what it is and how to run it, ≤ 300 lines), `PLAYBOOK.md` (what the agent reads, ≤ 200), `CLAUDE.md` (≤ 200), `docs/design.md` (§5 of this document, kept current, ≤ 800), `eval/README.md` (§6, ≤ 200). This vision document moves to `docs/archive/` the day `docs/design.md` supersedes it.

### 8.7 Sizing

| Area | v1 today | v2 target |
|---|---|---|
| product code (excluding tests) | 79,391 lines across `product/`; plus 28,420 `workshop/`; plus 18,143 `dashboard/` | 20–25k in one package |
| tests | ~73k lines, 4,161 unit tests, none in a real browser | ~15k lines; law tests where they earn it; a real-browser fixture suite; HAR-replay suite; one fluency check |
| active documents | 24,687 lines of v2 planning plus 15,682 v1-reference plus 8,456 archive | ≤ 3,000 lines across five documents |
| CLI commands | 37 | about 8 |
| MCP tools | about 36 (27 hand-curated plus 9 manifest-derived) | 13 |
| terms of art | well over a hundred, with at least seven collisions | ≤ 40 |
| directories under the runtime state root | 12 at checkout, 14 after one compile and typecheck | 4 |
| resolution rungs | 11 | 4 moves |
| measurement machinery | 7 visitors, 20 proof obligations, 10 theorem groups, compounding engine, convergence FSM, scoreboard, Pareto frontier | 3 numbers and a diagnostics table |

## 9. Risks and open questions

Stated plainly, with what it would cost to find out.

**The model may not be good enough at the judgment step.** v1 avoided this question for six months. The evidence that a model with an accessibility snapshot resolves ambiguous steps well is general, not specific to OutSystems and ADO prose. Cost to find out: week one. If acceptance on the first ten test cases is below 50%, the playbook and the snapshot shape are the first suspects, then the model, then the premise.

**Authoring cost is an estimate until measured.** A four-step test case is on the order of ten to fifteen tool calls; a landmark-scoped snapshot is a few thousand tokens; so a first-visit authoring pass is plausibly in the tens of thousands of tokens, and a revisit that hits memory is a fraction of that. That is cents to a dollar per test at 2026 prices, which is far below an hour of an SDET's time, but it is a guess. The receipts make it a measurement by the end of week one; the batch driver's per-test budget makes it a bound.

**The market is a wedge, not the whole product.** OutSystems shops with a large ADO test-plan backlog and an automation budget are a narrow intersection, and generic "AI writes Playwright" is free. What is defensible is the combination: the backlog as intent source, results back on the test plan, platform-aware resolution, a provenance-carrying memory with overrides that survive. OutSystems Reactive is where that combination is provable first, because the platform's DOM defeats generic locators in measurable ways. The v1 vision document's long arc — recognizing a runtime family and pre-loading the platform's 80% — is the generalization path, and it becomes credible only after one platform has been done end to end for one customer.

**Authoring is non-deterministic.** Two sessions may emit different but equally valid tests. v2 accepts this and makes the emitted test deterministic instead. The receipt records the choice. Regeneration on an unchanged catalog and unchanged intent must be idempotent — a law test — so that a pull request diff means something changed.

**Test data and environment state dominate real suites.** Many enterprise test cases assume a logged-in role, seeded records, or a prior workflow state. v1's demo hid this behind a `demoSession` fixture. v2 declares data from ADO parameters and environment profiles and raises a handoff when a step needs state the suite does not declare. Whether QA teams will accept declaring data up front, or expect the agent to create it, is an open question the pilot answers. The likely outcome is a small "setup steps" convention in ADO or a data module per suite.

**Authentication.** Every real OutSystems app requires it. Storage-state profiles are the standard answer; single sign-on and multi-factor flows are the exception that needs a human once per environment. This is a week-one prerequisite, not a later feature.

**OutSystems variants and versions.** O11 Reactive, O11 Traditional Web, and ODC differ in DOM and runtime markers. The variant classifier and the pattern library must be versioned by variant; the pattern library starts Reactive-only, as the last month decided, and says so.

**Page content sent to a hosted model.** Some customers will forbid it. The host abstraction lets the batch driver run against an in-tenant model, and the PII gate applies regardless. This must be stated in the README before the first pilot conversation.

**The temptation to rebuild the cathedral.** The people and agents who wrote v1 will write v2. The process rules in §8.5 exist for this reason and are worth less than the habit of asking, before each pull request, which real screen it was tested on.

**Host dependence.** If the customer's agent host changes its tool protocol or model, authoring quality shifts. The batch driver pins a model and the receipts record it, so the shift is visible; the emitted tests are unaffected.

**The 13 held-out routes are finite.** M2 spends five of them, leaving eight for M3 and the pilot; M3 also wants three public applications and there is one. Public OutSystems Reactive applications are rare and legally delicate to harvest. The named replenishment action — a free OutSystems personal environment with a published Forge sample application, which the discovery handoff calls "the operator's" — has an owner (Danny) and no date, and it is the only path to a second independently-owned Reactive application. The customer's own unseen screens are the durable held-out; the pilot must reserve some.

**Three harness questions the reality study left open and v2 inherits.** How deep to recurse into shadow DOM; how to fingerprint high-cardinality `data-*` attributes without the fingerprint changing on every render; and whether the accessible-name computation should come from the browser's `ariaSnapshot()` alone, from the DOM walk alone, or from both with disagreement recorded (v2 says both, and the disagreement rate is a diagnostic).

**Result publishing to ADO touches a system of record.** Creating test runs and results is safe; the association fields on the test case are a write to a work item and should be an explicit, opt-in flag.

**Open questions the pilot answers, not this document:** the right size of a facet's alias set before it becomes noise; whether page objects per screen or per feature match the customer's house style; how many handoffs per hundred steps a QA lead tolerates before the tool feels like work; whether the batch driver should author only, or also propose repairs for failing tests on the same run; the license and packaging of the optional OutSystems helper package.

## 10. Appendices

### Appendix A — Evidence index

Everything below was observed in this session on 2026-09-18 at commit `9714891` unless a date says otherwise.

**Commands run and their results.**

| Command | Result |
|---|---|
| `npm run build` (session start hook) | ok; "manifest drift-check: no drift" |
| `npm run test:unit` | 326 files passed, 1 skipped; 4,161 tests passed, 10 skipped; 64 s |
| `npm run lint` | 298 errors, 0 warnings; exit 1 (151 `no-unused-vars`, 72 `no-restricted-syntax`, 46 `consistent-type-imports`, 19 `no-restricted-imports`, 3 `switch-exhaustiveness-check`, 1 `no-misused-promises`); the checked-in `lint-output-full.txt` from 2026-03-29 shows 415 |
| `node dist/bin/tesseract.js compile --ado-id 10001` | wrote `dogfood/generated/demo/policy-search/10001.spec.ts`, `.review.md`, `.trace.json`, `.proposals.json`, `.tesseract/bound/10001.json`, `.tesseract/tasks/10001.resolution.json`, graph and interface indexes |
| `git log` authorship | Claude 398, Daniel Dyer 85, copilot-swe-agent 10, Danny 4 (497 total, 2026-03-29 → 2026-09-17); merged branch prefixes: claude 28, codex 24, copilot 2 |
| line counts (`.ts`/`.tsx`, excluding tests) | product 79,391; workshop 28,420; dashboard 18,143 |
| docs | 90 Markdown files, 59,330 lines; `docs/v2-*.md` 24,687; `docs/v1-reference/` 15,682; `docs/archive/` 8,456 |
| `grep TODO\|FIXME\|HACK` in code | 0 |

**Files quoted or relied on.**

- `product/manifest/manifest.json` — 9 verbs (`facet-enrich`, `facet-mint`, `facet-query`, `intent-fetch`, `interact`, `locator-health-track`, `navigate`, `observe`, `test-compose`).
- `product/manifest/declarations.ts` — facet verbs "Declared with FROZEN signatures; implementations land at Step 7".
- `product/composition/scenario-context.ts` — `createScenarioContext` loads the run plan from `<cwd>/dogfood`, defaults `TESSERACT_INTERPRETER_MODE` to `'dry-run'`, and each generated method calls `runScenarioHandshake`.
- `dogfood/generated/demo/policy-search/10001.spec.ts` — the emitted spec (reproduced in §2.3); its fixture import is built at `product/application/commitment/emit.ts:143,271` from `path.join(rootDir, 'fixtures', 'index.ts')`, a path that does not exist.
- `product/application/pipeline/lookup-chain-impl.ts:6-9` — "Slots 1, 4, and 5 are stub paths that record their slot in `slotsConsulted`."
- `dogfood/generated/demo/policy-search/10001.review.md` — "Knowledge hit rate: 0", "Step provenance: … unresolved=4".
- `product/reasoning/reasoning.ts` — adapter priority "VSCode GitHub Copilot … Azure AI Foundry … Direct Anthropic"; `synthesize` "no production caller yet".
- `product/reasoning/adapters/agent-backends.ts` — `disabled`, `heuristic`, `llm-api` (Azure OpenAI, vision), `session` adapters.
- `product/composition/local-services.ts` — default composition selects deterministic and heuristic adapters.
- `product/instruments/intent/live-ado-source.ts` — WIQL POST and work-item GET only; parses `Microsoft.VSTS.TCM.Steps`, `.Parameters`, `.LocalDataSource`; no test-run publishing anywhere in `product/`, `workshop/`, or `dashboard/` (`grep _apis/` → 2 hits, both reads).
- `product/tests/architecture/seam-enforcement.laws.spec.ts` — 21 `ALWAYS_ALLOWED_PRODUCT_PATHS`; `RULE_1_GRANDFATHERED` 16 workshop files; `RULE_2_GRANDFATHERED` 4 dashboard files; `RULE_3` empty. Workshop imports 80 distinct `product/` paths, about 60 outside the allowlist, all covered by grandfathering. Dashboard imports `workshop/compounding`, `workshop/orchestration/speedrun`, `workshop/synthetic-app/server`.
- `.tesseract/policy/trust-policy.yaml` — seven artifact types, minimum confidence 0.90–0.98, one `assertion-run` evidence each.
- `workshop/customer-backlog/application/public-aut-runner.ts` — 835 lines; header: "This is not the full compile pipeline; it skips parse/bind and the 11-rung resolution ladder."
- `workshop/customer-backlog/public-aut/cohort.json` — TodoMVC (training), httpbin form (promoted from held-out 2026-05-02, contamination acknowledged), outsystems.com (held-out, evaluated 2026-09-04).
- `workshop/observations/held-out-evaluation-outsystems-com.md` — 0 of 3 DOM-targeting steps resolved; name over-capture ("English language"); receipt "records no page title, final URL, or DOM snapshot".
- `docs/v2-cold-start-todomvc-journal.md` Entry 35 — "We have a system that takes a written test case in normal English and runs it in a real browser, no Playwright code required … 15 of 18 … 7 verified … 1 silently did the wrong thing"; "78% training, 89% held-out … retracted".
- `docs/v2-substrate-reality-study.md` — §0 verdict; F1–F6; A1 "had **never once executed**"; §9.1 "**false**"; §10 held-out route spent, thirteen remain.
- `docs/v2-direction.md` §6 — Steps 0–4c "LANDED", Step 5 "NEXT", Step 6 (ship to customer) and Steps 7–10 (memory levels) not started.
- `docs/archive/closing-the-gap.md` (March 2026) — "The flywheel has never turned once."
- `docs/archive/codebase-complexity-review.md` (2026-03-31) — "The initial dead code scan had a ~33% false-positive rate."
- `docs/glossary.md` — the "probe" disambiguation table (three universes).
- `CLAUDE.md` — states the code "still lives under `lib/`" in several places while the tree has no `lib/`; names `product/catalog/` which does not exist.

### Appendix B — Glossary for v2, and the v1 terms it retires

Forty terms is the cap. These are the ones v2 needs.

| Term | Meaning in v2 |
|---|---|
| test case | an Azure DevOps Test Case work item: title, ordered steps (action, expected), parameters, data rows, revision |
| step | one action/expected pair from a test case; becomes one `test.step` |
| screen | a route of the application with a stable page fingerprint |
| facet | a named unit of memory about a screen: element, state, vocabulary, or route; carries role, aliases, naming source, affordance, scope, locators, health, provenance, status |
| catalog | the per-screen YAML files holding facets, in the customer's repository |
| evidence | append-only observations and run outcomes attached to facets |
| provenance | who observed what, when, with which tool, session, model, and test case; minted at the event |
| candidate / trusted / stale / retired | facet status; candidate until a human accepts a test using it |
| snapshot | the structured observation of a page: candidates, landmarks, scopes, ARIA text, fingerprint |
| candidate (target) | one interactive element in a snapshot the agent may choose |
| naming source | where an accessible name came from: content, aria-label, labelledby, label-for, label-wrap, placeholder, none |
| affordance | why an element counts as interactive: native, aria-role, handler-owner, tabindex, none |
| landmark | banner, navigation, main, search, contentinfo, region — scoping units |
| data-block | OutSystems Reactive's compiled block container; a scoping unit |
| variant | reactive, traditional, unknown — the OutSystems flavor detected |
| hydration | the page state after the OutSystems runtime has mounted and the DOM is quiet |
| locator | a Playwright locator expression; strategies in ladder order: role-name, label, placeholder, text, test-id, css |
| ladder | the fixed order of locator strategies |
| health | successful resolutions over attempts for a locator, from real runs |
| four moves | memory, observe-and-decide, try, handoff |
| error family | not-visible, not-enabled, timeout, assertion-like, unclassified |
| handoff | a structured needs-human record: unresolved intent, attempts, evidence, candidates, next moves |
| tool | one of the thirteen named operations with typed input, output, error families, and a receipt |
| playbook | the short document the agent reads at session start |
| host | the agent runtime that calls the tools (Claude Code, Copilot, Codex, the batch driver) |
| batch driver | Tesseract's own loop over a suite with a pinned model |
| receipt | an append-only record of a tool call or a run |
| page object | the generated per-screen class holding locators, one getter per facet |
| keep-marker / override file | the handoff boundary: hand edits that survive regeneration |
| emit | generate spec and page objects from a resolved flow and the catalog |
| run | execute specs with Playwright; classify failures; write run receipts |
| publish | create an ADO test run and results for test points |
| acceptance / survival / cost | the three numbers |
| acceptance receipt | the record `review.record` writes: who reviewed which test, the decision, and what was edited |
| profile | an environment file: name, base URL, storage-state path, tenant, data set |
| cohort | a named set of applications and routes with a declared partition |
| training / held-out | partition; promotion is one-way and recorded |
| spent | a held-out route evaluated once for a page version |
| fixture | a rendered synthetic page that reproduces a real incident's shape |
| HAR replay | a recorded real page served to Playwright in CI |
| pattern | platform-generic resolution knowledge for a variant, grounded in public routes |
| fluency check | a pinned-model authoring of a fixture test case that must pass in CI |

Retired with v1 (kept in `docs/archive/v1/glossary.md` for readers of the old documents): rung (both ladders), probe (all three senses), verdict-N, graduation, compounding, hypothesis receipt, ratchet, trajectory, cohort-key era, visitor, proof obligation, theorem group, envelope axis, stage, source slot, lookup chain, reference canon, posture, overlay, semantic dictionary, translation cache, speedrun, dogfood, flywheel, saga, highway, town, spine, lane, act, scene, observatory, workbench, particle, glass pane, world shape, entropy profile, substrate (both senses), manifest (all senses but the tool list), instrument (as a category), intervention token impact, M5, C6, K/L/S/D/V/R/A/H/C/M.

### Appendix C — Sample artifacts end to end

**C.1 The ADO steps field, as the API returns it** (shape illustrative; the parser in v1 already handles `<step>` and `<parameterizedString>`):

```xml
<steps id="0" last="4">
  <step id="2" type="ActionStep">
    <parameterizedString isformatted="true">&lt;P&gt;Navigate to Policy Search screen&lt;/P&gt;</parameterizedString>
    <parameterizedString isformatted="true">&lt;P&gt;Policy Search screen loads&lt;/P&gt;</parameterizedString>
    <description/>
  </step>
  <step id="3" type="ActionStep">
    <parameterizedString isformatted="true">&lt;P&gt;Enter @policyNumber in search field&lt;/P&gt;</parameterizedString>
    <parameterizedString isformatted="true">&lt;P&gt;Policy Number accepts a valid policy&lt;/P&gt;</parameterizedString>
    <description/>
  </step>
  …
</steps>
```

with `Microsoft.VSTS.TCM.Parameters` naming `policyNumber` and `Microsoft.VSTS.TCM.LocalDataSource` holding the row `POL-001`.

**C.2 The snapshot the agent sees for step 2** (abbreviated):

```json
{
  "screen": { "url": "/PolicySearch", "variant": "reactive", "fingerprint": "sha256:…",
              "landmarks": ["banner", "navigation", "main", "search"], "dataBlocks": 14 },
  "scope": "search",
  "candidates": [
    { "ref": "c1", "role": "textbox", "name": "Search Policy", "namingSource": "placeholder",
      "affordance": "native", "dataBlock": "SearchBlock", "id": "b3-Input_Search", "visible": true, "enabled": true },
    { "ref": "c2", "role": "button", "name": "Search", "namingSource": "content",
      "affordance": "native", "dataBlock": "SearchBlock", "visible": true, "enabled": true },
    { "ref": "c3", "role": "generic", "name": "Filter", "namingSource": "content",
      "affordance": "handler-owner", "dataBlock": "SearchBlock", "visible": true, "enabled": true }
  ],
  "aria": "- search:\n  - textbox \"Search Policy\"\n  - button \"Search\"\n  - generic \"Filter\" …"
}
```

**C.3 The authoring receipt line for that decision:**

```json
{ "at": "2026-09-20T14:02:11Z", "tool": "app.act", "testCase": "10001", "step": 2,
  "decision": { "chose": "c1", "rejected": ["c3"], "reason": "step names 'search field'; c1 is the only textbox in the search landmark" },
  "host": { "model": "…", "promptFingerprint": "sha256:…", "tokens": { "prompt": 2210, "completion": 84 } },
  "facet": { "minted": "policy-search:policy-number-input", "status": "candidate" },
  "outcome": "succeeded", "durationMs": 412 }
```

**C.4 The emitted spec and page object** — §5.5.

**C.5 The run receipt and the ADO result:**

```json
{ "testCase": "10001", "spec": "tests/policy/10001-….spec.ts", "outcome": "passed",
  "steps": [ { "index": 4, "outcome": "passed", "facets": ["policy-search:results-table"], "durationMs": 890 } ],
  "trace": "test-results/…/trace.zip", "publishedTo": { "runId": 4711, "pointId": 1203 } }
```

and, in Azure DevOps, a test run named for the pipeline run with one result per test point, outcome `Passed`, duration, and the trace link in the comment.
