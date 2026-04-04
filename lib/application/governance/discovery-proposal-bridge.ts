/**
 * W2.8: Discovery-to-proposal bridge
 *
 * Pure function that transforms a DiscoveryRun into a set of ProposalBundles,
 * bridging the discovery (interface) lane into the proposal (improvement) lane.
 *
 * For each discovered element  -> ScreenElements proposal
 * For each discovered hint     -> ScreenHints proposal
 * For each discovered behavior -> ScreenBehavior proposal
 */

import { knowledgePaths } from '../../domain/kernel/ids';
import type { DiscoveryObservedElement, DiscoveryObservedSurface, DiscoveryRun } from '../../domain/target/interface-graph';
import type { TrustPolicyArtifactType } from '../../domain/governance/workflow-types';
import type { ScreenId } from '../../domain/kernel/identity';

// ─── Output types ───

export interface DiscoveryProposal {
  readonly proposalKind: 'screen-elements' | 'screen-hints' | 'screen-behavior' | 'route-knowledge';
  readonly artifactType: TrustPolicyArtifactType;
  readonly targetPath: string;
  readonly title: string;
  readonly patch: Readonly<Record<string, unknown>>;
  readonly rationale: string;
  readonly sourceElementId: string | null;
  readonly sourceSurfaceId: string | null;
  readonly discoveryRunId: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly evidenceIds: readonly string[];
  readonly impactedScreens: readonly ScreenId[];
}

export interface ProposalBundle {
  readonly screen: ScreenId;
  readonly discoveryRunId: string;
  readonly proposals: readonly DiscoveryProposal[];
}

// ─── Element proposals ───

function elementProposal(
  screen: ScreenId,
  discoveryRunId: string,
  element: DiscoveryObservedElement,
): DiscoveryProposal {
  return {
    proposalKind: 'screen-elements',
    artifactType: 'elements',
    targetPath: knowledgePaths.elements(screen),
    title: `Add discovered element ${element.id} to ${screen}`,
    patch: {
      screen,
      element: element.id,
      role: element.role,
      name: element.name,
      testId: element.testId,
      widget: element.widget,
      required: element.required,
      locatorCandidates: element.locatorCandidates,
    },
    rationale: `Discovery run ${discoveryRunId} found element ${element.id} (${element.role}) on screen ${screen}.`,
    sourceElementId: element.id,
    sourceSurfaceId: null,
    discoveryRunId,
    confidence: 'medium',
    evidenceIds: [`discovery-run:${discoveryRunId}`],
    impactedScreens: [screen],
  };
}

function elementProposals(
  screen: ScreenId,
  discoveryRunId: string,
  elements: readonly DiscoveryObservedElement[],
): readonly DiscoveryProposal[] {
  return elements.map((element) => elementProposal(screen, discoveryRunId, element));
}

// ─── Hint proposals ───

function hintProposalForElement(
  screen: ScreenId,
  discoveryRunId: string,
  element: DiscoveryObservedElement,
): DiscoveryProposal | null {
  return element.name
    ? {
        proposalKind: 'screen-hints',
        artifactType: 'hints',
        targetPath: knowledgePaths.hints(screen),
        title: `Add hint alias for ${element.id} on ${screen}`,
        patch: {
          screen,
          element: element.id,
          alias: element.name,
          locatorHint: element.locatorHint,
          source: 'discovery',
        },
        rationale: `Discovery run ${discoveryRunId} found accessible name "${element.name}" for element ${element.id}.`,
        sourceElementId: element.id,
        sourceSurfaceId: null,
        discoveryRunId,
        confidence: 'medium',
        evidenceIds: [`discovery-run:${discoveryRunId}`],
        impactedScreens: [screen],
      }
    : null;
}

function hintProposals(
  screen: ScreenId,
  discoveryRunId: string,
  elements: readonly DiscoveryObservedElement[],
): readonly DiscoveryProposal[] {
  return elements
    .flatMap((element) => { const r = hintProposalForElement(screen, discoveryRunId, element); return r !== null ? [r] : []; });
}

// ─── Behavior proposals ───

