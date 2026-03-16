import YAML from 'yaml';
import { isRecord } from '../domain/collections';
import type { ProposalEntry } from '../domain/types';
import { validateScreenHints } from '../domain/validation';

function mergeRecords(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (isRecord(value) && isRecord(next[key])) {
      next[key] = mergeRecords(next[key] as Record<string, unknown>, value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

function applyHintsPatch(existing: Record<string, unknown>, proposal: ProposalEntry): Record<string, unknown> {
  const patch = proposal.patch;
  if (!isRecord(patch)) {
    return existing;
  }
  const screen = typeof patch.screen === 'string' ? patch.screen : existing.screen;
  const element = typeof patch.element === 'string' ? patch.element : null;
  const alias = typeof patch.alias === 'string' ? patch.alias : null;
  if (!screen || !element || !alias) {
    return mergeRecords(existing, patch);
  }

  const elements = isRecord(existing.elements) ? { ...existing.elements } : {};
  const elementEntry = isRecord(elements[element]) ? { ...elements[element] as Record<string, unknown> } : {};
  const aliases = Array.isArray(elementEntry.aliases) ? [...elementEntry.aliases] : [];
  if (!aliases.includes(alias)) {
    aliases.push(alias);
  }
  aliases.sort((left, right) => String(left).localeCompare(String(right)));
  elementEntry.aliases = aliases;
  elementEntry.acquired = {
    certification: proposal.certification,
    activatedAt: proposal.activation.activatedAt,
    certifiedAt: proposal.activation.certifiedAt,
    lineage: proposal.lineage,
  };
  elements[element] = elementEntry;

  return {
    ...existing,
    screen,
    elements,
  };
}

export function applyProposalPatch(existing: Record<string, unknown>, proposal: ProposalEntry): Record<string, unknown> {
  if (proposal.artifactType === 'hints') {
    return applyHintsPatch(existing, proposal);
  }
  return mergeRecords(existing, proposal.patch);
}

export function serializeProposalArtifact(targetPath: string, artifact: Record<string, unknown>): string {
  return targetPath.endsWith('.json')
    ? JSON.stringify(artifact, null, 2)
    : YAML.stringify(artifact, { indent: 2 });
}

export function parseProposalArtifact(raw: string, targetPath: string): Record<string, unknown> {
  if (targetPath.endsWith('.json')) {
    return JSON.parse(raw) as Record<string, unknown>;
  }
  const parsed = YAML.parse(raw);
  return isRecord(parsed) ? parsed : {};
}

export function validatePatchedProposalArtifact(targetPath: string, proposal: ProposalEntry, artifact: Record<string, unknown>): void {
  if (proposal.artifactType === 'hints' || targetPath.endsWith('.hints.yaml')) {
    validateScreenHints(artifact);
  }
}
