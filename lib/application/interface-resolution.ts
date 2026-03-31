import type {
  ArtifactConfidenceRecord,
  ApplicationInterfaceGraph,
  InterfaceResolutionContext,
  LocatorStrategy,
  RuntimeControlSession,
  SelectorCanon,
  StateTransitionGraph,
  StepTaskElementCandidate,
  StepTaskScreenCandidate,
} from '../domain/types';
import { createStateNodeRef } from '../domain/identity';
import type { CanonicalTargetRef, PostureId, ScreenId, SelectorRef, SnapshotTemplateId } from '../domain/identity';
import { computeDecayedConfidence, type FreshnessPolicy, defaultFreshnessPolicy } from '../domain/knowledge-freshness';
import type { WorkspaceCatalog } from './catalog';
import { TesseractError } from '../domain/errors';
import type { DerivedGraph } from '../domain/types/execution-context';

interface GraphScreenPayload {
  url?: string | null;
  aliases?: string[];
  routeVariantRefs?: string[];
  routeVariants?: Array<{
    routeVariantRef: string;
    url: string;
    pathTemplate?: string | null;
    query?: Record<string, string>;
    hash?: string | null;
    tab?: string | null;
    state?: Record<string, string>;
    mappedScreens?: ScreenId[];
    urlPattern?: string | null;
    dimensions?: Array<'query' | 'hash' | 'tab' | 'segment'>;
    expectedEntryStateRefs?: string[];
    historicalSuccess?: { successCount: number; failureCount: number; lastSuccessAt?: string | null };
  }>;
  knowledgeRefs?: string[];
  supplementRefs?: string[];
  sectionSnapshots?: SnapshotTemplateId[];
}

interface GraphTargetPayload {
  kind?: 'surface' | 'element' | 'snapshot-anchor' | 'discovered';
  aliases?: string[];
  role?: string | null;
  name?: string | null;
  widget?: string | null;
  affordance?: string | null;
  required?: boolean;
  locatorStrategies?: LocatorStrategy[];
  postures?: PostureId[];
  defaultValueRef?: string | null;
  parameter?: string | null;
  snapshotAliases?: Record<string, string[]>;
  selectorRefs?: SelectorRef[];
  knowledgeRefs?: string[];
  supplementRefs?: string[];
}

function sortStrings<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right)) as T[];
}

function screenPayload(node: ApplicationInterfaceGraph['nodes'][number]): GraphScreenPayload {
  return (node.payload ?? {}) as GraphScreenPayload;
}

function targetPayload(node: ApplicationInterfaceGraph['nodes'][number]): GraphTargetPayload {
  return (node.payload ?? {}) as GraphTargetPayload;
}

function probesForTarget(selectorCanon: SelectorCanon, targetRef: CanonicalTargetRef | null | undefined) {
  if (!targetRef) {
    return [];
  }
  return selectorCanon.entries
    .find((entry) => entry.targetRef === targetRef)
    ?.probes
    .slice()
    .sort((left, right) => left.rung - right.rung || left.id.localeCompare(right.id)) ?? [];
}

function elementCandidatesForScreen(input: {
  interfaceGraph: ApplicationInterfaceGraph;
  selectorCanon: SelectorCanon;
  screen: ScreenId;
}): StepTaskElementCandidate[] {
  return input.interfaceGraph.nodes
    .flatMap((node) => node.kind === 'target' && node.screen === input.screen && node.element ? [node] : [])
    .map((node) => {
      const payload = targetPayload(node);
      const probes = probesForTarget(input.selectorCanon, node.targetRef ?? null);
      return {
        element: node.element!,
        targetRef: node.targetRef!,
        role: payload.role ?? 'region',
        name: payload.name ?? null,
        surface: node.surface ?? (() => { throw new TesseractError('missing-required', `Missing surface for target ${node.id}`); })(),
        widget: (payload.widget ?? 'os-region') as StepTaskElementCandidate['widget'],
        affordance: payload.affordance ?? null,
        aliases: sortStrings([node.element!, ...(payload.aliases ?? [])]),
        locator: probes.map((probe) => probe.strategy),
        postures: sortStrings(payload.postures ?? []),
        defaultValueRef: payload.defaultValueRef ?? null,
        parameter: payload.parameter ?? null,
        snapshotAliases: payload.snapshotAliases ?? {},
        graphNodeId: node.id,
        selectorRefs: sortStrings(probes.map((probe) => probe.selectorRef)),
      } satisfies StepTaskElementCandidate;
    })
    .sort((left, right) => left.element.localeCompare(right.element));
}

