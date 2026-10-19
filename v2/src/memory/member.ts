/**
 * Page-object member names. A facet becomes `get <member>(): Locator` (or a
 * method, for a parameterized row) on its screen's page object, so the name
 * must be a valid identifier, must not collide with what the class already
 * has (`page`, `goto`, the constructor) or with `then` (a getter named
 * `then` makes the page object a thenable that `await` would call), and must
 * be unique within the screen.
 */
import { camelCase } from '../core/text.js';
import type { Facet } from '../contract/schemas.js';
import { parseFacetId } from './ids.js';

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Names the generated class already uses or that break it. */
export const RESERVED_MEMBERS: ReadonlySet<string> = new Set([
  'constructor', 'page', 'goto', 'then', 'catch', 'finally', 'toString', 'valueOf', 'toJSON', 'hasOwnProperty', '__proto__', 'prototype',
]);

/** The member name a facet asks for: its explicit `member` when it is a usable identifier, else camelCase of its local id. */
export const preferredMemberName = (facet: Pick<Facet, 'id' | 'member'>): string => {
  const explicit = facet.member?.trim();
  const base = explicit !== undefined && explicit.length > 0
    ? (IDENTIFIER.test(explicit) ? explicit : camelCase(explicit))
    : camelCase(parseFacetId(facet.id)?.local ?? facet.id);
  return RESERVED_MEMBERS.has(base) ? `${base}Facet` : base;
};

/**
 * Member names for all facets of one screen, unique: facets are taken in id
 * order and a later collision gets a numeric suffix (`searchButton2`).
 * Retired facets are included so names do not shift when one is retired.
 */
export const memberNames = (facets: readonly Pick<Facet, 'id' | 'member'>[]): Readonly<Record<string, string>> => {
  const sorted = [...facets].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Explicit members claim their names first, so a human's choice is never the one suffixed.
  const hasExplicit = (f: Pick<Facet, 'member'>): boolean => f.member !== undefined && f.member.trim().length > 0;
  const explicitFirst = [...sorted.filter(hasExplicit), ...sorted.filter((f) => !hasExplicit(f))];
  const taken = new Set<string>();
  const names: Record<string, string> = {};
  for (const facet of explicitFirst) {
    const base = preferredMemberName(facet);
    let name = base;
    for (let n = 2; taken.has(name); n += 1) name = `${base}${n}`;
    taken.add(name);
    names[facet.id] = name;
  }
  return names;
};

/**
 * The page-object member name for a facet. Pass the screen's facets to get
 * the collision-free name; without them the preferred name is returned.
 */
export const memberNameFor = (facet: Pick<Facet, 'id' | 'member'>, screenFacets?: readonly Pick<Facet, 'id' | 'member'>[]): string => {
  if (screenFacets === undefined) return preferredMemberName(facet);
  const all = screenFacets.some((f) => f.id === facet.id) ? screenFacets : [...screenFacets, facet];
  return memberNames(all)[facet.id] ?? preferredMemberName(facet);
};
