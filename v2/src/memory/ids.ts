/**
 * Facet identity. A facet id is `<screen>:<local>` with both segments
 * kebab-case; it never changes (a rename is an `id-migration` evidence
 * event). Locator identity is a short hash of the rendered Playwright
 * expression, so two specs that build the same locator (for example
 * `exact` omitted versus `exact: true` on a role-name) are one locator.
 */
import { ToolError } from '../core/errors.js';
import { sha256Hex } from '../core/hash.js';
import { slugify } from '../core/text.js';
import { locatorKey } from '../locator/locator.js';
import type { LocatorSpec } from '../contract/schemas.js';

export const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export const isSlug = (text: string): boolean => SLUG.test(text) && text.length <= 80;

export interface ParsedFacetId {
  readonly screen: string;
  readonly local: string;
}

/** Throws invalid-input unless the screen name is a kebab-case slug (it becomes a file name). */
export const assertScreenName = (screen: string): string => {
  if (!isSlug(screen)) {
    throw new ToolError('invalid-input', `screen name must be kebab-case (a-z, 0-9, -), got "${screen}"`, { screen });
  }
  return screen;
};

/** Lifted from v1 `facetIdFrom`, with the slug rule on both segments. */
export const facetIdFrom = (screen: string, local: string): string => {
  if (screen.length === 0 || local.length === 0) {
    throw new ToolError('invalid-input', 'facet id segments must be non-empty', { screen, local });
  }
  if (screen.includes(':') || local.includes(':')) {
    throw new ToolError('invalid-input', `":" separates the facet id segments and cannot appear inside "${screen}:${local}"`, { screen, local });
  }
  if (!isSlug(screen) || !isSlug(local)) {
    throw new ToolError('invalid-input', `facet id segments must be kebab-case, got "${screen}:${local}"`, { screen, local });
  }
  return `${screen}:${local}`;
};

/** Lifted from v1 `parseFacetId`: null for anything that is not exactly two non-empty segments. */
export const parseFacetId = (id: string): ParsedFacetId | null => {
  const parts = id.split(':');
  if (parts.length !== 2) return null;
  const [screen, local] = parts as [string, string];
  if (screen.length === 0 || local.length === 0) return null;
  return { screen, local };
};

/** Like parseFacetId, but throws invalid-input, for ids that arrive from tool input. */
export const requireFacetId = (id: string): ParsedFacetId => {
  const parsed = parseFacetId(id);
  if (parsed === null || !isSlug(parsed.screen) || !isSlug(parsed.local)) {
    throw new ToolError('invalid-input', `facet id must be "<screen>:<name>" in kebab-case, got "${id}"`, { facetId: id });
  }
  return parsed;
};

/** The screen segment of a facet id, or null when the id is malformed. */
export const screenOf = (id: string): string | null => parseFacetId(id)?.screen ?? null;

/** The local id a draft gets: its explicit name, else its display name, slugified. */
export const localIdFor = (draft: { readonly name?: string; readonly displayName: string }): string =>
  slugify(draft.name !== undefined && draft.name.trim().length > 0 ? draft.name : draft.displayName);

/** The locator spec without the display/projection fields (expression, health, note), as evidence stores it. */
export const bareLocator = (spec: LocatorSpec): LocatorSpec => {
  const { expression: _expression, health: _health, note: _note, ...bare } = spec as LocatorSpec & { health?: string; note?: string };
  return bare;
};

/**
 * Stable identity of a locator: 12 hex characters of the hash of its
 * rendered expression. `expression`, `health`, and `note` never take part.
 */
export const locatorKeyOf = (spec: LocatorSpec): string => sha256Hex(locatorKey(bareLocator(spec))).slice(0, 12);
