import YAML from 'yaml';
import { isRecord } from '../../domain/kernel/collections';
import type { ProposalEntry } from '../../domain/execution/types';
import { validateScreenHints } from '../../domain/validation';
import type { Lattice } from '../../domain/algebra/lattice';
import type { ContextualMerge } from '../../domain/algebra/contextual-merge';

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

  // Enriched patch data: role, widget, locator (when available from proposals)
  const role = typeof patch.role === 'string' ? patch.role : elementEntry.role;
  const widget = typeof patch.widget === 'string' ? patch.widget : elementEntry.widget;
  const locator = Array.isArray(patch.locator) && patch.locator.length > 0 ? patch.locator : elementEntry.locator;

  const updatedEntry: Record<string, unknown> = {
    ...elementEntry,
    aliases: withAlias(Array.isArray(elementEntry.aliases) ? elementEntry.aliases : [], alias),
    ...(role !== undefined ? { role } : {}),
    ...(widget !== undefined ? { widget } : {}),
    ...(locator !== undefined ? { locator } : {}),
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
  return proposal.artifactType === 'hints'
    ? applyHintsPatch(existing, proposal)
    : deepMergeLattice.join(existing, proposal.patch);
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
