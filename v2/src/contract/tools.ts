/**
 * The single tool declaration. The MCP registration, the CLI subcommands, the
 * playbook's tool table, and the skill's reference are all generated from
 * this list, and `tesseract-qa drift-check` fails when any of them disagrees
 * with it. Adding capability means adding a tool; changing a tool's meaning
 * means a new name.
 *
 * Names are dotted (`app.open`) in documents and on the CLI. On the MCP wire
 * the dot becomes an underscore (`app_open`) because several model APIs
 * reject dots in tool names; `wireName()` is the one place that mapping lives.
 */
import { z } from 'zod';
import type { ErrorFamily } from '../core/errors.js';
import {
  AcceptanceReceiptSchema,
  AssertionKindSchema,
  CandidateRefSchema,
  DecisionSchema,
  FacetDraftSchema,
  FacetKindSchema,
  FacetSchema,
  FailureTypeSchema,
  HandoffBlockageSchema,
  HydrationSchema,
  LandmarkRoleSchema,
  LocatorSchema,
  PreflightEntrySchema,
  ResolvedLocatorSchema,
  ResolvedStepSchema,
  RunReceiptSchema,
  ScoredFacetSchema,
  ScreenRouteSchema,
  SnapshotDeltaSchema,
  SnapshotSchema,
  TargetSchema,
  TestCaseSchema,
  VariantSchema,
} from './schemas.js';

export const CONTRACT_VERSION = '2.0.0-alpha.1';

export type Release = 'A' | 'B' | 'C';

export interface ToolDeclaration<I extends z.ZodObject = z.ZodObject, O extends z.ZodObject = z.ZodObject, N extends string = string> {
  readonly name: N;
  readonly title: string;
  /** One line for tables and CLI help. */
  readonly summary: string;
  /** What the model reads. Say when to call it and what it will not do. */
  readonly description: string;
  readonly input: I;
  readonly output: O;
  readonly errorFamilies: readonly ErrorFamily[];
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly idempotent: boolean;
  /** Touches systems outside the workspace (the application under test, Azure DevOps). */
  readonly openWorld: boolean;
  readonly release: Release;
  /** `human` tools record human decisions; an agent should only call them on a human's explicit instruction. */
  readonly caller: 'agent' | 'human';
  readonly since: string;
}

const declare = <N extends string, I extends z.ZodObject, O extends z.ZodObject>(d: ToolDeclaration<I, O, N>): ToolDeclaration<I, O, N> => d;

const decision = DecisionSchema.optional();

// ─── Release A: eyes, hands, memory, pen, harness ──────────────────────────

