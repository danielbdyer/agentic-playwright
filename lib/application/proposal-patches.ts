import YAML from 'yaml';
import { isRecord } from '../domain/collections';
import type { ProposalEntry } from '../domain/types';
import { validateScreenHints } from '../domain/validation';

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

  if (!screen || !element || !alias) return mergeRecords(existing, patch);

  const elements = isRecord(existing.elements) ? existing.elements : {};
  const elementEntry = isRecord(elements[element]) ? elements[element] as Record<string, unknown> : {};

  const updatedEntry: Record<string, unknown> = {
    ...elementEntry,
    aliases: withAlias(Array.isArray(elementEntry.aliases) ? elementEntry.aliases : [], alias),
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
    : mergeRecords(existing, proposal.patch);
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
