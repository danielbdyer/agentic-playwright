/**
 * Dashboard MCP Server — structured tool access to Tesseract observables.
 *
 * Implements McpServerPort with handlers for all dashboard MCP tools.
 * Each tool reads from existing `.tesseract/` artifacts or routes through
 * the pending decisions Map — the same mechanism the WS adapter uses.
 *
 * This is the agent's structured projection of the spatial dashboard:
 *   Visual (human)     → SelectorGlows, ParticleTransport, FitnessCard
 *   Structured (agent)  → list_probed_elements, get_knowledge_state, get_fitness_metrics
 *
 * Same data. Different projection. Non-breaking progressive enhancement.
 */

import { Effect } from 'effect';
import type { McpServerPort, McpToolInvocation, McpToolResult, McpResource, McpResourceContent } from '../../application/ports';
import { TesseractError } from '../../domain/kernel/errors';
import type {
  LogicalProofObligationName,
  TheoremBaselineCoverage,
} from '../../domain/fitness/types';
import {
  summarizeTheoremBaseline,
  theoremBaselineCoverageForNames,
} from '../../domain/fitness/types';
import type { McpToolDefinition, ScreenCapturedEvent, WorkItemDecision } from '../../domain/observation/dashboard';
import { dashboardEvent, dashboardMcpTools } from '../../domain/observation/dashboard';
import { resolveResource, buildResourceUri } from './resource-provider';
import type { ResourceArtifactReader } from './resource-provider';
import type { PlaywrightBridgePort, BrowserAction } from './playwright-mcp-bridge';
import { RETRY_POLICIES, formatRetryMetadata, retryMetadata, retryScheduleForTaggedErrors } from '../../application/resilience/schedules';
import { writeDecisionFile } from '../dashboard/file-decision-bridge';

// ─── Actionable Errors ───

/** Structured error with recovery guidance for agent callers. */
function actionableError(error: string, suggestedAction: string, suggestedTool?: string): { error: string; suggestedAction: string; suggestedTool?: string; isError: true } {
  return { error, suggestedAction, ...(suggestedTool ? { suggestedTool } : {}), isError: true as const };
}

// ─── Phase Context ───

/** Return the current loop phase for embedding in observation responses. */
function currentPhase(options: DashboardMcpServerOptions): string {
  return options.getLoopStatus?.().phase ?? 'unknown';
}

// ─── Configuration ───

/** Default page size for paginated list responses. */
const DEFAULT_PAGE_SIZE = 100;
/** Maximum page size allowed. */
const MAX_PAGE_SIZE = 500;

function paginationArgs(args: Record<string, unknown>): { offset: number; limit: number } {
  const offset = Math.max(0, Number(args.offset) || 0);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(args.limit) || DEFAULT_PAGE_SIZE));
  return { offset, limit };
}

function paginate<T>(items: readonly T[], args: Record<string, unknown>): { items: readonly T[]; total: number; offset: number; limit: number; hasMore: boolean } {
  const { offset, limit } = paginationArgs(args);
  const page = items.slice(offset, offset + limit);
  return { items: page, total: items.length, offset, limit, hasMore: offset + limit < items.length };
}

export interface DashboardMcpServerOptions {
  /** Read a JSON artifact from the .tesseract/ directory. Returns null if not found. */
  readonly readArtifact: (relativePath: string) => unknown | null;
  /** In-memory cache of the latest screenshot. */
  readonly screenshotCache: { readonly get: () => ScreenCapturedEvent | null };
  /** Pending decisions Map — shared with the WS adapter. Resolving resumes the fiber. */
  readonly pendingDecisions: ReadonlyMap<string, (decision: WorkItemDecision) => void>;
  /** Broadcast an event to all connected WS clients. */
  readonly broadcast: (event: unknown) => void;
  /** Optional Playwright bridge for live browser interaction (headed mode). */
  readonly playwrightBridge?: PlaywrightBridgePort;

  // ─── Lifecycle callbacks (host-mode only) ───

  /** Start the speedrun loop. Returns immediately; the loop runs as a background fiber.
   *  Provided by the host process when the MCP server owns the speedrun lifecycle. */
  readonly startSpeedrun?: (config: SpeedrunStartConfig) => Promise<SpeedrunHandle>;
  /** Stop a running speedrun. Interrupts the background fiber. */
  readonly stopSpeedrun?: () => Promise<void>;
  /** Get the current loop status from the host process. */
  readonly getLoopStatus?: () => LoopStatus;

  // ─── Knowledge contribution callbacks (host-mode only) ───

  /** Write a hint to a screen's hints.yaml file. Returns the written path. */
  readonly writeHint?: (params: HintContribution) => string | null;
  /** Decisions directory for file-backed cross-process decisions (standalone mode fallback).
   *  When no in-memory resolver exists for a work item, the server writes a decision file
   *  to this directory. A running --mcp-decisions speedrun watches for these files. */
  readonly decisionsDir?: string | undefined;
  /** Write a locator alias to a screen's hints.yaml file. Returns the written path. */
  readonly writeLocatorAlias?: (params: LocatorAliasContribution) => string | null;
}

/** Configuration for starting a speedrun via MCP tool. */
export interface SpeedrunStartConfig {
  readonly count?: number | undefined;
  readonly seeds?: readonly string[] | undefined;
  readonly maxIterations?: number | undefined;
  readonly knowledgePosture?: string | undefined;
  readonly interpreterMode?: string | undefined;
}

/** Handle to a running speedrun fiber. */
export interface SpeedrunHandle {
  readonly status: 'started';
  readonly seeds: readonly string[];
  readonly maxIterations: number;
}

/** Status of the speedrun loop. */
export interface LoopStatus {
  readonly phase: 'idle' | 'running' | 'paused-for-decisions' | 'completed' | 'failed';
  readonly iteration?: number | undefined;
  readonly maxIterations?: number | undefined;
  readonly pendingDecisionCount?: number | undefined;
  readonly elapsedMs?: number | undefined;
  readonly error?: string | undefined;
  readonly lastProgress?: unknown;
}

/** Hint contribution from an agent. */
export interface HintContribution {
  readonly screen: string;
  readonly element: string;
  readonly hint: string;
  readonly confidence?: number | undefined;
}

/** Locator alias contribution from an agent. */
export interface LocatorAliasContribution {
  readonly screen: string;
  readonly element: string;
  readonly alias: string;
  readonly source?: string | undefined;
}

// ─── Pure Tool Handlers ───
// Each handler is a pure function: (args, options) → result.
// No side effects except reading artifacts and resolving pending decisions.

type ToolHandler = (
  args: Record<string, unknown>,
  options: DashboardMcpServerOptions,
) => unknown;

const listProbedElements: ToolHandler = (args, options) => {
  const workbench = options.readArtifact('.tesseract/workbench/index.json') as {
    readonly items?: readonly { readonly id: string; readonly context: Record<string, unknown>; readonly evidence: Record<string, unknown> }[];
  } | null;
  if (!workbench?.items) return { elements: [], count: 0 };

  const screenFilter = args.screen as string | undefined;
  const elements = workbench.items
    .filter((item) => !screenFilter || item.context?.screen === screenFilter)
    .map((item) => ({
      id: item.id,
      element: item.context?.element ?? null,
      screen: item.context?.screen ?? null,
      confidence: (item.evidence as { confidence?: number })?.confidence ?? 0,
      sources: (item.evidence as { sources?: readonly string[] })?.sources ?? [],
    }));

  const page = paginate(elements, args);
  return { elements: page.items, count: page.total, offset: page.offset, limit: page.limit, hasMore: page.hasMore };
};

const getScreenCapture: ToolHandler = (_args, options) => {
  const cached = options.screenshotCache.get();
  return cached ?? { error: 'No screenshot available yet', available: false };
};

const getKnowledgeState: ToolHandler = (args, options) => {
  const graph = options.readArtifact('.tesseract/graph/index.json') as {
    readonly nodes?: readonly Record<string, unknown>[];
    readonly edges?: readonly Record<string, unknown>[];
  } | null;
  if (!graph) return { screens: [], totalNodes: 0 };

  const screenFilter = args.screen as string | undefined;
  const nodes = graph.nodes ?? [];
  const filtered = screenFilter
    ? nodes.filter((n) => matchesScreenFilter(n, screenFilter))
    : nodes;
  const screenSummary = screenFilter
    ? summarizeScreenKnowledge(findScreenNode(nodes, screenFilter), screenFilter)
    : null;

  const page = paginate(filtered, args);
  return {
    nodes: page.items,
    screenSummary,
    totalNodes: page.total,
    totalEdges: (graph.edges ?? []).length,
    offset: page.offset,
    limit: page.limit,
    hasMore: page.hasMore,
  };
};

const getQueueItems: ToolHandler = (args, options) => {
  const workbench = options.readArtifact('.tesseract/workbench/index.json') as {
    readonly items?: readonly Record<string, unknown>[];
    readonly summary?: Record<string, unknown>;
  } | null;
  if (!workbench?.items) return { items: [], count: 0 };

  const statusFilter = (args.status as string) ?? 'all';
  let items: readonly Record<string, unknown>[];
  if (statusFilter === 'all') {
    items = workbench.items;
  } else {
    const completedIds = new Set(
      readWorkbenchCompletions(options)
        .map((completion) => asString(completion.workItemId))
        .filter((value): value is string => value !== null),
    );
    items = workbench.items.filter((item) =>
      statusFilter === 'pending'
        ? !completedIds.has(item.id as string)
        : completedIds.has(item.id as string),
    );
  }

  const page = paginate(items, args);
  return { items: page.items, count: page.total, offset: page.offset, limit: page.limit, hasMore: page.hasMore, summary: workbench.summary ?? null };
};

