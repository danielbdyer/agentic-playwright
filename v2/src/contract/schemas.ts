/**
 * The contract's data shapes. Zod is the single source: TypeScript types are
 * inferred from these schemas, the MCP server publishes them as JSON Schema,
 * and the CLI validates its JSON arguments with them. Changing a shape here
 * changes all three at once; a tool whose meaning changes gets a new name.
 */
import { z } from 'zod';
import { ERROR_FAMILIES } from '../core/errors.js';

export const ErrorFamilySchema = z.enum(ERROR_FAMILIES);

// ─── Locators ──────────────────────────────────────────────────────────────

/** Landmark roles the walker reports; scoping by landmark is 100% reliable on OutSystems Reactive. */
export const LandmarkRoleSchema = z.enum([
  'banner', 'navigation', 'main', 'contentinfo', 'complementary', 'search', 'form', 'region', 'dialog',
]);

export const LocatorStrategySchema = z
  .enum(['role-name', 'label', 'placeholder', 'text', 'test-id', 'css', 'row-text'])
  .describe('Locator ladder, in preference order: role-name, label, placeholder, text, test-id, css. row-text selects a table/grid row by the text it contains.');

export const LocatorScopeSchema = z
  .object({
    landmark: LandmarkRoleSchema.optional().describe('Scope to the landmark with this role, e.g. "search" or "navigation".'),
    landmarkName: z.string().optional().describe('Accessible name of the landmark when several share a role.'),
    dataBlock: z.string().optional().describe('Scope to the OutSystems block container with this data-block value.'),
    rowText: z.string().optional().describe('Scope to the table/grid row containing this text.'),
    rowExact: z.boolean().optional().describe('Match rowText against a whole cell (exact) instead of a substring of the row, so "POL-30" does not match "POL-300".'),
  })
  .describe('Containers the locator is scoped by, outermost first: landmark, then data-block, then row.');

export const LocatorSchema = z
  .object({
    strategy: LocatorStrategySchema,
    role: z.string().optional().describe('ARIA role for role-name (and optionally row-text, default "row").'),
    name: z.string().optional().describe('Accessible name for role-name.'),
    exact: z.boolean().optional().describe('Exact name/text match. Defaults to true for role-name and text.'),
    value: z.string().optional().describe('The label, placeholder, text, test id, css selector, or row text. A row-text value may be a parameter reference like "{policyNumber}".'),
    attribute: z.string().optional().describe('For test-id: the attribute carrying the id, e.g. "os-test-id" or "data-testid" (default).'),
    scope: LocatorScopeSchema.optional(),
    visibleOnly: z.boolean().optional().describe('Filter to visible matches; set when hidden twins of the element exist (rendered as .filter({ visible: true })).'),
    nth: z.number().int().min(0).optional().describe('Zero-based index when the ladder could not find a unique locator. Fragile; avoid.'),
    expression: z.string().optional().describe('Derived Playwright expression for display; ignored on input.'),
  })
  .describe('A structured Playwright locator. The expression is derived from it, never the other way round.');

export const CandidateRefSchema = z
  .object({ snapshotId: z.string(), ref: z.string().describe('Candidate ref from app.observe, e.g. "c12".') })
  .describe('A candidate from a snapshot; resolved to a verified locator via the locator ladder.');

export const FacetRefSchema = z.object({ facetId: z.string().describe('Facet id, "<screen>:<name>".') });

export const TargetSchema = z
  .union([FacetRefSchema, CandidateRefSchema, z.object({ locator: LocatorSchema })])
  .describe('What to act on: a facet from memory, a candidate from a snapshot, or an explicit locator.');

export const ResolvedLocatorSchema = z.object({
  locator: LocatorSchema,
  expression: z.string(),
  verified: z.boolean().describe('True when the locator matched exactly one visible element that is the intended one.'),
  alternatives: z
    .array(z.object({ locator: LocatorSchema, expression: z.string(), matches: z.number().int(), rejectedBecause: z.string() }))
    .describe('Ladder rungs tried before the chosen one and why they were rejected.'),
});

// ─── Observation ───────────────────────────────────────────────────────────

export const NamingSourceSchema = z.enum([
  'aria-labelledby', 'aria-label', 'label-for', 'label-wrap', 'placeholder', 'title', 'alt', 'content', 'value', 'none',
]);

export const AffordanceSchema = z.enum(['native', 'aria-role', 'handler-owner', 'tabindex', 'none']);

export const VariantSchema = z.enum(['reactive', 'traditional', 'unknown']);