function screenCandidates(input: {
  interfaceGraph: ApplicationInterfaceGraph;
  selectorCanon: SelectorCanon;
  screenRefs?: readonly ScreenId[] | undefined;
}): StepTaskScreenCandidate[] {
  const allowedScreens = input.screenRefs ? new Set(input.screenRefs) : null;
  return input.interfaceGraph.nodes
    .flatMap((node) => node.kind === 'screen' && node.screen && (!allowedScreens || allowedScreens.has(node.screen)) ? [node] : [])
    .map((node) => {
      const payload = screenPayload(node);
      return {
        screen: node.screen!,
        url: payload.url ?? '',
        routeVariantRefs: sortStrings(payload.routeVariantRefs ?? []),
        routeVariants: (payload.routeVariants ?? []).map((variant) => ({
          routeVariantRef: variant.routeVariantRef,
          url: variant.url,
          pathTemplate: variant.pathTemplate ?? null,
          query: variant.query ?? {},
          hash: variant.hash ?? null,
          tab: variant.tab ?? null,
          state: variant.state ?? {},
          mappedScreens: sortStrings((variant.mappedScreens ?? []) as ScreenId[]),
          urlPattern: variant.urlPattern ?? null,
          dimensions: sortStrings((variant.dimensions ?? []) as Array<'query' | 'hash' | 'tab' | 'segment'>),
          expectedEntryStateRefs: sortStrings((variant.expectedEntryStateRefs ?? []) as string[]).map((ref) => createStateNodeRef(ref)),
          historicalSuccess: variant.historicalSuccess
            ? {
              successCount: variant.historicalSuccess.successCount ?? 0,
              failureCount: variant.historicalSuccess.failureCount ?? 0,
              lastSuccessAt: variant.historicalSuccess.lastSuccessAt ?? null,
            }
            : undefined,
        })),
        screenAliases: sortStrings([node.screen!, ...(payload.aliases ?? [])]),
        knowledgeRefs: sortStrings(payload.knowledgeRefs ?? []),
        supplementRefs: sortStrings(payload.supplementRefs ?? []),
        elements: elementCandidatesForScreen({
          interfaceGraph: input.interfaceGraph,
          selectorCanon: input.selectorCanon,
          screen: node.screen!,
        }),
        sectionSnapshots: sortStrings(payload.sectionSnapshots ?? []),
        graphNodeId: node.id,
      } satisfies StepTaskScreenCandidate;
    })
    .sort((left, right) => left.screen.localeCompare(right.screen));
}

export function buildInterfaceResolutionContext(input: {
  catalog: WorkspaceCatalog;
  knowledgeFingerprint: string;
  runtimeControls: RuntimeControlSession;
  interfaceGraph: ApplicationInterfaceGraph;
  selectorCanon: SelectorCanon;
  stateGraph: StateTransitionGraph;
  screenRefs?: readonly ScreenId[] | undefined;
  freshnessPolicy?: FreshnessPolicy | undefined;
  /** Total completed runs so far (used for freshness decay calculation). */
  completedRunCount?: number | undefined;
  /** DerivedGraph for runtime graph queries. */
  derivedGraph?: DerivedGraph | null | undefined;
}): InterfaceResolutionContext {
  const policy = input.freshnessPolicy ?? defaultFreshnessPolicy();
  const completedRuns = input.completedRunCount ?? 0;

  // Apply freshness decay to confidence overlays. Each record's score is
  // decayed based on how many runs have passed since it was last exercised.
  const confidenceOverlays = (input.catalog.confidenceCatalog?.artifact.records ?? [])
    .flatMap((record) => record.status === 'approved-equivalent' ? [record] : [])
    .map((record): ArtifactConfidenceRecord => {
      const lastExercisedRun = record.lineage.runIds.length;
      const runsSinceExercised = Math.max(0, completedRuns - lastExercisedRun);
      const decayedScore = computeDecayedConfidence(record.score, runsSinceExercised, policy);
      return decayedScore === record.score
        ? record
        : { ...record, score: decayedScore };
    });

  return {
    knowledgeFingerprint: input.knowledgeFingerprint,
    confidenceFingerprint: input.catalog.confidenceCatalog?.fingerprint ?? null,
    interfaceGraphFingerprint: input.interfaceGraph.fingerprint,
    selectorCanonFingerprint: input.selectorCanon.fingerprint,
    stateGraphFingerprint: input.stateGraph.fingerprint,
    interfaceGraphPath: input.catalog.interfaceGraph?.artifactPath ?? null,
    selectorCanonPath: input.catalog.selectorCanon?.artifactPath ?? null,
    stateGraphPath: input.catalog.stateGraph?.artifactPath ?? null,
    sharedPatterns: input.catalog.mergedPatterns,
    screens: screenCandidates({
      interfaceGraph: input.interfaceGraph,
      selectorCanon: input.selectorCanon,
      screenRefs: input.screenRefs,
    }),
    evidenceRefs: input.catalog.evidenceRecords.map((entry) => entry.artifactPath).sort((left, right) => left.localeCompare(right)),
    confidenceOverlays,
    controls: input.runtimeControls,
    stateGraph: input.stateGraph,
    derivedGraph: input.derivedGraph ?? null,
  };
}