const getFitnessMetrics: ToolHandler = (_args, options) => {
  const scorecard = options.readArtifact('.tesseract/benchmarks/scorecard.json') as {
    readonly highWaterMark?: Record<string, unknown>;
    readonly history?: readonly Record<string, unknown>[];
  } | null;
  return scorecard?.highWaterMark ?? { error: 'No scorecard available yet' };
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): readonly string[] {
  return asArray(value).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function matchesScreenFilter(node: Record<string, unknown>, screen: string): boolean {
  const nodeScreen = asString(node.screen);
  const nodeId = asString(node.id);
  return nodeScreen === screen || nodeId?.includes(screen) === true;
}

function routeVariantsForScreenNode(node: JsonRecord | null): readonly JsonRecord[] {
  const payload = asRecord(node?.payload);
  return asArray(payload?.routeVariants)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null);
}

function expectedEntryStateRefsForVariant(variant: JsonRecord): readonly string[] {
  const expected = asRecord(variant.expectedEntryState);
  return asStringArray(expected?.requiredStateRefs);
}

function variantSuccessCount(variant: JsonRecord): number {
  const historical = asRecord(variant.historicalSuccess);
  return asNumber(historical?.successCount) ?? 0;
}

function variantFailureCount(variant: JsonRecord): number {
  const historical = asRecord(variant.historicalSuccess);
  return asNumber(historical?.failureCount) ?? 0;
}

function variantLastSuccessAt(variant: JsonRecord): string | null {
  const historical = asRecord(variant.historicalSuccess);
  return asString(historical?.lastSuccessAt);
}

function summarizeScreenKnowledge(node: JsonRecord | null, screen: string) {
  const routeVariants = routeVariantsForScreenNode(node);
  const expectedEntryStateRefs = [...new Set(routeVariants.flatMap((variant) => expectedEntryStateRefsForVariant(variant)))];
  const latestSuccessfulRouteAt = routeVariants
    .map((variant) => variantLastSuccessAt(variant))
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;
  return {
    screen,
    routeVariantCount: routeVariants.length,
    expectedEntryStateRefs,
    successfulRouteVariants: routeVariants.filter((variant) => variantSuccessCount(variant) > 0).length,
    totalRecordedRouteSuccess: routeVariants.reduce((sum, variant) => sum + variantSuccessCount(variant), 0),
    totalRecordedRouteFailures: routeVariants.reduce((sum, variant) => sum + variantFailureCount(variant), 0),
    latestSuccessfulRouteAt,
    routeVariants: routeVariants.map((variant) => ({
      url: asString(variant.url),
      pathTemplate: asString(variant.pathTemplate),
      tab: asString(variant.tab),
      queryKeys: Object.keys(asRecord(variant.query) ?? {}),
      expectedEntryStateRefs: expectedEntryStateRefsForVariant(variant),
      successCount: variantSuccessCount(variant),
      failureCount: variantFailureCount(variant),
      lastSuccessAt: variantLastSuccessAt(variant),
    })),
  };
}

function findScreenNode(nodes: readonly JsonRecord[], screen: string): JsonRecord | null {
  return nodes.find((node) => asString(node.kind) === 'screen' && asString(node.screen) === screen) ?? null;
}

function countBy(
  values: readonly JsonRecord[],
  select: (value: JsonRecord) => string | null,
): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = select(value);
    return key === null
      ? acc
      : { ...acc, [key]: (acc[key] ?? 0) + 1 };
  }, {});
}

function readWorkbenchCompletions(options: DashboardMcpServerOptions): readonly JsonRecord[] {
  const completions = options.readArtifact('.tesseract/workbench/completions.json') as {
    readonly entries?: readonly JsonRecord[];
    readonly completions?: readonly JsonRecord[];
  } | null;
  return completions?.entries ?? completions?.completions ?? [];
}

function readInboxItems(options: DashboardMcpServerOptions): readonly JsonRecord[] {
  const inbox = options.readArtifact('.tesseract/inbox/index.json') as {
    readonly items?: readonly JsonRecord[];
  } | null;
  return inbox?.items ?? [];
}

function proposalCategories(proposals: readonly JsonRecord[]): Record<string, number> {
  return proposals.reduce<Record<string, number>>((acc, proposal) => {
    const category = asString(proposal.category) ?? 'uncategorized';
    return { ...acc, [category]: (acc[category] ?? 0) + 1 };
  }, {});
}

function requestedParticipation(item: JsonRecord): string | null {
  return asString(asRecord(item.handoff)?.requestedParticipation)
    ?? asString(item.requestedParticipation);
}

function handoffStalenessStatus(item: JsonRecord): string | null {
  return asString(asRecord(asRecord(item.handoff)?.staleness)?.status);
}

function handoffChain(item: JsonRecord): JsonRecord | null {
  return asRecord(asRecord(item.handoff)?.chain);
}

function inboxItemForWorkItem(workItem: JsonRecord, inboxItems: readonly JsonRecord[]): JsonRecord | null {
  const context = asRecord(workItem.context) ?? {};
  const proposalId = asString(context.proposalId);
  const adoId = asString(workItem.adoId);
  const runId = asString(workItem.runId) ?? asString(context.runId);
  const stepIndex = asNumber(context.stepIndex);

  return inboxItems.find((item) =>
    (proposalId !== null && asString(item.proposalId) === proposalId)
    || (
      adoId !== null
      && asString(item.adoId) === adoId
      && (runId === null || asString(item.runId) === runId)
      && (stepIndex === null || asNumber(item.stepIndex) === stepIndex)
    )
  ) ?? null;
}

function summarizeInboxItems(items: readonly JsonRecord[]) {
  const actionable = items.filter((item) => asString(item.status) === 'actionable').length;
  const staleCount = items.filter((item) => handoffStalenessStatus(item) === 'stale').length;
  const chainDepths = items
    .map((item) => asNumber(handoffChain(item)?.depth))
    .filter((value): value is number => value !== null);
  const multiActorChainCount = chainDepths.filter((depth) => depth > 1).length;
  const driftDetectedCount = items.filter((item) => {
    const chain = handoffChain(item);
    const semanticCore = asRecord(asRecord(item.handoff)?.semanticCore);
    return asBoolean(chain?.semanticCorePreserved) === false || asString(semanticCore?.driftStatus) === 'drift-detected';
  }).length;
  const competingCandidateCount = items.reduce(
    (sum, item) => sum + asArray(asRecord(item.handoff)?.competingCandidates).length,
    0,
  );
  const nextMoveCount = items.reduce(
    (sum, item) => sum + asArray(asRecord(item.handoff)?.nextMoves).length,
    0,
  );
  const totalPayloadSizeBytes = items.reduce(
    (sum, item) => sum + (asNumber(asRecord(asRecord(item.handoff)?.tokenImpact)?.payloadSizeBytes) ?? 0),
    0,
  );
  const totalEstimatedReadTokens = items.reduce(
    (sum, item) => sum + (asNumber(asRecord(asRecord(item.handoff)?.tokenImpact)?.estimatedReadTokens) ?? 0),
    0,
  );

  return {
    total: items.length,
    actionable,
    staleCount,
    byParticipation: countBy(items, requestedParticipation),
    byBlockageType: countBy(items, (item) => asString(asRecord(item.handoff)?.blockageType)),
    byEpistemicStatus: countBy(items, (item) => asString(asRecord(item.handoff)?.epistemicStatus)),
    byBlastRadius: countBy(items, (item) => asString(asRecord(item.handoff)?.blastRadius)),
    byStalenessStatus: countBy(items, handoffStalenessStatus),
    multiActorChainCount,
    maxChainDepth: chainDepths.length > 0 ? Math.max(...chainDepths) : 0,
    driftDetectedCount,
    competingCandidateCount,
    nextMoveCount,
    totalPayloadSizeBytes,
    totalEstimatedReadTokens,
  };
}

function handoffIntegrityProofObligation(items: readonly JsonRecord[]) {
  if (items.length === 0) {
    return {
      obligation: 'handoff-integrity',
      propertyRefs: ['H'],
      score: 1,
      status: 'healthy',
      evidence: 'No active handoffs require integrity preservation right now.',
    } as const;
  }

  const populated = items
    .map((item) => asRecord(item.handoff))
    .filter((handoff): handoff is JsonRecord => handoff !== null);
  const ratio = (count: number): number => count / Math.max(items.length, 1);
  const requestedParticipationCoverage = ratio(populated.filter((handoff) => asString(handoff.requestedParticipation) !== null).length);
  const epistemicStatusCoverage = ratio(populated.filter((handoff) => asString(handoff.epistemicStatus) !== null).length);
  const semanticCoreCoverage = ratio(populated.filter((handoff) => asString(asRecord(handoff.semanticCore)?.token) !== null).length);
  const stalenessCoverage = ratio(populated.filter((handoff) => asString(asRecord(handoff.staleness)?.status) !== null).length);
  const nextMoveCoverage = ratio(populated.filter((handoff) => asArray(handoff.nextMoves).length > 0).length);
  const tokenImpactCoverage = ratio(populated.filter((handoff) => asNumber(asRecord(handoff.tokenImpact)?.estimatedReadTokens) !== null).length);
  const chainCoverage = ratio(populated.filter((handoff) => {
    const chain = asRecord(handoff.chain);
    return asNumber(chain?.depth) !== null
      && asBoolean(chain?.semanticCorePreserved) !== null
      && asBoolean(chain?.driftDetectable) !== null
      && asNumber(chain?.competingCandidateCount) !== null;
  }).length);
  const chainPreservationCoverage = ratio(populated.filter((handoff) => asBoolean(asRecord(handoff.chain)?.semanticCorePreserved) === true).length);
  const evidenceCoverage = ratio(populated.filter((handoff) => {
    const evidenceSlice = asRecord(handoff.evidenceSlice);
    return asArray(evidenceSlice?.artifactPaths).length > 0 || asArray(evidenceSlice?.summaries).length > 0;
  }).length);
  const stalePenalty = ratio(items.filter((item) => handoffStalenessStatus(item) === 'stale').length);
  const completeness = (
    requestedParticipationCoverage +
    epistemicStatusCoverage +
    semanticCoreCoverage +
    stalenessCoverage +
    nextMoveCoverage +
    tokenImpactCoverage +
    chainCoverage +
    evidenceCoverage
  ) / 8;
  const risk = Math.max(0, Math.min(1, (1 - completeness) + stalePenalty * 0.25 + (1 - chainPreservationCoverage) * 0.1));
  return {
    obligation: 'handoff-integrity',
    propertyRefs: ['H'],
    score: Number((1 - risk).toFixed(4)),
    status: risk >= 0.7 ? 'critical' : risk >= 0.3 ? 'watch' : 'healthy',
    evidence: `coverage(requested=${requestedParticipationCoverage.toFixed(2)}, epistemic=${epistemicStatusCoverage.toFixed(2)}, semantic=${semanticCoreCoverage.toFixed(2)}, staleness=${stalenessCoverage.toFixed(2)}, nextMoves=${nextMoveCoverage.toFixed(2)}, tokenImpact=${tokenImpactCoverage.toFixed(2)}, chain=${chainCoverage.toFixed(2)}, evidenceSlice=${evidenceCoverage.toFixed(2)}), chainPreserved=${chainPreservationCoverage.toFixed(2)}, stalePenalty=${stalePenalty.toFixed(2)}`,
  } as const;
}