export const CandidateSchema = z.object({
  ref: z.string(),
  role: z.string().describe('Computed ARIA role; "generic" for a roleless handler-owning clickable.'),
  name: z.string().describe('Accessible name computed the way the browser computes it (PII-gated).'),
  namingSource: NamingSourceSchema,
  affordance: AffordanceSchema,
  interactive: z.boolean(),
  tag: z.string(),
  landmark: LandmarkRoleSchema.optional(),
  landmarkName: z.string().optional(),
  dataBlock: z.string().optional().describe('Nearest OutSystems data-block ancestor.'),
  rowText: z.string().optional().describe('Text of the enclosing table/grid row, when inside one (PII-gated, truncated).'),
  testId: z.string().optional().describe('os-test-id or data-testid, when present.'),
  testIdAttribute: z.string().optional().describe('Which attribute carried testId: "os-test-id" or "data-testid".'),
  id: z.string().optional(),
  idKind: z.enum(['designer', 'structural', 'plain']).optional().describe('structural ids (b3-…) are fragile; designer ids end with the widget Name.'),
  placeholder: z.string().optional(),
  inputType: z.string().optional(),
  level: z.number().int().optional().describe('Heading level.'),
  checked: z.boolean().optional(),
  visible: z.boolean(),
  enabled: z.boolean(),
  inViewport: z.boolean(),
});

export const PageFingerprintSchema = z.object({
  hash: z.string(),
  title: z.string(),
  path: z.string(),
  landmarks: z.array(z.string()),
  roleCounts: z.record(z.string(), z.number()),
  interactive: z.number().int(),
  rolelessInteractive: z.number().int(),
  placeholderOnlyInputs: z.number().int(),
  dataBlocks: z.number().int(),
  dataBlockNames: z.array(z.string()).optional().describe('Distinct OutSystems block names on the page (part of the structural hash).'),
  runtimeGlobal: z.string().nullable(),
});

export const HydrationSchema = z.object({
  settled: z.boolean(),
  elapsedMs: z.number(),
  reason: z.string().describe('Why the wait ended: settled, budget-exhausted, or attached (no wait).'),
});

export const HintSchema = z.object({
  ref: z.string(),
  score: z.number(),
  why: z.string(),
});

export const AuditFindingSchema = z.object({
  kind: z.enum(['unnamed-control', 'duplicate-name', 'structural-id-only', 'roleless-clickable', 'placeholder-only-input', 'missing-landmarks']),
  refs: z.array(z.string()),
  message: z.string(),
});

export const SnapshotSchema = z.object({
  snapshotId: z.string(),
  pageId: z.string(),
  at: z.string(),
  url: z.string(),
  title: z.string(),
  variant: VariantSchema,
  scope: z.string().describe('"page", a landmark role, or "block:<data-block>".'),
  fingerprint: PageFingerprintSchema,
  candidates: z.array(CandidateSchema),
  totalCandidates: z.number().int(),
  aria: z.string().describe('Playwright ARIA snapshot text for the scope, capped.'),
  truncated: z.boolean(),
  screenshotPath: z.string().optional(),
  hints: z.array(HintSchema).optional().describe('When an intent was given: candidates ranked by the heuristic pre-filter. A suggestion; the agent decides.'),
  audit: z.array(AuditFindingSchema).optional(),
});

export const SnapshotDeltaSchema = z.object({
  snapshotId: z.string(),
  url: z.string(),
  urlChanged: z.boolean(),
  fingerprintChanged: z.boolean(),
  added: z.array(CandidateSchema).describe('Candidates present after the action and not before (capped).'),
  removed: z.array(z.object({ role: z.string(), name: z.string() })),
  alerts: z.array(z.string()).describe('Text of alert/status/feedback-message regions after the action.'),
});

// ─── Azure DevOps intent ───────────────────────────────────────────────────

export const TestStepSchema = z.object({
  index: z.number().int().min(1).describe('1-based position in the expanded step list.'),
  stepIdentifier: z.string().describe('ADO step id; "<sharedStepRefId>;<childStepId>" for steps expanded from shared steps.'),
  action: z.string(),
  expected: z.string(),
  sharedStepId: z.number().int().optional(),
});

