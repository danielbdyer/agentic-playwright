/**
 * Turning what the agent saw into facet fields: aliases kept short and few
 * (v1 grew 18 sentence-length aliases on one element, one of them wrong), a
 * locator derived from a snapshot candidate when the agent has no verified
 * one, and the "is this the same element?" test that decides whether a mint
 * folds into an existing facet or is a conflict.
 */
import { normalizeText, tokenize } from '../core/text.js';
import { redact, type PiiMode } from '../core/pii.js';
import type { Candidate, Facet, FacetKind, LocatorScope, LocatorSpec } from '../contract/schemas.js';
import { locatorKeyOf } from './ids.js';

export const MAX_ALIASES = 12;
export const MAX_ALIAS_LENGTH = 80;

const QUOTES = /^["'`“”‘’]+|["'`“”‘’]+$/g;

/** NFKC, collapsed whitespace, surrounding quotes and punctuation trimmed, PII redacted. */
export const cleanName = (text: string, pii: PiiMode): string =>
  redact(normalizeText(text).replace(QUOTES, '').replace(/^[\s.,;:!?-]+|[\s.,;:!?]+$/g, '').trim(), pii);

const comparable = (text: string): string => normalizeText(text).toLowerCase();

export interface AliasMerge {
  readonly aliases: readonly string[];
  readonly added: readonly string[];
  /** Aliases not kept, each with the reason (too long, no words, cap reached). */
  readonly dropped: readonly string[];
}

/**
 * Merge proposed aliases into existing ones: cleaned, lowercased, distinct
 * from each other and from the display name, at most 80 characters, at most
 * 12 in all (existing ones keep their places).
 */
export const mergeAliases = (existing: readonly string[], proposed: readonly string[], displayName: string, pii: PiiMode): AliasMerge => {
  const seen = new Set([comparable(displayName), ...existing.map(comparable)]);
  return proposed.reduce<AliasMerge>(
    (acc, raw) => {
      const alias = cleanName(raw, pii).toLowerCase();
      if (alias.length === 0 || seen.has(comparable(alias))) return acc;
      if (alias.length > MAX_ALIAS_LENGTH) return { ...acc, dropped: [...acc.dropped, `"${alias.slice(0, 40)}…" (longer than ${MAX_ALIAS_LENGTH} characters)`] };
      if (tokenize(alias).length === 0) return { ...acc, dropped: [...acc.dropped, `"${alias}" (no searchable words)`] };
      if (acc.aliases.length >= MAX_ALIASES) return { ...acc, dropped: [...acc.dropped, `"${alias}" (already ${MAX_ALIASES} aliases)`] };
      seen.add(comparable(alias));
      return { aliases: [...acc.aliases, alias], added: [...acc.added, alias], dropped: acc.dropped };
    },
    { aliases: [...existing], added: [], dropped: [] },
  );
};

const CSS_IDENT = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** `#id` when the id is a plain CSS identifier, else an attribute selector. */
export const idSelector = (id: string): string =>
  CSS_IDENT.test(id) ? `#${id}` : `[id="${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;

export interface DerivedLocator {
  readonly locator: LocatorSpec;
  readonly note?: string;
}

const landmarkScope = (candidate: Candidate): LocatorScope | undefined =>
  candidate.landmark === undefined
    ? undefined
    : { landmark: candidate.landmark, ...(candidate.landmarkName !== undefined ? { landmarkName: candidate.landmarkName } : {}) };

const withScope = (locator: LocatorSpec, scope: LocatorScope | undefined): LocatorSpec =>
  scope === undefined ? locator : { ...locator, scope };

/**
 * A locator for a candidate the agent did not verify, best rung first:
 * row-text for a parameterized row facet; role and name (landmark-scoped);
 * placeholder; text for a roleless handler owner; test id; a designer or
 * plain id; role alone; a structural id last, marked fragile. Null when the
 * candidate offers nothing to locate it by.
 */
export const deriveLocator = (candidate: Candidate, draft: { readonly kind: FacetKind; readonly parameter?: string }): DerivedLocator | null => {
  const scope = landmarkScope(candidate);
  const name = candidate.name.trim();
  const role = candidate.role.trim();
  const hasRole = role.length > 0 && role !== 'generic' && role !== 'none' && role !== 'presentation';
  if (draft.kind === 'row' && draft.parameter !== undefined && draft.parameter.length > 0) {
    return { locator: withScope({ strategy: 'row-text', value: `{${draft.parameter}}` }, scope) };
  }
  if (hasRole && name.length > 0) return { locator: withScope({ strategy: 'role-name', role, name }, scope) };
  if (candidate.placeholder !== undefined && candidate.placeholder.trim().length > 0) {
    return { locator: withScope({ strategy: 'placeholder', value: candidate.placeholder.trim() }, scope) };
  }
  if (!hasRole && name.length > 0) return { locator: withScope({ strategy: 'text', value: name }, scope) };
  if (candidate.testId !== undefined && candidate.testId.length > 0) return { locator: { strategy: 'test-id', value: candidate.testId } };
  if (candidate.id !== undefined && candidate.id.length > 0 && candidate.idKind !== 'structural') {
    return { locator: { strategy: 'css', value: idSelector(candidate.id) } };
  }
  if (hasRole) return { locator: withScope({ strategy: 'role-name', role }, scope) };
  if (candidate.id !== undefined && candidate.id.length > 0) {
    return { locator: { strategy: 'css', value: idSelector(candidate.id) }, note: 'structural id, fragile' };
  }
  return null;
};

/** role | name | landmark, normalized: two targets with the same signature are the same element. */
const signature = (role: string | undefined, name: string | undefined, landmark: string | undefined): string | null =>
  role === undefined || role.length === 0 || name === undefined || name.trim().length === 0
    ? null
    : `${role}|${comparable(name)}|${landmark ?? ''}`;

const facetSignatures = (facet: Facet): ReadonlySet<string> =>
  new Set(
    facet.locators
      .filter((locator) => locator.strategy === 'role-name')
      .map((locator) => signature(locator.role, locator.name, locator.scope?.landmark ?? facet.scope?.landmark))
      .filter((s): s is string => s !== null),
  );

/** What a new mint points at, for comparison with an existing facet. */
export interface TargetIdentity {
  readonly locatorKey: string;
  readonly signatures: ReadonlySet<string>;
}

export const targetIdentity = (locator: LocatorSpec, candidate: Candidate, facetLandmark: string | undefined): TargetIdentity => ({
  locatorKey: locatorKeyOf(locator),
  signatures: new Set(
    [
      locator.strategy === 'role-name' ? signature(locator.role, locator.name, locator.scope?.landmark ?? facetLandmark) : null,
      signature(candidate.role, candidate.name, candidate.landmark),
    ].filter((s): s is string => s !== null),
  ),
});

/** Same element: the facet already has this locator, or a role-name locator with the same role, name, and landmark. */
export const isEquivalentTarget = (facet: Facet, target: TargetIdentity): boolean => {
  if (facet.locators.some((locator) => locatorKeyOf(locator) === target.locatorKey)) return true;
  const existing = facetSignatures(facet);
  return [...target.signatures].some((s) => existing.has(s));
};

/** The live facet (other than `exceptId`) that already owns a locator key, if any. Retired facets own nothing. */
export const ownerOfLocator = (facets: readonly Facet[], key: string, exceptId: string): Facet | undefined =>
  facets.find((facet) => facet.id !== exceptId && facet.status !== 'retired' && facet.locators.some((locator) => locatorKeyOf(locator) === key));