function actorChainCoherenceProofObligation(items: readonly JsonRecord[]) {
  if (items.length === 0) {
    return {
      obligation: 'actor-chain-coherence',
      propertyRefs: ['A'],
      score: 1,
      status: 'healthy',
      evidence: 'No active continuation chains require cross-actor coherence checks right now.',
    } as const;
  }

  const populated = items
    .map((item) => asRecord(item.handoff))
    .filter((handoff): handoff is JsonRecord => handoff !== null);
  const ratio = (count: number, total: number): number => count / Math.max(total, 1);
  const chainReady = populated.filter((handoff) => {
    const chain = asRecord(handoff.chain);
    return asNumber(chain?.depth) !== null
      && asBoolean(chain?.semanticCorePreserved) !== null
      && asBoolean(chain?.driftDetectable) !== null;
  });
  const multiActor = chainReady.filter((handoff) => (asNumber(asRecord(handoff.chain)?.depth) ?? 0) > 1);
  const coherentChains = multiActor.filter((handoff) => {
    const chain = asRecord(handoff.chain);
    return asBoolean(chain?.semanticCorePreserved) === true || asBoolean(chain?.driftDetectable) === true;
  });
  const nextMoveCoverage = ratio(
    populated.filter((handoff) => asArray(handoff.nextMoves).length > 0).length,
    populated.length,
  );
  const candidateScoped = populated.filter((handoff) => asArray(handoff.competingCandidates).length > 0);
  const candidatePreservationCoverage = candidateScoped.length === 0
    ? 1
    : ratio(
      candidateScoped.filter((handoff) => {
        const chain = asRecord(handoff.chain);
        return (asNumber(chain?.competingCandidateCount) ?? -1) === asArray(handoff.competingCandidates).length;
      }).length,
      candidateScoped.length,
    );
  const chainCoverage = ratio(chainReady.length, populated.length);
  const multiActorCoherence = multiActor.length === 0 ? 1 : ratio(coherentChains.length, multiActor.length);
  const risk = Math.max(
    0,
    Math.min(
      1,
      ((1 - chainCoverage) * 0.45)
      + ((1 - multiActorCoherence) * 0.35)
      + ((1 - nextMoveCoverage) * 0.1)
      + ((1 - candidatePreservationCoverage) * 0.1),
    ),
  );

  return {
    obligation: 'actor-chain-coherence',
    propertyRefs: ['A'],
    score: Number((1 - risk).toFixed(4)),
    status: risk >= 0.7 ? 'critical' : risk >= 0.3 ? 'watch' : 'healthy',
    evidence: `coverage(chain=${chainCoverage.toFixed(2)}, multiActorCoherence=${multiActorCoherence.toFixed(2)}, nextMoves=${nextMoveCoverage.toFixed(2)}, competingCandidates=${candidatePreservationCoverage.toFixed(2)}), multiActorCount=${multiActor.length}`,
  } as const;
}

function scorecardProofObligations(highWaterMark: JsonRecord | null | undefined): readonly JsonRecord[] {
  return asArray(highWaterMark?.proofObligations)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null);
}

function mergeProofObligations(
  scorecardObligations: readonly JsonRecord[],
  inboxItems: readonly JsonRecord[],
): readonly JsonRecord[] {
  return [
    ...scorecardObligations,
    handoffIntegrityProofObligation(inboxItems),
    actorChainCoherenceProofObligation(inboxItems),
  ];
}

function proofObligationNames(obligations: readonly JsonRecord[]): ReadonlySet<LogicalProofObligationName> {
  return new Set(
    obligations
      .map((obligation) => asString(obligation.obligation))
      .filter((value): value is LogicalProofObligationName => value !== null),
  );
}

function theoremBaselineCoverage(obligations: readonly JsonRecord[]): readonly TheoremBaselineCoverage[] {
  return theoremBaselineCoverageForNames(proofObligationNames(obligations));
}

function summarizeProofObligations(obligations: readonly JsonRecord[]) {
  const byStatus = countBy(obligations, (obligation) => asString(obligation.status));
  return {
    total: obligations.length,
    byStatus,
    critical: byStatus.critical ?? 0,
    watch: byStatus.watch ?? 0,
    healthy: byStatus.healthy ?? 0,
    criticalObligations: obligations
      .filter((obligation) => asString(obligation.status) === 'critical')
      .map((obligation) => asString(obligation.obligation))
      .filter((value): value is string => value !== null),
  };
}

function theoremBaselineHistory(scorecard: {
  readonly history?: readonly JsonRecord[];
} | null | undefined) {
  const entries = asArray(scorecard?.history)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null)
    .flatMap((entry) => {
      const summary = asRecord(entry.theoremBaselineSummary);
      const direct = asNumber(summary?.direct);
      const proxy = asNumber(summary?.proxy);
      const missing = asNumber(summary?.missing);
      return direct === null || proxy === null || missing === null
        ? []
        : [{
          runAt: asString(entry.runAt),
          pipelineVersion: asString(entry.pipelineVersion),
          improved: asBoolean(entry.improved),
          direct,
          proxy,
          missing,
        }];
    });

  if (entries.length === 0) {
    return {
      entries,
      latest: null,
      direction: 'unknown' as const,
    };
  }

  const first = entries[0]!;
  const last = entries[entries.length - 1]!;
  const directDelta = last.direct - first.direct;
  const missingDelta = last.missing - first.missing;
  const direction = directDelta > 0 || missingDelta < 0
    ? 'improving'
    : directDelta < 0 || missingDelta > 0
      ? 'degrading'
      : 'stable';

  return {
    entries,
    latest: last,
    direction,
  };
}

function suggestedActionForParticipation(
  participation: string | null,
  confidence: number,
): 'approve' | 'investigate' | 'skip' {
  if (participation === 'approve') return 'approve';
  if (participation === 'defer') return 'skip';
  if (participation !== null) return 'investigate';
  return confidence >= 0.8 ? 'approve'
    : confidence >= 0.4 ? 'investigate'
    : 'skip';
}

/**
 * Atomically claim a pending decision resolver: get + delete in one step.
 * Prevents race conditions when two agents approve/skip the same item concurrently.
 */
function claimResolver(pendingDecisions: ReadonlyMap<string, (d: WorkItemDecision) => void>, workItemId: string): ((d: WorkItemDecision) => void) | null {
  const map = pendingDecisions as Map<string, (d: WorkItemDecision) => void>;
  const resolver = map.get(workItemId);
  if (!resolver) return null;
  map.delete(workItemId);
  return resolver;
}

const approveWorkItem: ToolHandler = (args, options) => {
  const workItemId = args.workItemId as string;
  if (!workItemId) return { error: 'workItemId is required', isError: true };

  const decision: WorkItemDecision = {
    workItemId,
    status: 'completed',
    rationale: (args.rationale as string) ?? 'Approved via MCP tool',
  };

  // Try in-memory resolver first (host-mode: MCP server owns the speedrun fiber)
  const resolver = claimResolver(options.pendingDecisions, workItemId);
  if (resolver) {
    resolver(decision);
    options.broadcast(dashboardEvent('item-completed', decision));
    return { ok: true, workItemId, status: 'completed', mode: 'in-memory' };
  }

  // Fall back to file-based decision bridge (standalone mode: separate speedrun process)
  if (options.decisionsDir) {
    writeDecisionFile(options.decisionsDir, decision);
    return { ok: true, workItemId, status: 'completed', mode: 'file-bridge', writtenTo: options.decisionsDir };
  }

  return actionableError(
    `No pending decision for ${workItemId} and no file-bridge configured`,
    "Call get_queue_items with status='pending' to see current pending items, or get_loop_status to check the loop phase.",
    'get_queue_items',
  );
};