export const TestCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  revision: z.number().int(),
  contentHash: z.string(),
  state: z.string().optional(),
  priority: z.number().int().optional(),
  areaPath: z.string().optional(),
  iterationPath: z.string().optional(),
  tags: z.array(z.string()),
  steps: z.array(TestStepSchema),
  parameters: z.array(z.string()),
  dataRows: z.array(z.record(z.string(), z.string())),
  url: z.string().optional(),
  points: z
    .array(z.object({ pointId: z.number().int(), planId: z.number().int(), suiteId: z.number().int(), configurationName: z.string().optional() }))
    .optional(),
  warnings: z.array(z.string()).optional(),
});

// ─── Memory ────────────────────────────────────────────────────────────────

export const FacetKindSchema = z.enum(['element', 'state', 'route', 'region', 'row']);
export const FacetStatusSchema = z.enum(['candidate', 'trusted', 'stale', 'retired']);

export const FacetLocatorSchema = LocatorSchema.extend({
  health: z.string().optional().describe('"successes/attempts" from real resolutions, derived from the evidence log.'),
  note: z.string().optional(),
});

export const ProvenanceSchema = z.object({
  mintedAt: z.string(),
  instrument: z.enum(['app.observe', 'app.act', 'flow.record', 'test.emit', 'human']),
  session: z.string().optional(),
  model: z.string().optional(),
  testCase: z.string().optional(),
  snapshotId: z.string().optional(),
  candidateRef: z.string().optional(),
  flow: z.string().optional(),
});

export const FacetSchema = z.object({
  id: z.string(),
  screen: z.string(),
  kind: FacetKindSchema,
  displayName: z.string(),
  aliases: z.array(z.string()),
  role: z.string().optional(),
  tag: z.string().optional().describe('HTML tag of the element when minted; tells emission a native <select> from a custom combobox.'),
  namingSource: NamingSourceSchema.optional(),
  affordance: AffordanceSchema.optional(),
  scope: z.object({ landmark: LandmarkRoleSchema.optional(), dataBlock: z.string().optional() }).optional(),
  locators: z.array(FacetLocatorSchema),
  parameter: z.string().optional().describe('For row facets: the parameter the row is selected by.'),
  member: z.string().optional().describe('Page-object member name; derived from the id when absent.'),
  status: FacetStatusSchema,
  provenance: ProvenanceSchema,
  evidence: z.string().optional().describe('Pointer into the evidence log.'),
});

export const FacetDraftSchema = z.object({
  name: z.string().optional().describe('Local id within the screen, kebab-case; derived from displayName when absent.'),
  kind: FacetKindSchema.default('element'),
  displayName: z.string(),
  aliases: z.array(z.string()).optional().describe('Use the words the test author used, e.g. "search field".'),
  role: z.string().optional(),
  tag: z.string().optional(),
  namingSource: NamingSourceSchema.optional(),
  affordance: AffordanceSchema.optional(),
  scope: z.object({ landmark: LandmarkRoleSchema.optional(), dataBlock: z.string().optional() }).optional(),
  locator: LocatorSchema.optional().describe('A verified locator (e.g. from app.act). When absent, derived from the evidence candidate.'),
  parameter: z.string().optional(),
});

export const ScoredFacetSchema = FacetSchema.extend({
  score: z.number(),
  phraseScore: z.number(),
  locatorHealth: z.number(),
});

export const ScreenRouteSchema = z.object({
  url: z.string().describe('Relative to the profile baseURL (no leading slash), or absolute.'),
  variant: VariantSchema.optional(),
  fingerprint: z.string().optional(),
  title: z.string().optional(),
  landmarks: z.array(z.string()).optional().describe('Landmarks seen on the screen; goto() waits for main when present.'),
});

// ─── Recorded flows ────────────────────────────────────────────────────────

export const FlowParamSchema = z.object({
  name: z.string(),
  secret: z.boolean().describe('Secret parameters are never written; tests read them from TESSERACT_PARAM_<NAME>.'),
  default: z.string().optional(),
});

export const FlowValueSchema = z.union([
  z.object({ literal: z.string() }),
  z.object({ param: z.string(), secret: z.boolean().optional() }),
]);

export const FlowRecordingStepSchema = z.object({
  index: z.number().int().min(1),
  action: z.enum(['navigate', 'click', 'fill', 'select', 'check', 'uncheck', 'press', 'hover']),
  facetId: z.string().optional(),
  screen: z.string(),
  value: FlowValueSchema.optional(),
  url: z.string(),
  snapshotId: z.string().optional(),
  navigatesTo: z.string().optional().describe('The URL (relative to the base when possible) this step navigated to; replay waits for it before the next step.'),
});

