import YAML from 'yaml';
import { isRecord } from '../../domain/kernel/collections';
import type { ProposalEntry } from '../../domain/execution/types';
import { validateRouteKnowledgeManifest, validateScreenHints } from '../../domain/validation';
import type { Lattice } from '../../domain/algebra/lattice';
import type { ContextualMerge } from '../../domain/algebra/contextual-merge';
import { primaryAffordanceForRole, roleForWidget } from '../../domain/widgets/role-affordances';

/** Deep merge two records. Pure recursive fold — no mutation. */
const mergeRecords = (
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> =>
  Object.entries(patch).reduce<Record<string, unknown>>(
    (acc, [key, value]) => ({
      ...acc,
      [key]: isRecord(value) && isRecord(acc[key])
        ? mergeRecords(acc[key] as Record<string, unknown>, value)
        : value,
    }),
    { ...target },
  );

/** Build an updated aliases array: add alias if absent, return sorted. Pure. */
const withAlias = (aliases: readonly unknown[], alias: string): readonly string[] => {
  const current = aliases.map(String);
  const withNew = current.includes(alias) ? current : [...current, alias];
  return [...withNew].sort((a, b) => a.localeCompare(b));
};

const mergeLocatorLadder = (current: readonly unknown[], proposed: readonly unknown[]): readonly unknown[] => {
  const seen = new Set<string>();
  return [...current, ...proposed].filter((entry) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const uniqueStrings = (values: readonly unknown[]): readonly string[] =>
  [...new Set(values.flatMap((value) => typeof value === 'string' ? [value] : []))]
    .sort((left, right) => left.localeCompare(right));

const mergeStringRecordSetIfAbsent = (
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
): Record<string, string> =>
  Object.fromEntries(
    [
      ...Object.entries(current).flatMap(([key, value]) => typeof value === 'string' ? [[key, value] as const] : []),
      ...Object.entries(proposed).flatMap(([key, value]) =>
        typeof value === 'string' && current[key] === undefined ? [[key, value] as const] : []),
    ].sort(([left], [right]) => left.localeCompare(right)),
  );

function routeRecords(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function mergeRouteVariant(current: Record<string, unknown>, proposed: Record<string, unknown>): Record<string, unknown> {
  const currentExpected = isRecord(current.expectedEntryState) ? current.expectedEntryState : {};
  const proposedExpected = isRecord(proposed.expectedEntryState) ? proposed.expectedEntryState : {};
  const currentHistory = isRecord(current.historicalSuccess) ? current.historicalSuccess : {};
  const proposedHistory = isRecord(proposed.historicalSuccess) ? proposed.historicalSuccess : {};

  return {
    id: current.id ?? proposed.id,
    screen: current.screen ?? proposed.screen,
    url: current.url ?? proposed.url,
    pathTemplate: current.pathTemplate ?? proposed.pathTemplate ?? null,
    query: mergeStringRecordSetIfAbsent(
      isRecord(current.query) ? current.query : {},
      isRecord(proposed.query) ? proposed.query : {},
    ),
    hash: current.hash ?? proposed.hash ?? null,
    tab: current.tab ?? proposed.tab ?? null,
    rootSelector: current.rootSelector ?? proposed.rootSelector ?? null,
    urlPattern: current.urlPattern ?? proposed.urlPattern ?? null,
    dimensions: uniqueStrings([
      ...(Array.isArray(current.dimensions) ? current.dimensions : []),
      ...(Array.isArray(proposed.dimensions) ? proposed.dimensions : []),
    ]),
    expectedEntryState: {
      requiredStateRefs: uniqueStrings([
        ...(Array.isArray(currentExpected.requiredStateRefs) ? currentExpected.requiredStateRefs : []),
        ...(Array.isArray(proposedExpected.requiredStateRefs) ? proposedExpected.requiredStateRefs : []),
      ]),
      forbiddenStateRefs: uniqueStrings([
        ...(Array.isArray(currentExpected.forbiddenStateRefs) ? currentExpected.forbiddenStateRefs : []),
        ...(Array.isArray(proposedExpected.forbiddenStateRefs) ? proposedExpected.forbiddenStateRefs : []),
      ]),
    },
    historicalSuccess: {
      successCount:
        typeof currentHistory.successCount === 'number'
          ? currentHistory.successCount
          : typeof proposedHistory.successCount === 'number'
            ? proposedHistory.successCount
            : 0,
      failureCount:
        typeof currentHistory.failureCount === 'number'
          ? currentHistory.failureCount
          : typeof proposedHistory.failureCount === 'number'
            ? proposedHistory.failureCount
            : 0,
      lastSuccessAt: currentHistory.lastSuccessAt ?? proposedHistory.lastSuccessAt ?? null,
    },
    state: mergeStringRecordSetIfAbsent(
      isRecord(current.state) ? current.state : {},
      isRecord(proposed.state) ? proposed.state : {},
    ),
    mappedScreens: uniqueStrings([
      ...(Array.isArray(current.mappedScreens) ? current.mappedScreens : []),
      ...(Array.isArray(proposed.mappedScreens) ? proposed.mappedScreens : []),
    ]),
  };
}

function mergeRoute(current: Record<string, unknown>, proposed: Record<string, unknown>): Record<string, unknown> {
  const existingVariants = routeRecords(current.variants);
  const proposedVariants = routeRecords(proposed.variants);
  const proposedById = new Map(
    proposedVariants.flatMap((variant) => typeof variant.id === 'string' ? [[variant.id, variant] as const] : []),
  );
  const currentById = new Map(
    existingVariants.flatMap((variant) => typeof variant.id === 'string' ? [[variant.id, variant] as const] : []),
  );
  const variantIds = [...new Set([...currentById.keys(), ...proposedById.keys()])].sort((left, right) => left.localeCompare(right));

  return {
    id: current.id ?? proposed.id,
    screen: current.screen ?? proposed.screen,
    entryUrl: current.entryUrl ?? proposed.entryUrl,
    rootSelector: current.rootSelector ?? proposed.rootSelector ?? null,
    variants: variantIds.map((variantId) => {
      const existing = currentById.get(variantId);
      const incoming = proposedById.get(variantId);
      if (existing && incoming) {
        return mergeRouteVariant(existing, incoming);
      }
      return existing ?? incoming ?? {};
    }),
  };
}

function applyRoutesPatch(existing: Record<string, unknown>, proposal: ProposalEntry): Record<string, unknown> {
  const patch = proposal.patch;
  if (!isRecord(patch)) {
    return existing;
  }

  const existingRoutes = routeRecords(existing.routes);
  const proposedRoutes = routeRecords(patch.routes);
  const proposedById = new Map(
    proposedRoutes.flatMap((route) => typeof route.id === 'string' ? [[route.id, route] as const] : []),
  );
  const currentById = new Map(
    existingRoutes.flatMap((route) => typeof route.id === 'string' ? [[route.id, route] as const] : []),
  );
  const routeIds = [...new Set([...currentById.keys(), ...proposedById.keys()])].sort((left, right) => left.localeCompare(right));

  return {
    kind: existing.kind ?? patch.kind ?? 'route-knowledge',
    version: existing.version ?? patch.version ?? 1,
    governance: existing.governance ?? patch.governance ?? 'approved',
    app: existing.app ?? patch.app ?? 'unknown',
    baseUrl: existing.baseUrl ?? patch.baseUrl ?? null,
    routes: routeIds.map((routeId) => {
      const currentRoute = currentById.get(routeId);
      const proposedRoute = proposedById.get(routeId);
      if (currentRoute && proposedRoute) {
        return mergeRoute(currentRoute, proposedRoute);
      }
      return currentRoute ?? proposedRoute ?? {};
    }),
  };
}

function inferAffordanceFromLegacyWidget(widget: string | null): string | null {
  if (!widget) return null;
  const role = roleForWidget(widget);
  return role ? primaryAffordanceForRole(role) : null;
}

function normalizedHintsEnrichment(
  proposal: ProposalEntry,
  patch: Record<string, unknown>,
): {
  readonly role: string | null;
  readonly affordance: string | null;
  readonly locatorLadder: readonly unknown[];
  readonly source: string | null;
  readonly epistemicStatus: string | null;
  readonly activationPolicy: string | null;
} {
  const patchEnrichment = isRecord(patch.enrichment) ? patch.enrichment : {};
  const proposalEnrichment = proposal.enrichment ?? null;
  const role =
    typeof proposalEnrichment?.role === 'string' ? proposalEnrichment.role
      : typeof patchEnrichment.role === 'string' ? patchEnrichment.role
        : typeof patch.role === 'string' ? patch.role
          : null;
  const affordance =
    typeof proposalEnrichment?.affordance === 'string' ? proposalEnrichment.affordance
      : typeof patchEnrichment.affordance === 'string' ? patchEnrichment.affordance
        : inferAffordanceFromLegacyWidget(typeof patch.widget === 'string' ? patch.widget : null);
  const locatorLadder =
    Array.isArray(proposalEnrichment?.locatorLadder) && proposalEnrichment.locatorLadder.length > 0
      ? proposalEnrichment.locatorLadder
      : Array.isArray(patchEnrichment.locatorLadder) && patchEnrichment.locatorLadder.length > 0
        ? patchEnrichment.locatorLadder
        : Array.isArray(patch.locator) && patch.locator.length > 0
          ? patch.locator
          : [];
  const source =
    typeof proposalEnrichment?.source === 'string' ? proposalEnrichment.source
      : typeof patchEnrichment.source === 'string' ? patchEnrichment.source
        : typeof patch.source === 'string' ? patch.source
          : null;
  const epistemicStatus =
    typeof proposalEnrichment?.epistemicStatus === 'string' ? proposalEnrichment.epistemicStatus
      : typeof patchEnrichment.epistemicStatus === 'string' ? patchEnrichment.epistemicStatus
        : null;
  const activationPolicy =
    typeof proposalEnrichment?.activationPolicy === 'string' ? proposalEnrichment.activationPolicy
      : typeof patchEnrichment.activationPolicy === 'string' ? patchEnrichment.activationPolicy
        : locatorLadder.length > 0
          ? 'merge-locator-ladder'
          : (role || affordance || source || epistemicStatus) ? 'set-if-absent' : null;
  return {
    role,
    affordance,
    locatorLadder,
    source,
    epistemicStatus,
    activationPolicy,
  };
}

/** Apply a hints patch to an existing artifact. Pure — returns new object. */
function applyHintsPatch(existing: Record<string, unknown>, proposal: ProposalEntry): Record<string, unknown> {
  const patch = proposal.patch;
  if (!isRecord(patch)) return existing;

  const screen = typeof patch.screen === 'string' ? patch.screen : existing.screen;
  const element = typeof patch.element === 'string' ? patch.element : null;
  const alias = typeof patch.alias === 'string' ? patch.alias : null;
  const screenAlias = typeof patch.screenAlias === 'string' ? patch.screenAlias : null;

  // Screen-level alias patch: append to screenAliases array
  if (screen && screenAlias) {
    const existingAliases = Array.isArray(existing.screenAliases) ? existing.screenAliases : [];
    return {
      ...existing,
      screen,
      screenAliases: withAlias(existingAliases, screenAlias),
    };
  }

  if (!screen || !element || !alias) return deepMergeLattice.join(existing, patch);

  const elements = isRecord(existing.elements) ? existing.elements : {};
  const elementEntry = isRecord(elements[element]) ? elements[element] as Record<string, unknown> : {};
  const enrichment = normalizedHintsEnrichment(proposal, patch);
  const existingLocatorLadder = Array.isArray(elementEntry.locatorLadder) ? elementEntry.locatorLadder : [];
  const locatorLadder = enrichment.locatorLadder.length > 0
    ? mergeLocatorLadder(existingLocatorLadder, enrichment.locatorLadder)
    : existingLocatorLadder;

  const updatedEntry: Record<string, unknown> = {
    ...elementEntry,
    aliases: withAlias(Array.isArray(elementEntry.aliases) ? elementEntry.aliases : [], alias),
    ...(elementEntry.role === undefined && enrichment.role !== null ? { role: enrichment.role } : {}),
    ...(elementEntry.affordance === undefined && enrichment.affordance !== null ? { affordance: enrichment.affordance } : {}),
    ...(locatorLadder.length > 0 ? { locatorLadder } : {}),
    ...(elementEntry.source === undefined && enrichment.source !== null ? { source: enrichment.source } : {}),
    ...(elementEntry.epistemicStatus === undefined && enrichment.epistemicStatus !== null ? { epistemicStatus: enrichment.epistemicStatus } : {}),
    ...(elementEntry.activationPolicy === undefined && enrichment.activationPolicy !== null ? { activationPolicy: enrichment.activationPolicy } : {}),
    acquired: {
      certification: proposal.certification,
      activatedAt: proposal.activation.activatedAt,
      certifiedAt: proposal.activation.certifiedAt,
      lineage: proposal.lineage,
    },
  };

  return {
    ...existing,
    screen,
    elements: { ...elements, [element]: updatedEntry },
  };
}

export function applyProposalPatch(existing: Record<string, unknown>, proposal: ProposalEntry): Record<string, unknown> {
  if (proposal.artifactType === 'hints') {
    return applyHintsPatch(existing, proposal);
  }
  if (proposal.artifactType === 'routes' || proposal.targetPath.endsWith('.routes.yaml')) {
    return applyRoutesPatch(existing, proposal);
  }
  return deepMergeLattice.join(existing, proposal.patch);
}

export const serializeProposalArtifact = (targetPath: string, artifact: Record<string, unknown>): string =>
  targetPath.endsWith('.json')
    ? JSON.stringify(artifact, null, 2)
    : YAML.stringify(artifact, { indent: 2 });

export const parseProposalArtifact = (raw: string, targetPath: string): Record<string, unknown> => {
  if (targetPath.endsWith('.json')) return JSON.parse(raw) as Record<string, unknown>;
  const parsed = YAML.parse(raw);
  return isRecord(parsed) ? parsed : {};
};

export function validatePatchedProposalArtifact(targetPath: string, proposal: ProposalEntry, artifact: Record<string, unknown>): void {
  if (proposal.artifactType === 'hints' || targetPath.endsWith('.hints.yaml')) {
    validateScreenHints(artifact);
  }
  if (proposal.artifactType === 'routes' || targetPath.endsWith('.routes.yaml')) {
    validateRouteKnowledgeManifest(artifact);
  }
}

// ─── ContextualMerge instance ──────────────────────────────────────────
//
// Proposal patching as ContextualMerge<Record<string, unknown>, string>:
//   slice: extract base artifact by target path
//   overlay: apply proposal patch
//   join: deep merge records (right-biased lattice join)
//
// The lattice is: join = deep merge (right-biased), meet = intersection,
// bottom = {}, top = impossible (open record type).

/**
 * Deep merge lattice: the join-semilattice for proposal artifact patching.
 * Join = right-biased deep merge. Meet = intersection of shared keys.
 * Order = subset-of-keys (a ≤ b iff every key in a is also in b).
 */
export const deepMergeLattice: Lattice<Record<string, unknown>> = {
  join: (a: Record<string, unknown>, b: Record<string, unknown>) => mergeRecords(a, b),
  meet: (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(a)) {
      if (key in b) result[key] = b[key];
    }
    return result;
  },
  order: (a: Record<string, unknown>, b: Record<string, unknown>) =>
    Object.keys(a).every((key) => key in b),
};

/**
 * Proposal patching expressed as a ContextualMerge instance.
 * Index = artifact target path. Identity = empty record.
 * Lattice = deepMergeLattice (right-biased deep merge).
 *
 * This is the named abstraction from the design calculus: the
 * slice → overlay → join pattern that all proposal patching follows.
 */
export const proposalPatchMerge: ContextualMerge<Record<string, unknown>, string> = {
  lattice: deepMergeLattice,
  index: () => '',  // index is external (target path), not intrinsic to the value
  identity: {},
};