const skipWorkItem: ToolHandler = (args, options) => {
  const workItemId = args.workItemId as string;
  if (!workItemId) return { error: 'workItemId is required', isError: true };

  const decision: WorkItemDecision = {
    workItemId,
    status: 'skipped',
    rationale: (args.rationale as string) ?? 'Skipped via MCP tool',
  };

  // Try in-memory resolver first (host-mode)
  const resolver = claimResolver(options.pendingDecisions, workItemId);
  if (resolver) {
    resolver(decision);
    options.broadcast(dashboardEvent('item-completed', decision));
    return { ok: true, workItemId, status: 'skipped', mode: 'in-memory' };
  }

  // Fall back to file-based decision bridge (standalone mode)
  if (options.decisionsDir) {
    writeDecisionFile(options.decisionsDir, decision);
    return { ok: true, workItemId, status: 'skipped', mode: 'file-bridge', writtenTo: options.decisionsDir };
  }

  return actionableError(
    `No pending decision for ${workItemId} and no file-bridge configured`,
    "Call get_queue_items with status='pending' to see current pending items, or get_loop_status to check the loop phase.",
    'get_queue_items',
  );
};

const getIterationStatus: ToolHandler = (_args, options) => {
  const progressFile = options.readArtifact('.tesseract/runs/speedrun-progress.jsonl');
  if (!progressFile || typeof progressFile !== 'string') {
    return { error: 'No progress data available', phase: 'idle' };
  }
  // Extract only the last line without splitting entire file into array
  const trimmed = progressFile.trimEnd();
  const lastNewline = trimmed.lastIndexOf('\n');
  const lastLine = lastNewline === -1 ? trimmed : trimmed.slice(lastNewline + 1);
  try { return JSON.parse(lastLine); }
  catch { return { error: 'Could not parse progress data', phase: 'unknown' }; }
};

// ─── Resource-backed Tool Handlers (W3.3) ───

const asReader = (options: DashboardMcpServerOptions): ResourceArtifactReader => ({
  readArtifact: options.readArtifact,
});

const getProposal: ToolHandler = (args, options) => {
  const id = (args.proposalId ?? args.id) as string;
  if (!id) return { error: 'proposalId is required', isError: true };
  const response = resolveResource(buildResourceUri('proposal', id), asReader(options));
  return response.found ? response.data : { ...(response.data as Record<string, unknown>), isError: true };
};

const listProposalsHandler: ToolHandler = (args, options) => {
  const reader = asReader(options);
  const proposals = reader.readArtifact('.tesseract/learning/proposals.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  const indexProposals = reader.readArtifact('.tesseract/learning/proposals/index.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  const all = [
    ...(proposals?.proposals ?? []),
    ...(indexProposals?.proposals ?? []),
  ];
  const statusFilter = (args.status as string) ?? 'all';
  const filtered = statusFilter === 'all'
    ? all
    : all.filter((p) => (p.status as string) === statusFilter);
  const page = paginate(filtered, args);
  return { proposals: page.items, count: page.total, offset: page.offset, limit: page.limit, hasMore: page.hasMore };
};

const getBottleneck: ToolHandler = (args, options) => {
  const screen = args.screen as string;
  if (!screen) return actionableError('screen is required', 'Call list_screens to see available screen IDs.', 'list_screens');
  const response = resolveResource(buildResourceUri('bottleneck', screen), asReader(options));
  return response.data;
};

const getRun: ToolHandler = (args, options) => {
  const runId = args.runId as string;
  if (!runId) return { error: 'runId is required', isError: true };
  const response = resolveResource(buildResourceUri('run', runId), asReader(options));
  return response.found ? response.data : { ...response.data as object, isError: true };
};

const getResolutionGraph: ToolHandler = (args, options) => {
  const graph = options.readArtifact('.tesseract/graph/index.json') as {
    readonly nodes?: readonly Record<string, unknown>[];
    readonly edges?: readonly Record<string, unknown>[];
  } | null;
  if (!graph) return { nodes: [], edges: [], totalNodes: 0, totalEdges: 0 };
  const screenFilter = args.screen as string | undefined;
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];
  const filteredNodes = screenFilter
    ? nodes.filter((n) => (n.screen as string) === screenFilter)
    : nodes;
  const page = paginate(filteredNodes, args);
  return { nodes: page.items, edges: edges.slice(0, MAX_PAGE_SIZE), totalNodes: page.total, totalEdges: edges.length, offset: page.offset, limit: page.limit, hasMore: page.hasMore };
};

const getTaskResolution: ToolHandler = (args, options) => {
  const taskId = args.taskId as string;
  if (!taskId) return { error: 'taskId is required', isError: true };
  const resolution = options.readArtifact(`.tesseract/tasks/${taskId}.resolution.json`);
  return resolution ?? actionableError(`Resolution for ${taskId} not found`, 'Call get_queue_items to find valid task IDs, or get_resolution_graph to explore the graph.', 'get_queue_items');
};

const listScreens: ToolHandler = (_args, options) => {
  const graph = options.readArtifact('.tesseract/graph/index.json') as {
    readonly nodes?: readonly Record<string, unknown>[];
  } | null;
  if (!graph?.nodes) return { screens: [], count: 0 };
  const screenMap = new Map<string, number>();
  const screenNodes = new Map<string, JsonRecord>();
  for (const node of graph.nodes) {
    const screen = (node.screen as string) ?? 'unknown';
    screenMap.set(screen, (screenMap.get(screen) ?? 0) + 1);
    if ((node.kind as string) === 'screen' && !screenNodes.has(screen)) {
      screenNodes.set(screen, node);
    }
  }
  const screens = Array.from(screenMap.entries()).map(([screen, elementCount]) => ({
    elementCount,
    ...summarizeScreenKnowledge(screenNodes.get(screen) ?? null, screen),
  }));
  return { screens, count: screens.length };
};

// ─── Browser Tool Handlers (Playwright MCP bridge) ───
// These delegate to the PlaywrightBridgePort when available.
// When no bridge is injected, they return a structured error.

const executeBrowserAction = (
  action: BrowserAction,
  options: DashboardMcpServerOptions,
): unknown => {
  const bridge = options.playwrightBridge;
  if (!bridge) return { error: 'Playwright bridge not available (headless mode)', available: false, suggestedAction: 'Start speedrun with headed: true to enable browser tools, or use observation tools (get_screen_capture, list_probed_elements) instead.' };
  const startedAt = Date.now();
  let attempts = 0;
  let result: unknown = null;
  Effect.runSync(
    Effect.suspend(() => {
      attempts += 1;
      return bridge.execute(action);
    }).pipe(
      Effect.retryOrElse(
        retryScheduleForTaggedErrors(
          RETRY_POLICIES.playwrightBridgeTransient,
          (error) => error._tag === 'PlaywrightBridgeTransientError',
        ),
        (error) => Effect.fail(error),
      ),
      Effect.tap((r) => Effect.sync(() => { result = r; })),
      Effect.catchAll((err) => Effect.sync(() => {
        result = {
          error: String(err),
          success: false,
          retry: formatRetryMetadata(
            retryMetadata(RETRY_POLICIES.playwrightBridgeTransient, attempts, startedAt, true),
          ),
        };
      })),
    ),
  );
  return result;
};

const browserScreenshot: ToolHandler = (_args, options) =>
  executeBrowserAction({ kind: 'screenshot' }, options);

const browserQuery: ToolHandler = (args, options) =>
  executeBrowserAction({ kind: 'query', selector: args.selector as string }, options);

const browserAriaSnapshot: ToolHandler = (_args, options) =>
  executeBrowserAction({ kind: 'aria-snapshot' }, options);

const browserClick: ToolHandler = (args, options) =>
  executeBrowserAction({ kind: 'click', selector: args.selector as string }, options);

const browserFill: ToolHandler = (args, options) =>
  executeBrowserAction({ kind: 'fill', selector: args.selector as string, value: args.value as string }, options);

const browserNavigate: ToolHandler = (args, options) =>
  executeBrowserAction({ kind: 'navigate', url: args.url as string }, options);

// ─── Decision Context Enrichment ───