export const appOpen = declare({
  name: 'app.open',
  title: 'Open the application',
  summary: 'Open a page (or attach to a running browser over CDP) and wait for the app to hydrate.',
  description:
    'Opens the application under test in a browser Tesseract manages and waits until an OutSystems Reactive or Traditional page has hydrated (network and DOM quiet, structure stable). ' +
    'Give a url (absolute, or relative to the profile baseURL) and/or a profile name from .tesseract/profiles/. auth "storage-state" loads the profile\'s saved session; "flow" first runs the profile\'s recorded login flow. ' +
    'attach joins a browser that is already running (a paused failing test from test.run, or a QA\'s own Chrome started with --remote-debugging-port) instead of launching one; it is for interactive repair only. ' +
    'Pass pageId to navigate an existing page. Returns a pageId used by every other app.* call.',
  input: z.object({
    url: z.string().optional().describe('Absolute URL, or a path relative to the profile baseURL.'),
    profile: z.string().optional().describe('Profile name (.tesseract/profiles/<name>.json). Defaults to $TESSERACT_PROFILE.'),
    auth: z.enum(['storage-state', 'flow', 'none']).optional().describe('Default: storage-state when the profile has one, else flow when it names a loginFlow, else none.'),
    attach: z.object({ cdpEndpoint: z.string(), urlContains: z.string().optional() }).optional(),
    pageId: z.string().optional().describe('Navigate this existing page instead of opening a new one.'),
    headed: z.boolean().optional().describe('Show the browser window (needed for a human to watch or record).'),
  }),
  output: z.object({
    pageId: z.string(),
    finalUrl: z.string(),
    title: z.string(),
    variant: VariantSchema,
    hydration: HydrationSchema,
    attached: z.boolean(),
    profile: z.string().optional(),
  }),
  errorFamilies: ['invalid-input', 'not-configured', 'not-found', 'timeout', 'unavailable', 'unclassified'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  openWorld: true,
  release: 'A',
  caller: 'agent',
  since: '2.0.0',
});

export const appObserve = declare({
  name: 'app.observe',
  title: 'Observe the page',
  summary: 'Snapshot the page the way its accessibility tree sees it: candidates with role, computed name, naming source, affordance, landmark, data-block.',
  description:
    'Returns a snapshot of the current page: each candidate control or landmark-relevant element with its computed ARIA role, its accessible name computed the way the browser computes it, where the name came from (content, label, placeholder, …), how it is interactive (native, aria-role, handler-owner for roleless clickables, tabindex), its landmark, its OutSystems data-block, and its row text inside tables; plus the page fingerprint and the ARIA snapshot text. ' +
    'Scope to a landmark ("search", "navigation", "main", …) or a block ("block:<data-block>") when the step names one; it shrinks the snapshot and the ambiguity. ' +
    'Pass intent (the step wording) to get ranked hints from the heuristic pre-filter; they are suggestions, you decide. Candidates are capped (non-interactive dropped first, then disabled, then off-screen) and text is PII-gated. ' +
    'audit:true adds testability findings (unnamed controls, duplicate names, structural-id-only controls, roleless clickables) for developers. The snapshot is saved so memory.mint can cite it by snapshotId.',
  input: z.object({
    pageId: z.string(),
    scope: z.string().optional().describe('"page" (default), a landmark role, or "block:<data-block>".'),
    intent: z.string().optional().describe('Step wording to rank candidates against, e.g. "Enter policy number in search field".'),
    includeScreenshot: z.boolean().optional(),
    audit: z.boolean().optional(),
    maxCandidates: z.number().int().min(1).max(500).optional(),
  }),
  output: SnapshotSchema,
  errorFamilies: ['invalid-input', 'not-found', 'timeout', 'malformed-response', 'unclassified'],
  readOnly: true,
  destructive: false,
  idempotent: true,
  openWorld: true,
  release: 'A',
  caller: 'agent',
  since: '2.0.0',
});

export const appAct = declare({
  name: 'app.act',
  title: 'Act on the page',
  summary: 'Perform one action (click, fill, select, check, press, hover, navigate) on a verified target so the next step sees real state.',
  description:
    'Performs one user action on a target: a facet from memory ({facetId}), a candidate from a snapshot ({snapshotId, ref}), or an explicit locator ({locator}). ' +
    'A candidate is first resolved through the locator ladder (role and name, label, placeholder, text, test id, css; landmark, data-block, and row scoping) to a locator that matches exactly one visible element, and the chosen locator is returned so you can mint it. ' +
    'The action really happens; that is how the next step sees the real state. Failures are returned, not thrown, with an error family: not-found, ambiguous, not-visible, not-enabled, timeout. Retry with different evidence at most a few times, then raise a handoff. ' +
    'value may be "@param" to use a test-case parameter supplied via params. Include decision to record why you chose this target.',
  input: z.object({
    pageId: z.string(),
    action: z.enum(['click', 'fill', 'select', 'check', 'uncheck', 'press', 'hover', 'navigate']),
    target: TargetSchema.optional().describe('Required for every action except navigate.'),
    value: z.string().optional().describe('Text for fill, option label/value for select, key for press, url for navigate.'),
    params: z.record(z.string(), z.string()).optional().describe('Values for "@param" references and "{param}" locator templates.'),
    timeoutMs: z.number().int().min(100).max(120_000).optional(),
    decision,
  }),
  output: z.object({
    outcome: z.enum(['succeeded', 'failed']),
    errorFamily: z.string().optional(),
    message: z.string().optional(),
    resolved: ResolvedLocatorSchema.optional(),
    facetId: z.string().optional(),
    select: z
      .object({ via: z.enum(['native', 'listbox', 'combobox']), typed: z.boolean().optional() })
      .optional()
      .describe('How a select was carried out: a native <select>, or a custom OutSystems dropdown opened and clicked.'),
    postState: SnapshotDeltaSchema.optional(),
    durationMs: z.number(),
  }),
  errorFamilies: ['invalid-input', 'not-found', 'ambiguous', 'not-visible', 'not-enabled', 'timeout', 'assertion-like', 'stale-snapshot', 'unavailable', 'malformed-response', 'unclassified'],
  readOnly: false,
  destructive: true,
  idempotent: false,
  openWorld: true,
  release: 'A',
  caller: 'agent',
  since: '2.0.0',
});

export const appAssert = declare({
  name: 'app.assert',
  title: 'Assert on the page',
  summary: 'Check a web-first assertion (visible, text, value, url, count, …) and report what was observed.',
  description:
    'Evaluates one assertion with Playwright\'s auto-waiting expect and reports passed plus the observed value, so you can tell a real mismatch from a paraphrase (the expected text in ADO is often a paraphrase of what the page shows). ' +
    'Use it to verify the expected result of each step before emitting it. Prefer assertions on content (text, value, row present, count) over bare visibility. When the target is a facet, the outcome is recorded as evidence of its locator\'s health.',
  input: z.object({
    pageId: z.string(),
    assertion: AssertionKindSchema,
    target: TargetSchema.optional().describe('Omit for url and title.'),
    expected: z.union([z.string(), z.number()]).optional(),
    params: z.record(z.string(), z.string()).optional(),
    timeoutMs: z.number().int().min(100).max(60_000).optional(),
  }),
  output: z.object({
    passed: z.boolean(),
    observed: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    message: z.string().optional(),
    resolved: ResolvedLocatorSchema.optional(),
  }),
  errorFamilies: ['invalid-input', 'not-found', 'ambiguous', 'timeout', 'stale-snapshot', 'unavailable', 'malformed-response', 'unclassified'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  openWorld: true,
  release: 'A',
  caller: 'agent',
  since: '2.0.0',
});

export const memoryQuery = declare({
  name: 'memory.query',
  title: 'Query memory',
  summary: 'Find facets on a screen by the words a test author would use.',
  description:
    'Searches the facet catalog (.tesseract/catalog/) for facets matching a phrase, scored by status weight × phrase score × locator health; at most 8 results above 0.3, trusted before candidate at equal score. ' +
    'Call it first for every step: a trusted facet with healthy locators resolves the step without observing the page. Omit screen to search every screen (useful to find which screen a step is on). An empty result on an unseen screen is normal.',
  input: z.object({
    screen: z.string().optional(),
    phrase: z.string(),
    kind: FacetKindSchema.optional(),
    landmark: LandmarkRoleSchema.optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  output: z.object({
    facets: z.array(ScoredFacetSchema),
    screenKnown: z.boolean(),
    route: ScreenRouteSchema.optional(),
  }),
  errorFamilies: ['invalid-input', 'malformed-response', 'unclassified'],
  readOnly: true,
  destructive: false,
  idempotent: true,
  openWorld: false,
  release: 'A',
  caller: 'agent',
  since: '2.0.0',
});

export const memoryMint = declare({
  name: 'memory.mint',
  title: 'Mint a facet',
  summary: 'Record a new facet (a named, role-bearing element of a screen) with provenance; it starts as a candidate.',
  description:
    'Adds a facet to the screen\'s catalog with the snapshot and candidate that justify it as provenance. Name it with the words the test author used (displayName and aliases); give the verified locator from app.act when you have it. ' +
    'Minted facets are candidates until a test using them is accepted by a human or passes enough runs. Minting an equivalent facet again appends evidence instead of duplicating; a different target under an existing id is a conflict. route sets the screen\'s URL (relative to the profile baseURL).',
  input: z.object({
    screen: z.string().describe('Screen name, kebab-case, e.g. "policy-search".'),
    facet: FacetDraftSchema,
    evidence: CandidateRefSchema.describe('{snapshotId, ref} of the candidate this facet describes.'),
    route: ScreenRouteSchema.optional(),
    decision,
  }),
  output: z.object({ facet: FacetSchema, created: z.boolean() }),
  errorFamilies: ['invalid-input', 'conflict', 'stale-snapshot', 'malformed-response', 'unclassified'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  openWorld: false,
  release: 'A',
  caller: 'agent',
  since: '2.0.0',
});

export const testEmit = declare({
  name: 'test.emit',
  title: 'Emit the test',
  summary: 'Write a plain Playwright spec for the test case and regenerate the page objects it uses.',
  description:
    'Generates tests/<area>/<adoId>-<slug>.spec.ts with the ADO step wording as test.step titles, ADO id/revision/content-hash annotations, web-first assertions, and no selectors in the body; and regenerates pages/<screen>.page.ts from the catalog. Unresolved steps (handoffId) become test.fixme with the reason inline. ' +
    'Steps that target a snapshot candidate or raw locator are minted as candidate facets first. Regions marked tesseract:keep and *.page.overrides.ts survive regeneration. The emitted files import nothing from Tesseract and run with npx playwright test. Returns the unified diff against the previous version.',
  input: z.object({
    testCase: z.union([TestCaseSchema, z.object({ id: z.string() })]).describe('The case from ado.fetch, or {id} to load the cached copy.'),
    steps: z.array(ResolvedStepSchema),
    flows: z.array(z.object({ name: z.string(), params: z.record(z.string(), z.string()).optional() })).optional().describe('Recorded flows to run in beforeEach (e.g. login).'),
    area: z.string().optional().describe('Subfolder under tests/; defaults to the first screen.'),
    tags: z.array(z.string()).optional(),
    dryRun: z.boolean().optional().describe('Return the diff without writing.'),
    force: z.boolean().optional().describe('Regenerate over hand edits made outside tesseract:keep regions (kept code is preserved or orphaned, never dropped).'),
    decision,
  }),
  output: z.object({
    specPath: z.string(),
    pageObjectPaths: z.array(z.string()),
    flowPaths: z.array(z.string()),
    facetsMinted: z.array(z.string()),
    facetsUsed: z.array(z.string()),
    diff: z.string(),
    written: z.boolean(),
    orphaned: z
      .array(z.object({ path: z.string(), keys: z.array(z.string()) }))
      .describe('Kept code whose anchor disappeared; appended as commented blocks for a human to place.'),
  }),
  errorFamilies: ['invalid-input', 'not-found', 'conflict', 'malformed-response', 'unclassified'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  openWorld: false,
  release: 'A',
  caller: 'agent',
  since: '2.0.0',
});

export const testRun = declare({
  name: 'test.run',
  title: 'Run tests',
  summary: 'Run emitted specs with Playwright, classify failures against facets, and write run receipts.',
  description:
    'Runs specs with the project\'s own Playwright config (Tesseract is not in the runtime path), collects the JSON report and traces, maps each step to the facets it uses, and classifies failures: not-found/ambiguous on a facet is drift, an assertion mismatch on expected text is a candidate bug, a navigation timeout is environment. ' +
    'Passing runs raise facet locator health and promote candidates after enough passes; failing locators lower it and mark facets stale. ' +
    'pauseOnFailure (interactive only) holds the browser open at the first failure and returns a CDP endpoint: attach with app.open, observe, repair with app.act, record with memory.enrich, then call test.run again (which releases the paused run).',
  input: z.object({
    specPaths: z.array(z.string()).optional().describe('Workspace-relative spec paths; default all specs under tests/.'),
    grep: z.string().optional(),
    profile: z.string().optional().describe('Sets TESSERACT_PROFILE / baseURL for the run.'),
    headed: z.boolean().optional(),
    retries: z.number().int().min(0).max(5).optional(),
    pauseOnFailure: z.boolean().optional().describe('Hold the browser open at the first failure (retries are not attempted in this mode).'),
    updateMemory: z.boolean().optional().describe('Default true: write run evidence to facets.'),
    timeoutMs: z.number().int().min(1000).optional().describe('Wall-clock budget for the whole run (default 10 minutes).'),
  }),
  output: z.object({
    runId: z.string(),
    receipts: z.array(RunReceiptSchema),
    summary: z.object({ passed: z.number().int(), failed: z.number().int(), skipped: z.number().int(), flaky: z.number().int() }),
    reportPath: z.string().optional(),
    paused: RunReceiptSchema.shape.paused,
    promoted: z.array(z.string()),
    staled: z.array(z.string()),
  }),
  errorFamilies: ['invalid-input', 'not-configured', 'not-found', 'timeout', 'unavailable', 'malformed-response', 'unclassified'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  openWorld: true,
  release: 'A',
  caller: 'agent',
  since: '2.0.0',
});

// ─── Release B: the loop closes ────────────────────────────────────────────

export const adoFetch = declare({
  name: 'ado.fetch',
  title: 'Fetch test cases',
  summary: 'Read Azure DevOps test cases with steps, parameters, data rows, and shared steps expanded inline.',
  description:
    'Fetches test cases by id, by WIQL, or by test plan and suite, parses the Microsoft.VSTS.TCM.Steps XML into plain action/expected text, expands shared steps inline (each expanded step keeps the stepIdentifier "<sharedRefId>;<childId>" so results publish per step), and reads parameters and local data rows. ' +
    'Plan/suite fetches include the test points needed by ado.publish. Each case carries its revision and a content hash; emitted tests are annotated with both. Results are cached under .tesseract/cases/; refresh forces a re-read. Read-only against Azure DevOps.',
  input: z.object({
    ids: z.array(z.string()).optional(),
    wiql: z.string().optional(),
    planId: z.number().int().optional(),
    suiteId: z.number().int().optional(),
    refresh: z.boolean().optional(),
  }),
  output: z.object({
    testCases: z.array(TestCaseSchema),
    source: z.enum(['ado', 'cache']),
    warnings: z.array(z.string()),
  }),
  errorFamilies: ['invalid-input', 'not-configured', 'not-found', 'rate-limited', 'unavailable', 'malformed-response', 'unclassified'],
  readOnly: true,
  destructive: false,
  idempotent: true,
  openWorld: true,
  release: 'B',
  caller: 'agent',
  since: '2.0.0',
});

const PublishOutcomeSchema = z.enum(['Passed', 'Failed', 'Blocked', 'NotExecuted', 'Inconclusive', 'Aborted', 'Timeout']);

export const adoPublish = declare({
  name: 'ado.publish',
  title: 'Publish results',
  summary: 'Publish run results to Azure DevOps test points, with per-step outcomes, so the test plan shows green and red.',
  description:
    'Creates a test run against the plan, adds one result per test point (outcome, duration, error, trace link, per-step action results keyed by stepIdentifier, one iteration per data row), and completes the run. ' +
    'Give fromRunId (the runId returned by test.run) to publish those receipts, or explicit results. associateAutomation marks the test cases as automated by their spec. Idempotent per runName. dryRun returns the requests without sending them.',
  input: z.object({
    planId: z.number().int(),
    suiteId: z.number().int(),
    runName: z.string(),
    fromRunId: z.string().optional(),
    results: z
      .array(
        z.object({
          testCaseId: z.string(),
          testPointId: z.number().int().optional(),
          testCaseRevision: z.number().int().optional(),
          outcome: PublishOutcomeSchema,
          durationMs: z.number(),
          errorMessage: z.string().optional(),
          failureType: FailureTypeSchema.optional(),
          traceRef: z.string().optional(),
          comment: z.string().optional(),
          dataRow: z.number().int().min(0).optional().describe('0-based index into the case\'s dataRows; published as iteration dataRow + 1.'),
          steps: z
            .array(z.object({ stepIdentifier: z.string(), outcome: PublishOutcomeSchema, durationMs: z.number().optional(), errorMessage: z.string().optional() }))
            .optional(),
        }),
      )
      .optional(),
    associateAutomation: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }),
  output: z.object({
    runId: z.number().int(),
    url: z.string(),
    resultIds: z.array(z.number().int()),
    alreadyPublished: z.boolean(),
    requests: z.array(z.object({ method: z.string(), url: z.string(), body: z.unknown().optional() })).optional(),
  }),
  errorFamilies: ['invalid-input', 'not-configured', 'not-found', 'rate-limited', 'unavailable', 'malformed-response', 'unclassified'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  openWorld: true,
  release: 'B',
  caller: 'agent',
  since: '2.0.0',
});

export const handoffRaise = declare({
  name: 'handoff.raise',
  title: 'Raise a handoff',
  summary: 'Ask a human, with everything they need, instead of guessing: writes the handoff file and comments on the ADO test case.',
  description:
    'Use when a step cannot be resolved after memory, observation, and a bounded number of attempts: an ambiguous target (list the plausible candidates), expected text that paraphrases what the page shows (propose the assertion you would write), missing test data, authentication, or environment trouble. ' +
    'Writes .tesseract/handoffs/<adoId>-<step>.json, takes a screenshot when pageId is given, and comments on the ADO test case when Azure DevOps is configured. Pass the returned handoffId on the step to test.emit so the spec carries test.fixme with the reason inline. Never guess silently.',
  input: z.object({
    testCaseId: z.string(),
    stepIndex: z.number().int().min(1),
    stepIdentifier: z.string().optional(),
    blockage: HandoffBlockageSchema,
    unresolvedIntent: z.string(),
    attempted: z.array(z.string()),
    evidence: z.object({ snapshotId: z.string().optional(), pageId: z.string().optional() }),
    candidates: z.array(z.object({ ref: z.string().optional(), role: z.string().optional(), name: z.string(), why: z.string().optional() })).optional(),
    nextMoves: z.array(z.string()),
    proposedAssertion: z.string().optional(),
    commentOnAdo: z.boolean().optional().describe('Default true when Azure DevOps is configured.'),
    decision,
  }),
  output: z.object({ handoffId: z.string(), path: z.string(), screenshotPath: z.string().optional(), adoCommentUrl: z.string().optional() }),
  errorFamilies: ['invalid-input', 'not-found', 'unavailable', 'unclassified'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  openWorld: true,
  release: 'B',
  caller: 'agent',
  since: '2.0.0',
});

export const reviewRecord = declare({
  name: 'review.record',
  title: 'Record a review',
  summary: 'Record a human reviewer\'s accept / accept-with-edit / reject of an emitted test; acceptance promotes its facets to trusted.',
  description:
    'A human decision. Call only when a human reviewer tells you their verdict (or from the CLI / pull-request workflow). Writes an acceptance receipt; accept and accept-with-edit promote the candidate facets the test uses to trusted, except when locatorEdited says the reviewer had to fix a locator. ' +
    'accept-with-edit counts as accepted when at most 5 lines changed or the only edit is a locator in an overrides file. These receipts are the acceptance number.',
  input: z.object({
    testCaseId: z.string(),
    decision: z.enum(['accept', 'accept-with-edit', 'reject']),
    reviewer: z.string(),
    changedLines: z.number().int().min(0).optional(),
    locatorEdited: z.boolean().optional(),
    note: z.string().optional(),
  }),
  output: AcceptanceReceiptSchema,
  errorFamilies: ['invalid-input', 'not-found', 'malformed-response', 'unclassified'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  openWorld: false,
  release: 'B',
  caller: 'human',
  since: '2.0.0',
});

export const memoryEnrich = declare({
  name: 'memory.enrich',
  title: 'Enrich a facet',
  summary: 'Add aliases or a better locator to an existing facet, with the evidence that justifies the change.',
  description:
    'Adds aliases (more words test authors use for this element), a new or repaired locator (placed first), or a new display name to an existing facet, citing the snapshot candidate that shows it. Use after a repair in place or when a step names a known element in new words. ' +
    'The previous locators are kept below the new one; nothing is overwritten silently, and the evidence log records the change. retire:true retires a facet whose element is gone.',
  input: z.object({
    facetId: z.string(),
    aliases: z.array(z.string()).optional(),
    locator: LocatorSchema.optional(),
    displayName: z.string().optional(),
    retire: z.boolean().optional(),
    evidence: CandidateRefSchema,
    decision,
  }),
  output: z.object({ facet: FacetSchema, changes: z.array(z.string()) }),
  errorFamilies: ['invalid-input', 'not-found', 'conflict', 'stale-snapshot', 'malformed-response', 'unclassified'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  openWorld: false,
  release: 'B',
  caller: 'agent',
  since: '2.0.0',
});

export const memoryPreflight = declare({
  name: 'memory.preflight',
  title: 'Preflight memory',
  summary: 'Check, on the live app, that a screen\'s facets and flows still resolve before trusting its page object.',
  description:
    'Opens each screen\'s route (or uses pageId), waits for hydration, and checks every facet\'s best locator: ok (exactly one visible match), stale (zero or several, or the page fingerprint drifted), missing (no locator matches anything). Marks stale facets in memory. ' +
    'Run it at session start, before authoring on a screen you have seen before, and in CI against a preview environment so developers learn which controls a change broke before the suite runs. Omit screen to check every screen with a route.',
  input: z.object({
    screen: z.string().optional(),
    profile: z.string().optional(),
    pageId: z.string().optional(),
    flows: z.array(z.string()).optional(),
  }),
  output: z.object({
    screens: z.array(
      z.object({
        screen: z.string(),
        url: z.string().optional(),
        status: z.enum(['ok', 'stale', 'missing', 'unreachable', 'no-route']),
        fingerprintChanged: z.boolean(),
        fingerprintDiff: z.array(z.string()),
        facets: z.array(PreflightEntrySchema),
        detail: z.string().optional().describe('Why the screen is unreachable (the navigation error or redirect) or has no route.'),
      }),
    ),
    flows: z.array(PreflightEntrySchema),
    summary: z.object({ ok: z.number().int(), stale: z.number().int(), missing: z.number().int(), unchecked: z.number().int() }),
  }),
  errorFamilies: ['invalid-input', 'not-found', 'not-configured', 'timeout', 'unavailable', 'malformed-response', 'unclassified'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  openWorld: true,
  release: 'B',
  caller: 'agent',
  since: '2.0.0',
});

// ─── Release C: record and repair ──────────────────────────────────────────

export const flowRecord = declare({
  name: 'flow.record',
  title: 'Record a flow',
  summary: 'Record a path walked once (by a QA in a headed browser, or by your app.act calls) into facets and a deterministic flow.',
  description:
    'Captures every click, fill, select, check, and key press on the page with the snapshot at that moment, mints a candidate facet for each control touched (the recording is its provenance), and writes a draft deterministic flow: .tesseract/flows/<name>.json plus flows/<name>.ts using the page objects. ' +
    'For a QA walking the path, open the page with headed:true and use stopOn "manual" (a Stop button is shown in the page) or "urlChange"; for an agent, start with stopOn "steps" and maxSteps, then drive with app.act concurrently. ' +
    'Values typed into password fields or fields named in redact become parameters (never stored); supply them to flow.run via params or TESSERACT_PARAM_<NAME>.',
  input: z.object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/).describe('kebab-case flow name, e.g. "login".'),
    pageId: z.string().optional(),
    url: z.string().optional(),
    profile: z.string().optional(),
    screen: z.string().optional().describe('Screen name for minted facets; derived from the URL path when absent.'),
    stopOn: z.enum(['manual', 'urlChange', 'steps']),
    maxSteps: z.number().int().min(1).max(200).optional(),
    timeoutMs: z.number().int().min(1000).max(3_600_000).optional(),
    redact: z.array(z.string()).optional().describe('Field names (accessible names) whose values become parameters.'),
  }),
  output: z.object({
    flowPath: z.string(),
    recordingPath: z.string(),
    facetsMinted: z.array(z.string()),
    params: z.array(z.string()),
    steps: z.array(
      z.object({
        index: z.number().int(),
        action: z.string(),
        facetId: z.string().optional(),
        value: z.string().optional(),
        url: z.string(),
        snapshotId: z.string().optional(),
      }),
    ),
    stoppedBy: z.enum(['manual', 'urlChange', 'steps', 'timeout', 'closed']),
  }),
  errorFamilies: ['invalid-input', 'not-configured', 'not-found', 'conflict', 'timeout', 'unavailable', 'malformed-response', 'unclassified'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  openWorld: true,
  release: 'C',
  caller: 'agent',
  since: '2.0.0',
});

export const flowRun = declare({
  name: 'flow.run',
  title: 'Run a flow',
  summary: 'Execute a recorded deterministic flow (log in, seed a record, reach a screen) with no model in the loop.',
  description:
    'Runs .tesseract/flows/<name>.json step by step using each facet\'s best locator, waiting for hydration after navigations. Use it for preconditions instead of authoring them: the emitted test calls the same flow in beforeEach. ' +
    'Parameters come from params, then TESSERACT_PARAM_<NAME>. On failure, returns the failing step and error family; run memory.preflight or re-record.',
  input: z.object({
    name: z.string(),
    profile: z.string().optional(),
    params: z.record(z.string(), z.string()).optional(),
    pageId: z.string().optional(),
  }),
  output: z.object({
    pageId: z.string(),
    outcome: z.enum(['passed', 'failed']),
    failedStep: z.number().int().optional(),
    errorFamily: z.string().optional(),
    message: z.string().optional(),
    finalUrl: z.string(),
    title: z.string(),
    durationMs: z.number(),
  }),
  errorFamilies: ['invalid-input', 'not-found', 'not-configured', 'not-visible', 'not-enabled', 'timeout', 'unavailable', 'malformed-response', 'unclassified'],
  readOnly: false,
  destructive: true,
  idempotent: false,
  openWorld: true,
  release: 'C',
  caller: 'agent',
  since: '2.0.0',
});

export const TOOLS = [
  appOpen,
  appObserve,
  appAct,
  appAssert,
  memoryQuery,
  memoryMint,
  testEmit,
  testRun,
  adoFetch,
  adoPublish,
  handoffRaise,
  reviewRecord,
  memoryEnrich,
  memoryPreflight,
  flowRecord,
  flowRun,
] as const;

export type ToolDecl = (typeof TOOLS)[number];
export type ToolName = ToolDecl['name'];

type DeclByName = { [D in ToolDecl as D['name']]: D };
export type ToolInput<N extends ToolName> = z.infer<DeclByName[N]['input']>;
export type ToolOutput<N extends ToolName> = z.infer<DeclByName[N]['output']>;

export const wireName = (name: string): string => name.replace(/\./g, '_');

export const findTool = (nameOrWire: string): ToolDeclaration | undefined =>
  (TOOLS as readonly ToolDeclaration[]).find((tool) => tool.name === nameOrWire || wireName(tool.name) === nameOrWire);

/** Compile-time check that every name is a literal (so ToolInput/ToolOutput resolve per tool). */
type AssertLiteral<T extends string> = string extends T ? never : T;
export type ToolNameChecked = AssertLiteral<ToolName>;

// Re-exported so consumers can reference the step and receipt shapes from one place.
export { ResolvedStepSchema, RunReceiptSchema };