function behaviorProposalForSurface(
  screen: ScreenId,
  discoveryRunId: string,
  surface: DiscoveryObservedSurface,
): DiscoveryProposal {
  return {
    proposalKind: 'screen-behavior',
    artifactType: 'surface',
    targetPath: knowledgePaths.surface(screen),
    title: `Add surface behavior for ${surface.id} on ${screen}`,
    patch: {
      screen,
      surface: surface.id,
      kind: surface.kind,
      role: surface.role,
      name: surface.name,
      assertions: surface.assertions,
    },
    rationale: `Discovery run ${discoveryRunId} observed surface ${surface.id} (${surface.kind}) on screen ${screen}.`,
    sourceElementId: null,
    sourceSurfaceId: surface.id,
    discoveryRunId,
    confidence: 'medium',
    evidenceIds: [`discovery-run:${discoveryRunId}`],
    impactedScreens: [screen],
  };
}

function behaviorProposals(
  screen: ScreenId,
  discoveryRunId: string,
  surfaces: readonly DiscoveryObservedSurface[],
): readonly DiscoveryProposal[] {
  return surfaces.map((surface) => behaviorProposalForSurface(screen, discoveryRunId, surface));
}

function routeProposal(input: {
  screen: ScreenId;
  discoveryRunId: string;
  routeId: string;
  variantId: string;
  url: string;
}): DiscoveryProposal {
  const parsed = (() => {
    try {
      const value = new URL(input.url);
      return {
        pathTemplate: value.pathname,
        query: Object.fromEntries([...value.searchParams.entries()].sort((left, right) => left[0].localeCompare(right[0]))),
        hash: value.hash.length > 0 ? value.hash.slice(1) : null,
      };
    } catch {
      return {
        pathTemplate: input.url,
        query: {},
        hash: null,
      };
    }
  })();
  return {
    proposalKind: 'route-knowledge',
    artifactType: 'routes',
    targetPath: `knowledge/routes/${input.screen}.routes.yaml`,
    title: `Add or update route variant ${input.routeId}:${input.variantId} for ${input.screen}`,
    patch: {
      kind: 'route-knowledge',
      version: 1,
      governance: 'review-required',
      app: 'discover',
      routes: [{
        id: input.routeId,
        screen: input.screen,
        entryUrl: input.url,
        variants: [{
          id: input.variantId,
          screen: input.screen,
          url: input.url,
          pathTemplate: parsed.pathTemplate,
          query: parsed.query,
          hash: parsed.hash,
          tab: parsed.query.tab ?? null,
          state: parsed.query.mode ? { mode: parsed.query.mode } : {},
          mappedScreens: [input.screen],
        }],
      }],
    },
    rationale: `Discovery run ${input.discoveryRunId} observed route ${input.url} for screen ${input.screen}.`,
    sourceElementId: null,
    sourceSurfaceId: null,
    discoveryRunId: input.discoveryRunId,
    confidence: 'low',
    evidenceIds: [`discovery-run:${input.discoveryRunId}`, `route-variant:${input.routeId}:${input.variantId}`],
    impactedScreens: [input.screen],
  };
}

// ─── Deduplication ───

function proposalKey(proposal: DiscoveryProposal): string {
  return `${proposal.proposalKind}:${proposal.targetPath}:${proposal.sourceElementId ?? ''}:${proposal.sourceSurfaceId ?? ''}`;
}

function deduplicateProposals(proposals: readonly DiscoveryProposal[]): readonly DiscoveryProposal[] {
  const seen = new Set<string>();
  return proposals.filter((proposal) => {
    const key = proposalKey(proposal);
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

// ─── Public API ───

/**
 * Pure function: discovery run in, proposal bundles out.
 *
 * Generates one ProposalBundle per DiscoveryRun, containing:
 * - One ScreenElements proposal per discovered element
 * - One ScreenHints proposal per element with an accessible name
 * - One ScreenBehavior proposal per discovered surface
 */
export function generateProposalsFromDiscovery(
  discovery: DiscoveryRun,
): readonly ProposalBundle[] {
  const screen = discovery.screen;
  const runId = discovery.runId;

  const allProposals = deduplicateProposals([
    ...elementProposals(screen, runId, discovery.elements),
    ...hintProposals(screen, runId, discovery.elements),
    ...behaviorProposals(screen, runId, discovery.surfaces),
    routeProposal({
      screen,
      discoveryRunId: runId,
      routeId: discovery.routeId,
      variantId: discovery.variantId,
      url: discovery.url,
    }),
  ]);

  return allProposals.length > 0
    ? [{
        screen,
        discoveryRunId: runId,
        proposals: allProposals,
      }]
    : [];
}