/** .tesseract/flows/<name>.json, written by flow.record and read by flow.run and emission. */
export const FlowRecordingSchema = z.object({
  name: z.string(),
  startUrl: z.string().optional().describe('Relative to the profile baseURL when possible.'),
  recordedAt: z.string().optional(),
  session: z.string().optional(),
  steps: z.array(FlowRecordingStepSchema),
  params: z.array(FlowParamSchema),
});

export const PreflightEntrySchema = z.object({
  id: z.string(),
  status: z.enum(['ok', 'stale', 'missing', 'unchecked']),
  matches: z.number().int().optional(),
  locator: z.string().optional(),
  detail: z.string().optional(),
});

// ─── Authoring and emission ────────────────────────────────────────────────

export const VerbSchema = z.enum(['navigate', 'click', 'fill', 'select', 'check', 'uncheck', 'press', 'hover', 'assert', 'wait']);

export const AssertionKindSchema = z.enum([
  'visible', 'hidden', 'text', 'contains-text', 'value', 'url', 'title', 'count', 'enabled', 'disabled', 'checked', 'unchecked',
]);

export const StepTargetSchema = z
  .union([
    FacetRefSchema,
    z.object({ locator: LocatorSchema, snapshotId: z.string().optional(), candidateRef: z.string().optional() }),
    z.object({ snapshotId: z.string(), candidateRef: z.string() }),
  ])
  .describe('A facet (preferred), or a locator/candidate that test.emit mints as a candidate facet.');

export const AssertionSpecSchema = z.object({
  kind: AssertionKindSchema,
  target: StepTargetSchema.optional().describe('Omitted for url and title assertions.'),
  expected: z.union([z.string(), z.number()]).optional().describe('Literal, or "@param" for an ADO parameter.'),
  rowValue: z.string().optional().describe('For a row facet target: the value that selects the row (literal or "@param").'),
});

export const ResolvedStepSchema = z.object({
  index: z.number().int().min(1),
  stepIdentifier: z.string(),
  actionText: z.string(),
  expectedText: z.string(),
  verb: VerbSchema,
  target: StepTargetSchema.optional(),
  value: z.string().optional().describe('Literal value, or "@param" for an ADO parameter.'),
  key: z.string().optional().describe('Key for press, e.g. "Enter".'),
  rowValue: z.string().optional().describe('For a row facet target: the value that selects the row (literal or "@param").'),
  screen: z.string().optional().describe('Screen the step acts on; required for navigate when the target is a route.'),
  assertions: z.array(AssertionSpecSchema).optional(),
  handoffId: z.string().optional().describe('Set when the step is unresolved; emitted as test.fixme with the reason inline.'),
});

export const HandoffBlockageSchema = z.enum([
  'ambiguous-target', 'text-mismatch', 'not-found', 'missing-data', 'auth', 'environment', 'unsupported', 'other',
]);

export const HandoffSchema = z.object({
  handoffId: z.string(),
  testCaseId: z.string(),
  stepIndex: z.number().int(),
  stepIdentifier: z.string().optional(),
  blockage: HandoffBlockageSchema,
  unresolvedIntent: z.string(),
  attempted: z.array(z.string()),
  evidence: z.object({ snapshotId: z.string().optional(), screenshotPath: z.string().optional() }),
  candidates: z.array(z.object({ ref: z.string().optional(), role: z.string().optional(), name: z.string(), why: z.string().optional() })),
  nextMoves: z.array(z.string()),
  proposedAssertion: z.string().optional(),
  raisedAt: z.string(),
  status: z.enum(['open', 'resolved']),
  adoCommentUrl: z.string().optional(),
});

// ─── Runs and reviews ──────────────────────────────────────────────────────

export const FailureTypeSchema = z
  .enum(['drift', 'candidate-bug', 'environment', 'data', 'unknown'])
  .describe('drift: a locator stopped resolving; candidate-bug: an assertion on expected text failed; environment: navigation/timeout/auth.');

export const RunStepSchema = z.object({
  index: z.number().int(),
  title: z.string(),
  outcome: z.enum(['passed', 'failed', 'skipped', 'fixme']),
  durationMs: z.number(),
  facets: z.array(z.string()),
  error: z.string().optional(),
});