const getDecisionContext: ToolHandler = (args, options) => {
  const workItemId = args.workItemId as string;
  if (!workItemId) return { error: 'workItemId is required', isError: true };

  // 1. Find the work item
  const workbench = options.readArtifact('.tesseract/workbench/index.json') as {
    readonly items?: readonly Record<string, unknown>[];
  } | null;
  const workItem = workbench?.items?.find((i) => (i.id as string) === workItemId);
  if (!workItem) return actionableError(`Work item ${workItemId} not found`, 'Call get_queue_items to see available work items, or get_loop_status to check if a speedrun is running.', 'get_queue_items');

  // 2. Check completion status
  const completion = readWorkbenchCompletions(options).find((entry) => asString(entry.workItemId) === workItemId) ?? null;

  // 3. Resolve linked proposals
  const reader = asReader(options);
  const linkedProposals = ((workItem.linkedProposals ?? []) as readonly string[]).map((id) => {
    const response = resolveResource(buildResourceUri('proposal', id), reader);
    return response.found ? response.data : { id, error: 'not found' };
  });

  // 4. Resolve the primary proposal (from context)
  const ctx = workItem.context as Record<string, unknown> | undefined;
  const primaryProposal = ctx?.proposalId
    ? (() => { const r = resolveResource(buildResourceUri('proposal', ctx.proposalId as string), reader); return r.found ? r.data : null; })()
    : null;

  // 5. Resolve linked bottlenecks
  const linkedBottlenecks = ((workItem.linkedBottlenecks ?? []) as readonly string[]).map((screen) => {
    const response = resolveResource(buildResourceUri('bottleneck', screen), reader);
    return response.data;
  });

  // 6. Load evidence artifacts
  const artifactRefs = ((ctx?.artifactRefs ?? []) as readonly string[]).slice(0, 5); // Cap at 5 to avoid huge responses
  const evidence = artifactRefs.map((ref) => {
    const data = options.readArtifact(ref);
    return data ? { path: ref, data } : { path: ref, error: 'not found' };
  });

  // 7. Load task resolution if ADO ID is present
  const adoId = workItem.adoId as string | null;
  const taskResolution = adoId ? options.readArtifact(`.tesseract/tasks/${adoId}.resolution.json`) : null;

  // 8. Resolve matching inbox handoff if present
  const inboxItem = inboxItemForWorkItem(workItem, readInboxItems(options));
  const handoff = asRecord(inboxItem?.handoff) ?? null;
  const participation = handoff !== null
    ? asString(handoff.requestedParticipation)
    : asString(inboxItem?.requestedParticipation);
  const staleness = asRecord(handoff?.staleness) ?? null;
  const competingCandidates = asArray(handoff?.competingCandidates);

  // 9. Screenshot (if available)
  const screenshot = options.screenshotCache.get();

  // 10. Derive suggested action from handoff semantics, then confidence
  const confidence = ((workItem.evidence as Record<string, unknown>)?.confidence as number) ?? 0;
  const suggestedAction = completion ? 'already-decided' : suggestedActionForParticipation(participation, confidence);
  const suggestedRationale = completion
    ? `Already ${asString(completion.status) ?? 'completed'}: ${asString(completion.rationale) ?? 'No rationale recorded.'}`
    : suggestedAction === 'approve'
      ? participation === 'approve'
        ? `Handoff explicitly requests approval${staleness !== null ? ` (${asString(staleness.status) ?? 'unknown'} staleness)` : ''}.`
        : `High confidence (${confidence}) — evidence supports approval.`
      : suggestedAction === 'investigate'
        ? participation !== null
          ? `Handoff requests ${participation}; review the evidence slice, next moves, and any competing candidates before deciding.`
          : `Medium confidence (${confidence}) — review linked proposals and bottlenecks before deciding.`
        : participation === 'defer'
          ? 'Handoff is explicitly defer-oriented; skipping is safer than forcing approval.'
          : `Low confidence (${confidence}) — insufficient evidence, consider skipping.`;

  return {
    workItem,
    completion,
    primaryProposal,
    linkedProposals,
    linkedBottlenecks,
    inboxItem,
    handoff,
    evidence,
    taskResolution,
    screenshot: screenshot ? { available: true, width: screenshot.width, height: screenshot.height, url: screenshot.url } : { available: false },
    suggestedAction,
    suggestedRationale,
    requestedParticipation: participation,
    staleness,
    competingCandidateCount: competingCandidates.length,
  };
};

// ─── Lifecycle Tool Handlers ───

const startSpeedrun: ToolHandler = (args, options) => {
  if (!options.startSpeedrun) return actionableError('Speedrun lifecycle not available (standalone mode)', 'Server must run via bin/tesseract-mcp.ts for lifecycle control. Observation tools that read .tesseract/ artifacts still work.');
  const status = options.getLoopStatus?.();
  if (status?.phase === 'running' || status?.phase === 'paused-for-decisions') {
    return { error: `Speedrun already ${status.phase}. Stop it first with stop_speedrun.`, isError: true };
  }
  const config: SpeedrunStartConfig = {
    count: args.count as number | undefined,
    seeds: args.seeds as string[] | undefined,
    maxIterations: args.maxIterations as number | undefined,
    knowledgePosture: args.knowledgePosture as string | undefined,
    interpreterMode: args.interpreterMode as string | undefined,
  };
  // Mark as async — the tool returns a promise indicator, not the final result.
  // The actual speedrun runs as a background fiber; use get_loop_status to monitor.
  options.startSpeedrun(config).catch(() => { /* errors tracked via getLoopStatus */ });
  return { ok: true, status: 'starting', message: 'Speedrun starting as background fiber. Use get_loop_status to monitor progress.' };
};

const stopSpeedrun: ToolHandler = (_args, options) => {
  if (!options.stopSpeedrun) return actionableError('Speedrun lifecycle not available (standalone mode)', 'Server must run via bin/tesseract-mcp.ts for lifecycle control. Observation tools that read .tesseract/ artifacts still work.');
  const status = options.getLoopStatus?.();
  if (!status || status.phase === 'idle' || status.phase === 'completed' || status.phase === 'failed') {
    return { error: `No active speedrun to stop (phase: ${status?.phase ?? 'idle'})`, isError: true };
  }
  options.stopSpeedrun().catch(() => { /* cleanup errors are non-fatal */ });
  return { ok: true, status: 'stopping', message: 'Speedrun interruption requested.' };
};

const getLoopStatus: ToolHandler = (_args, options) => {
  if (options.getLoopStatus) {
    return options.getLoopStatus();
  }
  // Fallback: read progress from disk (standalone mode)
  return getIterationStatus(_args, options);
};

// ─── Knowledge Contribution Tool Handlers ───

const suggestHint: ToolHandler = (args, options) => {
  if (!options.writeHint) return { error: 'Knowledge contribution not available (standalone mode). Start the MCP server with lifecycle support.', isError: true };
  const screen = args.screen as string;
  const element = args.element as string;
  const hint = args.hint as string;
  if (!screen || !element || !hint) return { error: 'screen, element, and hint are required', isError: true };
  const writtenPath = options.writeHint({
    screen, element, hint,
    confidence: args.confidence as number | undefined,
  });
  return writtenPath
    ? { ok: true, writtenPath, message: `Hint written for ${screen}/${element}. Will be picked up on next iteration.` }
    : { error: `Failed to write hint for ${screen}/${element}`, isError: true };
};

const suggestLocatorAlias: ToolHandler = (args, options) => {
  if (!options.writeLocatorAlias) return { error: 'Knowledge contribution not available (standalone mode)', isError: true };
  const screen = args.screen as string;
  const element = args.element as string;
  const alias = args.alias as string;
  if (!screen || !element || !alias) return { error: 'screen, element, and alias are required', isError: true };
  const writtenPath = options.writeLocatorAlias({
    screen, element, alias,
    source: args.source as string | undefined,
  });
  return writtenPath
    ? { ok: true, writtenPath, message: `Alias "${alias}" added for ${screen}/${element}. Will be picked up on next iteration.` }
    : { error: `Failed to write alias for ${screen}/${element}`, isError: true };
};

// ─── Contribution Impact Tool Handler ───

