import { createHash } from 'crypto';
import { normalizeAriaSnapshot } from './aria-snapshot';
import type { AdoParameter, AdoStep } from './types/intent';

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&apos;': "'",
  '&gt;': '>',
  '&lt;': '<',
  '&nbsp;': ' ',
  '&quot;': '"',
};

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    const body = entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',');
    return `{${body}}`;
  }

  return JSON.stringify(value);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(amp|apos|gt|lt|nbsp|quot);/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

export function normalizeHtmlText(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export { normalizeAriaSnapshot };

export function computeAdoContentHash(input: {
  steps: AdoStep[];
  parameters: AdoParameter[];
}): string {
  const normalized = {
    parameters: input.parameters.map((parameter) => ({
      name: parameter.name,
      values: [...parameter.values],
    })),
    steps: input.steps.map((step) => ({
      action: normalizeHtmlText(step.action),
      expected: normalizeHtmlText(step.expected),
      index: step.index,
      sharedStepId: step.sharedStepId ?? null,
    })),
  };

  return `sha256:${sha256(stableStringify(normalized))}`;
}

export function computeNormalizedSnapshotHash(snapshot: string): string {
  return sha256(normalizeAriaSnapshot(snapshot));
}