export const RunReceiptSchema = z.object({
  runId: z.string(),
  at: z.string(),
  testCase: z.string().optional(),
  title: z.string(),
  spec: z.string(),
  dataRow: z.number().int().min(0).optional().describe('0-based index into TestCase.dataRows for data-driven cases.'),
  outcome: z.enum(['passed', 'failed', 'skipped', 'timedOut', 'interrupted', 'flaky']),
  durationMs: z.number(),
  retries: z.number().int(),
  error: z
    .object({ message: z.string(), family: ErrorFamilySchema, failureType: FailureTypeSchema, facet: z.string().optional() })
    .optional(),
  steps: z.array(RunStepSchema),
  trace: z.string().optional(),
  paused: z
    .object({ repairId: z.string(), cdpEndpoint: z.string(), url: z.string().optional(), failingStep: z.string().optional() })
    .optional()
    .describe('Set when pauseOnFailure held the browser open at the failure for repair in place.'),
});

export const AcceptanceReceiptSchema = z.object({
  at: z.string(),
  testCaseId: z.string(),
  decision: z.enum(['accept', 'accept-with-edit', 'reject']),
  reviewer: z.string(),
  changedLines: z.number().int().optional(),
  locatorEdited: z.boolean().optional(),
  note: z.string().optional(),
  spec: z.string().optional(),
  facetsPromoted: z.array(z.string()),
  countsAsAccepted: z.boolean().describe('accept, or accept-with-edit with ≤ 5 changed lines or only an overrides-file locator edit.'),
});

// ─── Decision receipts (optional on every mutating call) ───────────────────

export const DecisionSchema = z
  .object({
    testCase: z.string().optional(),
    step: z.number().int().optional(),
    chose: z.string().optional().describe('Candidate ref or facet id chosen.'),
    rejected: z.array(z.string()).optional(),
    reason: z.string().optional(),
    host: z
      .object({
        model: z.string().optional(),
        promptFingerprint: z.string().optional(),
        tokens: z.object({ prompt: z.number().int().optional(), completion: z.number().int().optional() }).optional(),
      })
      .optional(),
  })
  .describe('Optional: why the agent made this call. Written to the authoring receipt; never affects behavior.');

export type ErrorFamilyName = z.infer<typeof ErrorFamilySchema>;
export type LandmarkRole = z.infer<typeof LandmarkRoleSchema>;
export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;
export type LocatorScope = z.infer<typeof LocatorScopeSchema>;
export type LocatorSpec = z.infer<typeof LocatorSchema>;
export type CandidateRef = z.infer<typeof CandidateRefSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type ResolvedLocator = z.infer<typeof ResolvedLocatorSchema>;
export type NamingSource = z.infer<typeof NamingSourceSchema>;
export type Affordance = z.infer<typeof AffordanceSchema>;
export type Variant = z.infer<typeof VariantSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type PageFingerprint = z.infer<typeof PageFingerprintSchema>;
export type Hydration = z.infer<typeof HydrationSchema>;
export type Hint = z.infer<typeof HintSchema>;
export type AuditFinding = z.infer<typeof AuditFindingSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type SnapshotDelta = z.infer<typeof SnapshotDeltaSchema>;
export type TestStep = z.infer<typeof TestStepSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type FacetKind = z.infer<typeof FacetKindSchema>;
export type FacetStatus = z.infer<typeof FacetStatusSchema>;
export type FacetLocator = z.infer<typeof FacetLocatorSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Facet = z.infer<typeof FacetSchema>;
export type FacetDraft = z.infer<typeof FacetDraftSchema>;
export type ScoredFacet = z.infer<typeof ScoredFacetSchema>;
export type ScreenRoute = z.infer<typeof ScreenRouteSchema>;
export type PreflightEntry = z.infer<typeof PreflightEntrySchema>;
export type Verb = z.infer<typeof VerbSchema>;
export type AssertionKind = z.infer<typeof AssertionKindSchema>;
export type StepTarget = z.infer<typeof StepTargetSchema>;
export type AssertionSpec = z.infer<typeof AssertionSpecSchema>;
export type ResolvedStep = z.infer<typeof ResolvedStepSchema>;
export type HandoffBlockage = z.infer<typeof HandoffBlockageSchema>;
export type Handoff = z.infer<typeof HandoffSchema>;
export type FailureType = z.infer<typeof FailureTypeSchema>;
export type RunStep = z.infer<typeof RunStepSchema>;
export type RunReceipt = z.infer<typeof RunReceiptSchema>;
export type AcceptanceReceipt = z.infer<typeof AcceptanceReceiptSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type FlowParamSpec = z.infer<typeof FlowParamSchema>;
export type FlowValueSpec = z.infer<typeof FlowValueSchema>;
export type FlowRecordingStepSpec = z.infer<typeof FlowRecordingStepSchema>;
export type FlowRecordingSpec = z.infer<typeof FlowRecordingSchema>;
