import type {
  ApplicationInterfaceGraph,
  InterfaceResolutionContext,
  LocatorStrategy,
  RuntimeControlSession,
  SelectorCanon,
  StateTransitionGraph,
  StepTaskElementCandidate,
  StepTaskScreenCandidate,
} from '../domain/types';
import type { CanonicalTargetRef, PostureId, ScreenId, SelectorRef, SnapshotTemplateId } from '../domain/identity';
import type { WorkspaceCatalog } from './catalog';

interface GraphScreenPayload {
  url?: string | null;
  aliases?: string[];
  routeVariantRefs?: string[];
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
    .filter((node) => node.kind === 'target' && node.screen === input.screen && node.element)
    .map((node) => {
      const payload = targetPayload(node);
      const probes = probesForTarget(input.selectorCanon, node.targetRef ?? null);
      return {
        element: node.element!,
        targetRef: node.targetRef!,
        role: payload.role ?? 'region',
        name: payload.name ?? null,
        surface: node.surface ?? (() => { throw new Error(`Missing surface for target ${node.id}`); })(),
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
    .filter((node) => node.kind === 'screen' && node.screen && (!allowedScreens || allowedScreens.has(node.screen)))
    .map((node) => {
      const payload = screenPayload(node);
      return {
        screen: node.screen!,
        url: payload.url ?? '',
        routeVariantRefs: sortStrings(payload.routeVariantRefs ?? []),
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
}): InterfaceResolutionContext {
  const confidenceOverlays = (input.catalog.confidenceCatalog?.artifact.records ?? [])
    .filter((record) => record.status === 'approved-equivalent');

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
  };
}