const getContributionImpact: ToolHandler = (args, options) => {
  const screen = args.screen as string | undefined;

  // Read the knowledge graph for confidence data
  const graph = options.readArtifact('.tesseract/graph/index.json') as {
    readonly nodes?: readonly Record<string, unknown>[];
  } | null;

  // Read proposals to find activated vs pending
  const reader = asReader(options);
  const proposalsRaw = reader.readArtifact('.tesseract/learning/proposals.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  const indexProposals = reader.readArtifact('.tesseract/learning/proposals/index.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  const allProposals = [
    ...(proposalsRaw?.proposals ?? []),
    ...(indexProposals?.proposals ?? []),
  ];

  // Read scorecard for before/after metrics
  const scorecard = options.readArtifact('.tesseract/benchmarks/scorecard.json') as {
    readonly highWaterMark?: Record<string, unknown>;
    readonly history?: readonly Record<string, unknown>[];
  } | null;

  // Read workbench completions to see what was approved
  const completions = readWorkbenchCompletions(options);

  // Analyze proposals by status
  const proposalsByStatus = {
    activated: allProposals.filter((p) => (p.activation as Record<string, unknown>)?.status === 'activated' || p.status === 'activated'),
    pending: allProposals.filter((p) => (p.activation as Record<string, unknown>)?.status === 'pending' || p.status === 'pending'),
    blocked: allProposals.filter((p) => (p.activation as Record<string, unknown>)?.status === 'blocked' || p.status === 'blocked'),
  };

  // Screen-level impact (if filter provided)
  const screenNodes = screen
    ? (graph?.nodes ?? []).filter((n) => (n.screen as string) === screen)
    : (graph?.nodes ?? []);

  const avgConfidence = screenNodes.length > 0
    ? screenNodes.reduce((sum, n) => sum + ((n.confidence as number) ?? 0), 0) / screenNodes.length
    : 0;

  // Artifacts written by completed work items
  const completedEntries = completions.filter((entry) => asString(entry.status) === 'completed');
  const artifactsWritten = completedEntries.flatMap((entry) => {
    const written = entry.artifactsWritten;
    return Array.isArray(written) ? written.filter((value): value is string => typeof value === 'string') : [];
  });
  const hintsWritten = artifactsWritten.filter((p) => p.includes('.hints.yaml'));

  return {
    summary: {
      totalProposals: allProposals.length,
      activated: proposalsByStatus.activated.length,
      pending: proposalsByStatus.pending.length,
      blocked: proposalsByStatus.blocked.length,
      avgNodeConfidence: Math.round(avgConfidence * 1000) / 1000,
      totalNodesTracked: screenNodes.length,
      workItemsCompleted: completedEntries.length,
      hintsFilesWritten: hintsWritten.length,
    },
    ...(screen ? { screen } : {}),
    activatedProposals: proposalsByStatus.activated.slice(0, 20).map((p) => ({
      id: p.id ?? p.proposalId,
      title: p.title,
      targetPath: p.targetPath,
      activatedAt: (p.activation as Record<string, unknown>)?.activatedAt,
    })),
    fitnessHighWaterMark: scorecard?.highWaterMark ?? null,
    recentCompletions: completedEntries.slice(0, 10).map((entry) => ({
      workItemId: asString(entry.workItemId),
      artifactsWritten: Array.isArray(entry.artifactsWritten) ? entry.artifactsWritten : [],
    })),
  };
};

// ─── Workflow Guidance ───

interface Suggestion {
  readonly priority: number;
  readonly action: string;
  readonly tool: string;
  readonly rationale: string;
}

function gateMetrics(highWaterMark: Record<string, unknown> | undefined): {
  readonly knowledgeHitRate: number | undefined;
  readonly effectiveHitRate: number | undefined;
  readonly gateHitRate: number | undefined;
  readonly gateLabel: 'effective hit rate' | 'knowledge hit rate';
} {
  const knowledgeHitRate = typeof highWaterMark?.knowledgeHitRate === 'number' ? highWaterMark.knowledgeHitRate : undefined;
  const effectiveHitRate = typeof highWaterMark?.effectiveHitRate === 'number' ? highWaterMark.effectiveHitRate : undefined;
  return {
    knowledgeHitRate,
    effectiveHitRate,
    gateHitRate: effectiveHitRate ?? knowledgeHitRate,
    gateLabel: effectiveHitRate !== undefined ? 'effective hit rate' : 'knowledge hit rate',
  };
}

const getSuggestedAction: ToolHandler = (_args, options) => {
  const status = options.getLoopStatus?.() ?? { phase: 'unknown' as const };
  const suggestions: Suggestion[] = [];
  const inboxSummary = summarizeInboxItems(readInboxItems(options));

  // Phase-based primary suggestion
  switch (status.phase) {
    case 'idle':
      suggestions.push({ priority: 1, action: 'start', tool: 'start_speedrun', rationale: 'No active speedrun. Start one to begin the recursive improvement loop.' });
      break;
    case 'paused-for-decisions': {
      const count = (status as { pendingDecisionCount?: number }).pendingDecisionCount ?? 0;
      suggestions.push({ priority: 1, action: 'decide', tool: 'get_queue_items', rationale: `${count} pending decision(s) blocking the loop. Review and approve or skip to unblock.` });
      break;
    }
    case 'running':
      suggestions.push({ priority: 2, action: 'observe', tool: 'get_loop_status', rationale: 'Loop is running. Monitor progress and watch for bottlenecks.' });
      break;
    case 'completed':
      suggestions.push({ priority: 1, action: 'review', tool: 'get_fitness_metrics', rationale: 'Speedrun completed. Review fitness metrics to see what improved.' });
      suggestions.push({ priority: 2, action: 'analyze', tool: 'get_contribution_impact', rationale: 'See how your knowledge contributions affected outcomes.' });
      break;
    case 'failed': {
      const error = (status as { error?: string }).error ?? 'unknown error';
      suggestions.push({ priority: 1, action: 'diagnose', tool: 'get_loop_status', rationale: `Speedrun failed: ${error}. Check status for details before restarting.` });
      break;
    }
  }

  // Secondary suggestions from artifact state
  const scorecard = options.readArtifact('.tesseract/benchmarks/scorecard.json') as {
    readonly highWaterMark?: Record<string, unknown>;
  } | null;
  if (scorecard?.highWaterMark) {
    const { gateHitRate, gateLabel, knowledgeHitRate, effectiveHitRate } = gateMetrics(scorecard.highWaterMark);
    if (gateHitRate !== undefined && gateHitRate < 0.6) {
      const diagnostic = effectiveHitRate !== undefined && knowledgeHitRate !== undefined
        ? ` Diagnostic knowledge hit rate: ${(knowledgeHitRate * 100).toFixed(0)}%.`
        : '';
      suggestions.push({ priority: 3, action: 'contribute', tool: 'suggest_hint', rationale: `${gateLabel[0]!.toUpperCase()}${gateLabel.slice(1)} is ${(gateHitRate * 100).toFixed(0)}% — consider contributing hints or reviewed knowledge for low-success regions.${diagnostic}` });
    }
  }

  if (inboxSummary.total > 0) {
    const approveCount = inboxSummary.byParticipation.approve ?? 0;
    const chooseCount = inboxSummary.byParticipation.choose ?? 0;
    if (approveCount > 0 || chooseCount > 0) {
      suggestions.push({
        priority: 2,
        action: 'triage-handoffs',
        tool: 'get_learning_summary',
        rationale: `${inboxSummary.total} inbox item(s) remain active, including ${approveCount} approval-oriented and ${chooseCount} choice-oriented handoffs.`,
      });
    }
    if (inboxSummary.staleCount > 0) {
      suggestions.push({
        priority: 2,
        action: 'refresh-stale-handoffs',
        tool: 'get_learning_summary',
        rationale: `${inboxSummary.staleCount} handoff(s) are stale. Refresh their evidence slice before approving or deferring.`,
      });
    }
  }

  const proposals = options.readArtifact('.tesseract/learning/proposals.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  if (proposals?.proposals?.length) {
    const pending = proposals.proposals.filter((p) => !(p.activation as Record<string, unknown>)?.activatedAt);
    if (pending.length > 0) {
      suggestions.push({ priority: 3, action: 'review-proposals', tool: 'list_proposals', rationale: `${pending.length} proposal(s) pending activation. Review to see if any should be approved.` });
    }
  }

  const graph = options.readArtifact('.tesseract/graph/index.json') as {
    readonly nodes?: readonly Record<string, unknown>[];
  } | null;
  if (graph?.nodes?.length) {
    suggestions.push({ priority: 4, action: 'explore', tool: 'list_screens', rationale: 'Resolution graph available. Check screens for bottlenecks and knowledge gaps.' });
  }

  // Widget coverage: check if role-based dispatch covers the active element types
  const elements = graph?.nodes
    ?.filter((n) => (n.kind as string) === 'element')
    ?.map((n) => (n.widget as string))
    .filter(Boolean) ?? [];
  const uniqueWidgets = [...new Set(elements)];
  if (uniqueWidgets.length > 3) {
    suggestions.push({ priority: 5, action: 'expand-coverage', tool: 'get_learning_summary', rationale: `${uniqueWidgets.length} widget types in use. Role-based affordance dispatch covers 14 ARIA roles — verify coverage.` });
  }

  // Sort by priority (lowest number = highest priority)
  suggestions.sort((a, b) => a.priority - b.priority);
  return { suggestions, count: suggestions.length };
};

// ─── Proposal Activation ───

const activateProposal: ToolHandler = (args, options) => {
  const proposalId = args.proposalId as string;
  if (!proposalId) return actionableError('proposalId is required', 'Provide the proposal ID from list_proposals', 'list_proposals');

  // Find the proposal across all bundles
  const reader = asReader(options);
  const proposals = reader.readArtifact('.tesseract/learning/proposals.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  const indexProposals = reader.readArtifact('.tesseract/learning/proposals/index.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  const all = [...(proposals?.proposals ?? []), ...(indexProposals?.proposals ?? [])];
  const proposal = all.find((p) => (p.proposalId ?? p.id) === proposalId);

  if (!proposal) {
    return actionableError(`Proposal "${proposalId}" not found`, 'Use list_proposals to see available proposals', 'list_proposals');
  }

  const activation = proposal.activation as Record<string, unknown> | undefined;
  if (activation?.status === 'activated') {
    return {
      status: 'already-activated',
      proposalId,
      activatedAt: activation.activatedAt,
      targetPath: proposal.targetPath,
      message: 'This proposal was already activated and its knowledge is available to the resolution pipeline.',
    };
  }

  // For direct activation, we use the writeHint callback if available
  if (!options.writeHint) {
    return actionableError(
      'Direct proposal activation requires host-mode MCP server',
      'The MCP server must be running in host mode (via bin/tesseract-mcp.ts) to activate proposals. In read-only mode, proposals are activated automatically during speedrun iterations.',
      'start_speedrun',
    );
  }

  const patch = proposal.patch as Record<string, unknown> | undefined;
  const screen = (patch?.screen ?? '') as string;
  const element = (patch?.element ?? '') as string;
  const alias = (patch?.alias ?? '') as string;

  if (screen && element && alias) {
    const written = options.writeLocatorAlias?.({ screen, element, alias, source: 'agent-approved' });
    if (written) {
      return {
        status: 'activated',
        proposalId,
        targetPath: written,
        patch: { screen, element, alias },
        message: `Proposal activated. Alias "${alias}" added to ${screen}/${element}. It will be used in the next iteration.`,
      };
    }
  }

  return actionableError(
    'Could not activate proposal — patch format not recognized',
    'Check the proposal patch structure with get_proposal',
    'get_proposal',
  );
};

// ─── Convergence Proof ───

const getConvergenceProof: ToolHandler = (_args, options) => {
  const proof = options.readArtifact('.tesseract/benchmarks/convergence-proof.json') as {
    readonly trials?: readonly Record<string, unknown>[];
    readonly verdict?: Record<string, unknown>;
    readonly runAt?: string;
    readonly pipelineVersion?: string;
  } | null;
  const scorecard = options.readArtifact('.tesseract/benchmarks/scorecard.json') as {
    readonly highWaterMark?: Record<string, unknown>;
    readonly history?: readonly Record<string, unknown>[];
  } | null;

  if (!proof) {
    return actionableError(
      'No convergence proof data found',
      'Run a convergence proof first: npx tsx scripts/convergence-proof.ts',
    );
  }

  const verdict = proof.verdict;
  const trials = proof.trials ?? [];
  const inboxItems = readInboxItems(options);

  // Build concise summary
  const trialSummaries = trials.map((t, i) => ({
    trial: i + 1,
    seed: t.seed,
    iterations: (t.iterations as readonly unknown[])?.length ?? 0,
    finalHitRate: t.finalHitRate,
    hitRateDelta: t.hitRateDelta,
    converged: t.converged,
    hitRateTrajectory: t.hitRateTrajectory,
    proposalTrajectory: t.proposalTrajectory,
  }));
  const proofObligations = mergeProofObligations(
    scorecardProofObligations(asRecord(scorecard?.highWaterMark)),
    inboxItems,
  );
  const theoremBaseline = theoremBaselineCoverage(proofObligations);
  const baselineHistory = theoremBaselineHistory(scorecard);

  return {
    converges: verdict?.converges ?? false,
    confidence: verdict?.confidenceLevel ?? 'unknown',
    learningContribution: verdict?.learningContribution,
    meanHitRateDelta: verdict?.meanHitRateDelta,
    meanFinalHitRate: verdict?.meanFinalHitRate,
    medianIterationsToConverge: verdict?.medianIterationsToConverge,
    plateauLevel: verdict?.plateauLevel,
    bottleneckSummary: verdict?.bottleneckSummary,
    trials: trialSummaries,
    proofObligations,
    proofSummary: summarizeProofObligations(proofObligations),
    theoremBaseline,
    theoremBaselineSummary: summarizeTheoremBaseline(theoremBaseline),
    theoremBaselineHistory: baselineHistory,
    trialCount: trials.length,
    runAt: proof.runAt,
    pipelineVersion: proof.pipelineVersion,
  };
};

// ─── Learning Summary ───

const getLearningState: ToolHandler = (_args, options) => {
  // Gather all the data sources an agent needs to orient
  const reader = asReader(options);

  // Convergence proof
  const proof = options.readArtifact('.tesseract/benchmarks/convergence-proof.json') as {
    readonly verdict?: Record<string, unknown>;
    readonly trials?: readonly Record<string, unknown>[];
    readonly runAt?: string;
  } | null;

  // Scorecard
  const scorecard = options.readArtifact('.tesseract/benchmarks/scorecard.json') as {
    readonly highWaterMark?: Record<string, unknown>;
    readonly history?: readonly Record<string, unknown>[];
  } | null;

  // Proposals
  const proposalsRaw = reader.readArtifact('.tesseract/learning/proposals.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  const indexProposals = reader.readArtifact('.tesseract/learning/proposals/index.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  const allProposals = [...(proposalsRaw?.proposals ?? []), ...(indexProposals?.proposals ?? [])];

  // Workbench
  const workbench = options.readArtifact('.tesseract/workbench/index.json') as {
    readonly items?: readonly Record<string, unknown>[];
    readonly summary?: Record<string, unknown>;
  } | null;

  // Inbox
  const inboxItems = readInboxItems(options);

  // Progress
  const progress = options.readArtifact('.tesseract/runs/speedrun-progress.jsonl') as string | null;

  // Loop status
  const loopStatus = options.getLoopStatus?.() ?? null;

  // Analyze proposals
  const proposalStats = {
    total: allProposals.length,
    activated: allProposals.filter((p) => (p.activation as Record<string, unknown>)?.status === 'activated').length,
    pending: allProposals.filter((p) => (p.activation as Record<string, unknown>)?.status === 'pending').length,
    blocked: allProposals.filter((p) => (p.activation as Record<string, unknown>)?.status === 'blocked').length,
  };

  // Build learning trajectory from convergence proof
  const latestTrial = proof?.trials?.[proof.trials.length - 1] as Record<string, unknown> | undefined;
  const trajectory = latestTrial
    ? { hitRateTrajectory: latestTrial.hitRateTrajectory, proposalTrajectory: latestTrial.proposalTrajectory }
    : null;

  const scorecardMetrics = scorecard?.highWaterMark
    ? gateMetrics(scorecard.highWaterMark)
    : { knowledgeHitRate: undefined, effectiveHitRate: undefined, gateHitRate: undefined, gateLabel: 'knowledge hit rate' as const };
  const baselineHistory = theoremBaselineHistory(scorecard);
  const proofObligations = mergeProofObligations(
    scorecardProofObligations(asRecord(scorecard?.highWaterMark)),
    inboxItems,
  );
  const theoremBaseline = theoremBaselineCoverage(proofObligations);
  const theoremBaselineSummary = summarizeTheoremBaseline(theoremBaseline);

  // Pending decisions
  const pendingDecisions = options.pendingDecisions.size;

  // Build actionable summary
  const actions: string[] = [];
  if (pendingDecisions > 0) actions.push(`${pendingDecisions} decision(s) blocking the loop — use get_queue_items to review`);
  if (proposalStats.pending > 0) actions.push(`${proposalStats.pending} proposal(s) pending activation — use list_proposals to review`);
  const inboxSummary = summarizeInboxItems(inboxItems);
  if (inboxItems.length > 0) actions.push(`${inboxItems.length} inbox item(s) requiring attention`);
  if (inboxSummary.staleCount > 0) actions.push(`${inboxSummary.staleCount} handoff(s) are stale — refresh their context before deciding`);
  if (inboxSummary.driftDetectedCount > 0) actions.push(`${inboxSummary.driftDetectedCount} continuation chain(s) show semantic drift — inspect before resuming`);
  if (theoremBaselineSummary.missing > 0) actions.push(`Logical theorem baseline is still missing for ${theoremBaselineSummary.missingGroups.join(', ')} — prioritize direct measurement`);
  else if (theoremBaselineSummary.proxy > 0) actions.push(`Logical theorem baseline remains proxy-backed for ${theoremBaselineSummary.proxyGroups.join(', ')} — tighten direct measurement`);
  if (!proof) actions.push('No convergence proof yet — run one to measure learning effectiveness');
  if (loopStatus?.phase === 'idle') actions.push('Loop is idle — use start_speedrun to begin');

  return {
    loopStatus: loopStatus ? { phase: loopStatus.phase, iteration: (loopStatus as unknown as Record<string, unknown>).iteration } : null,
    convergence: proof ? {
      converges: proof.verdict?.converges,
      confidence: proof.verdict?.confidenceLevel,
      learningContribution: proof.verdict?.learningContribution,
      lastRunAt: proof.runAt,
    } : null,
    fitness: scorecard?.highWaterMark
      ? {
          ...scorecard.highWaterMark,
          gateMetric: scorecardMetrics.gateLabel,
          gateHitRate: scorecardMetrics.gateHitRate ?? null,
          effectiveHitRate: scorecardMetrics.effectiveHitRate ?? null,
          knowledgeHitRate: scorecardMetrics.knowledgeHitRate ?? null,
        }
      : null,
    proposals: proposalStats,
    proposalsByCategory: proposalCategories(allProposals),
    proofObligations,
    proofSummary: summarizeProofObligations(proofObligations),
    theoremBaseline,
    theoremBaselineSummary,
    theoremBaselineHistory: baselineHistory,
    trajectory,
    pendingDecisions,
    workbenchItems: workbench?.items?.length ?? 0,
    inboxItems: inboxItems.length,
    inboxSummary,
    actionRequired: actions,
  };
};

// ─── Operator Briefing ───

const getOperatorBriefing: ToolHandler = (_args, options) => {
  const reader = asReader(options);
  const inboxItems = readInboxItems(options);
  const inboxSummary = summarizeInboxItems(inboxItems);

  // Knowledge coverage
  const graph = reader.readArtifact('.tesseract/graph/index.json') as {
    readonly nodes?: readonly Record<string, unknown>[];
    readonly edges?: readonly Record<string, unknown>[];
  } | null;

  const screens = graph?.nodes?.filter((n) => (n.kind as string) === 'screen') ?? [];
  const elements = graph?.nodes?.filter((n) => (n.kind as string) === 'element') ?? [];
  const widgetTypes = [...new Set(elements.map((e) => e.widget as string).filter(Boolean))];
  const roleTypes = [...new Set(elements.map((e) => e.role as string).filter(Boolean))];

  // Fitness
  const scorecard = reader.readArtifact('.tesseract/benchmarks/scorecard.json') as {
    readonly highWaterMark?: Record<string, unknown>;
    readonly history?: readonly Record<string, unknown>[];
  } | null;
  const knowledgeHitRate = scorecard?.highWaterMark?.knowledgeHitRate as number | undefined;
  const effectiveHitRate = scorecard?.highWaterMark?.effectiveHitRate as number | undefined;
  const gateHitRate = effectiveHitRate ?? knowledgeHitRate;
  const gateLabel = effectiveHitRate !== undefined ? 'effectiveHitRate' : 'knowledgeHitRate';

  // Proposals
  const proposalsRaw = reader.readArtifact('.tesseract/learning/proposals.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  const allProposals = proposalsRaw?.proposals ?? [];
  const activated = allProposals.filter((p) => (p.activation as Record<string, unknown>)?.status === 'activated').length;
  const proposalCategorySummary = proposalCategories(allProposals);

  // Route knowledge
  const routes = reader.readArtifact('.tesseract/graph/routes.json') as {
    readonly routes?: readonly Record<string, unknown>[];
  } | null;
  const proofObligations = mergeProofObligations(
    scorecardProofObligations(asRecord(scorecard?.highWaterMark)),
    inboxItems,
  );
  const theoremBaseline = theoremBaselineCoverage(proofObligations);
  const theoremBaselineSummary = summarizeTheoremBaseline(theoremBaseline);
  const baselineHistory = theoremBaselineHistory(scorecard);

  return {
    coverage: {
      screens: screens.length,
      elements: elements.length,
      widgetTypes,
      roleTypes,
      routes: routes?.routes?.length ?? 0,
    },
    fitness: gateHitRate !== undefined ? {
      gateMetric: gateLabel,
      gateHitRate,
      gateHitRatePercent: `${(gateHitRate * 100).toFixed(1)}%`,
      effectiveHitRate: effectiveHitRate ?? null,
      knowledgeHitRate: knowledgeHitRate ?? null,
    } : null,
    learningLoop: {
      totalProposals: allProposals.length,
      activatedProposals: activated,
      activationRate: allProposals.length > 0 ? `${((activated / allProposals.length) * 100).toFixed(0)}%` : 'N/A',
    },
    proposalCategories: proposalCategorySummary,
    proofObligations,
    proofSummary: summarizeProofObligations(proofObligations),
    theoremBaseline,
    theoremBaselineSummary,
    theoremBaselineHistory: baselineHistory,
    handoffSummary: inboxSummary,
    roleAffordanceCoverage: {
      coveredRoles: roleTypes.length,
      totalAriaRoles: 14,
      coveragePercent: `${((roleTypes.length / 14) * 100).toFixed(0)}%`,
    },
    recommendation: inboxSummary.staleCount > 0
      ? `Refresh ${inboxSummary.staleCount} stale handoff(s) before approving more work so continuations stay faithful.`
      : (inboxSummary.byParticipation.approve ?? 0) > 0
        ? `Review ${inboxSummary.byParticipation.approve} approval-oriented handoff(s); the continuation layer is asking for ratification, not more exploration.`
        : gateHitRate === undefined ? 'Run a speedrun to establish baseline metrics.'
      : baselineHistory.direction === 'degrading'
        ? 'Theorem baseline coverage is regressing across cohorts. Stabilize the substrate before adding more surface area.'
      : theoremBaselineSummary.missing > 0
        ? `Logical theorem baseline still has missing groups (${theoremBaselineSummary.missingGroups.join(', ')}). Prioritize direct measurement before more polish.`
      : theoremBaselineSummary.proxy > 0
        ? `Logical theorem baseline is still proxy-backed for ${theoremBaselineSummary.proxyGroups.join(', ')}. Strengthen direct proof surfaces next.`
      : gateHitRate < 0.3 ? 'Gate hit rate is low. Focus on expanding reviewed knowledge, route certainty, and handoff clarity.'
      : gateHitRate < 0.6 ? 'Gate hit rate is moderate. Investigate proposal activation, fallback reliance, and phrasing gaps.'
      : gateHitRate < 0.8 ? 'Gate hit rate is good. Fine-tune with structured entropy, route-entry coverage, and edge cases.'
      : 'Hit rate is excellent. Consider adding cross-screen journey scenarios.',
  };
};

// ─── Tool Router (pure dispatch) ───

const toolHandlers: Readonly<Record<string, ToolHandler>> = {
  'list_probed_elements': listProbedElements,
  'get_screen_capture': getScreenCapture,
  'get_knowledge_state': getKnowledgeState,
  'get_queue_items': getQueueItems,
  'get_fitness_metrics': getFitnessMetrics,
  'approve_work_item': approveWorkItem,
  'skip_work_item': skipWorkItem,
  'get_decision_context': getDecisionContext,
  'get_iteration_status': getIterationStatus,
  'get_proposal': getProposal,
  'list_proposals': listProposalsHandler,
  'get_bottleneck': getBottleneck,
  'get_run': getRun,
  'get_resolution_graph': getResolutionGraph,
  'get_task_resolution': getTaskResolution,
  'list_screens': listScreens,
  'browser_screenshot': browserScreenshot,
  'browser_query': browserQuery,
  'browser_aria_snapshot': browserAriaSnapshot,
  'browser_click': browserClick,
  'browser_fill': browserFill,
  'browser_navigate': browserNavigate,
  // Lifecycle tools
  'start_speedrun': startSpeedrun,
  'stop_speedrun': stopSpeedrun,
  'get_loop_status': getLoopStatus,
  // Knowledge contribution tools
  'suggest_hint': suggestHint,
  'suggest_locator_alias': suggestLocatorAlias,
  // Contribution impact
  'get_contribution_impact': getContributionImpact,
  // Workflow guidance
  'get_suggested_action': getSuggestedAction,
  // Proposal activation
  'activate_proposal': activateProposal,
  // Convergence proof
  'get_convergence_proof': getConvergenceProof,
  // Learning summary
  'get_learning_summary': getLearningState,
  // Operator briefing
  'get_operator_briefing': getOperatorBriefing,
};

/**
 * Enrich every tool response with system phase.
 *
 * This is a router-level concern, not a handler concern. Handlers stay pure
 * and focused on their domain. The router adds cross-cutting context that
 * helps agents orient regardless of which tool they called.
 */
function enrichWithPhase(result: unknown, options: DashboardMcpServerOptions): unknown {
  if (typeof result !== 'object' || result === null) return result;
  return { ...(result as object), phase: currentPhase(options) };
}

const routeToolCall = (
  invocation: McpToolInvocation,
  options: DashboardMcpServerOptions,
): McpToolResult => {
  const handler = toolHandlers[invocation.tool];
  if (!handler) {
    return { tool: invocation.tool, result: { error: `Unknown tool: ${invocation.tool}`, suggestedAction: 'Call tools/list to see available tools.', availableTools: Object.keys(toolHandlers), phase: currentPhase(options) }, isError: true };
  }
  try {
    const result = handler(invocation.arguments, options);
    return { tool: invocation.tool, result: enrichWithPhase(result, options), isError: false };
  } catch (err) {
    return { tool: invocation.tool, result: enrichWithPhase({ error: String(err) }, options), isError: true };
  }
};

// ─── McpServerPort Implementation ───

/** Static resource catalog — the three tesseract:// URI-template resources. */
const mcpResources: readonly McpResource[] = [
  { uri: 'tesseract://proposal/{id}', name: 'Proposal', description: 'Proposal details by ID', mimeType: 'application/json' },
  { uri: 'tesseract://bottleneck/{screen}', name: 'Bottleneck', description: 'Bottleneck analysis for a screen', mimeType: 'application/json' },
  { uri: 'tesseract://run/{runId}', name: 'Run', description: 'Run details by ID or "latest"', mimeType: 'application/json' },
];

export function createDashboardMcpServer(options: DashboardMcpServerOptions): McpServerPort {
  // Compose tool catalog: base tools + lifecycle tools (when host-mode) + knowledge tools (when host-mode)
  const allTools: McpToolDefinition[] = [...dashboardMcpTools];
  if (options.startSpeedrun) allTools.push(...lifecycleMcpTools);
  if (options.writeHint) allTools.push(...knowledgeMcpTools);

  return {
    listTools: () => Effect.succeed(allTools as readonly McpToolDefinition[]),

    handleToolCall: (invocation: McpToolInvocation) =>
      Effect.sync(() => routeToolCall(invocation, options)),

    listResources: () => Effect.succeed(mcpResources),

    readResource: (uri: string) => Effect.sync(() => {
      const response = resolveResource(uri, asReader(options));
      if (!response.found) {
        throw new TesseractError('resource-not-found', `Resource not found: ${uri}`);
      }
      return {
        uri: response.uri,
        mimeType: 'application/json',
        text: JSON.stringify(response.data, null, 2),
      } satisfies McpResourceContent;
    }),
  };
}

// ─── Lifecycle Tool Definitions ───

const lifecycleMcpTools: readonly McpToolDefinition[] = [
  {
    name: 'start_speedrun',
    category: 'control',
    description: 'Start the dogfood loop as a background fiber. The loop generates scenarios, compiles, executes via Playwright, and iterates. Use get_loop_status to monitor progress. Use get_queue_items to see pending decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of scenarios to generate (default: 50)' },
        seeds: { type: 'array', items: { type: 'string' }, description: 'Seed strings for scenario generation' },
        maxIterations: { type: 'number', description: 'Maximum improvement iterations (default: 5)' },
        knowledgePosture: { type: 'string', enum: ['cold-start', 'warm-start', 'production'], description: 'Knowledge loading posture (default: warm-start)' },
        interpreterMode: { type: 'string', enum: ['playwright', 'diagnostic', 'dry-run'], description: 'Execution mode (default: playwright)' },
      },
    },
  },
  {
    name: 'stop_speedrun',
    category: 'control',
    description: 'Stop a running speedrun by interrupting the background fiber. Use when you want to abort the loop early.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_loop_status',
    category: 'observe',
    description: 'Get the current speedrun loop status: phase (idle/running/paused-for-decisions/completed/failed), iteration number, pending decision count, and elapsed time.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── Knowledge Contribution Tool Definitions ───

const knowledgeMcpTools: readonly McpToolDefinition[] = [
  {
    name: 'suggest_hint',
    category: 'decide',
    description: 'Write a hint for an element on a screen. Hints are persisted to knowledge/screens/{screen}.hints.yaml and picked up on the next iteration. Use this to teach the system about element behavior, affordances, or interaction patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        screen: { type: 'string', description: 'Screen ID (e.g., "policy-search")' },
        element: { type: 'string', description: 'Element ID (e.g., "searchButton")' },
        hint: { type: 'string', description: 'The hint text describing how to interact with or identify this element' },
        confidence: { type: 'number', description: 'Confidence score 0-1 (default: 0.8)' },
      },
      required: ['screen', 'element', 'hint'],
    },
  },
  {
    name: 'suggest_locator_alias',
    category: 'decide',
    description: 'Add a locator alias for an element. Aliases are alternative names the resolution pipeline uses to find elements. Persisted to knowledge/screens/{screen}.hints.yaml.',
    inputSchema: {
      type: 'object',
      properties: {
        screen: { type: 'string', description: 'Screen ID' },
        element: { type: 'string', description: 'Element ID' },
        alias: { type: 'string', description: 'The alias to add (e.g., "submit button", "search field")' },
        source: { type: 'string', description: 'Source of the alias (e.g., "aria-label", "agent-observation")' },
      },
      required: ['screen', 'element', 'alias'],
    },
  },
];
