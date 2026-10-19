/**
 * The page fingerprint every receipt carries, so a failure on a held-out
 * screen explains itself. Lifted from
 * workshop/customer-backlog/application/page-fingerprint.ts, with the
 * counts now taken from the walker's affordance ladder (not inherited
 * cursor:pointer) and a digest added.
 *
 * The digest covers a stable projection only: the landmark set, the set
 * (not counts) of interactive roles, the distinct data-block names and the
 * runtime global. Row counts, titles and anything else that moves with the
 * data are reported but not hashed, so a search that returns five rows
 * instead of three is not drift.
 */
import { fingerprintOf } from '../core/hash.js';
import { redact, type PiiMode } from '../core/pii.js';
import type { PageFingerprint } from '../contract/schemas.js';
import type { FingerprintInputs } from './in-page/walker.js';

export type { FingerprintInputs } from './in-page/walker.js';

/** What the digest is computed over. Kept in the snapshot record so two records can be diffed in detail. */
export interface FingerprintBasis {
  readonly landmarks: readonly string[];
  readonly interactiveRoles: readonly string[];
  readonly dataBlockNames: readonly string[];
  readonly runtimeGlobal: string | null;
}

const sortedUnique = (values: readonly string[]): readonly string[] => [...new Set(values)].sort();

export const fingerprintBasis = (inputs: FingerprintInputs): FingerprintBasis => ({
  landmarks: sortedUnique(inputs.landmarks),
  interactiveRoles: sortedUnique(Object.keys(inputs.roleCounts).filter((role) => (inputs.roleCounts[role] ?? 0) > 0)),
  dataBlockNames: sortedUnique(inputs.dataBlockNames),
  runtimeGlobal: inputs.runtimeGlobal,
});

export const fingerprintHash = (basis: FingerprintBasis): string => fingerprintOf({ v: 1, ...basis });

/** The URL path only (no query, no fragment), PII-gated. */
export const pathOf = (url: string, pii: PiiMode): string => {
  try {
    return redact(new URL(url).pathname, pii);
  } catch {
    return redact(url.split(/[?#]/)[0] ?? '', pii);
  }
};

export const buildFingerprint = (inputs: FingerprintInputs, url: string, pii: PiiMode): PageFingerprint => ({
  hash: fingerprintHash(fingerprintBasis(inputs)),
  title: redact(inputs.title, pii),
  path: pathOf(url, pii),
  landmarks: [...sortedUnique(inputs.landmarks)],
  roleCounts: { ...inputs.roleCounts },
  interactive: inputs.interactive,
  rolelessInteractive: inputs.rolelessInteractive,
  placeholderOnlyInputs: inputs.placeholderOnlyInputs,
  dataBlocks: inputs.dataBlocks,
  runtimeGlobal: inputs.runtimeGlobal,
});

const setDiff = (label: string, before: readonly string[], after: readonly string[]): readonly string[] => {
  const added = after.filter((value) => !before.includes(value));
  const removed = before.filter((value) => !after.includes(value));
  return [
    ...(added.length > 0 ? [`${label} added: ${added.join(', ')}`] : []),
    ...(removed.length > 0 ? [`${label} removed: ${removed.join(', ')}`] : []),
  ];
};

const rolesPresent = (fingerprint: PageFingerprint): readonly string[] =>
  Object.keys(fingerprint.roleCounts).filter((role) => (fingerprint.roleCounts[role] ?? 0) > 0).sort();

/**
 * Human-readable differences between two fingerprints, structural ones
 * first. Pass the bases (from the snapshot records) to name changed
 * data-block names; without them a digest change that no listed field
 * explains is reported as such.
 */
export const diffFingerprints = (
  a: PageFingerprint,
  b: PageFingerprint,
  bases?: { readonly before: FingerprintBasis; readonly after: FingerprintBasis },
): readonly string[] => {
  const structural = [
    ...setDiff('landmarks', a.landmarks, b.landmarks),
    ...setDiff('interactive roles', rolesPresent(a), rolesPresent(b)),
    ...(bases !== undefined ? setDiff('data-blocks', bases.before.dataBlockNames, bases.after.dataBlockNames) : []),
    ...(a.runtimeGlobal !== b.runtimeGlobal ? [`runtime global: ${a.runtimeGlobal ?? 'none'} → ${b.runtimeGlobal ?? 'none'}`] : []),
  ];
  const unexplained = a.hash !== b.hash && structural.length === 0 ? ['structure digest changed (data-block names)'] : [];
  const incidental = [
    ...(a.path !== b.path ? [`path: ${a.path} → ${b.path}`] : []),
    ...(a.title !== b.title ? [`title: "${a.title}" → "${b.title}"`] : []),
    ...(a.dataBlocks !== b.dataBlocks ? [`data-block count: ${a.dataBlocks} → ${b.dataBlocks}`] : []),
    ...(a.interactive !== b.interactive ? [`interactive elements: ${a.interactive} → ${b.interactive}`] : []),
    ...(a.rolelessInteractive !== b.rolelessInteractive
      ? [`roleless interactive elements: ${a.rolelessInteractive} → ${b.rolelessInteractive}`]
      : []),
    ...(a.placeholderOnlyInputs !== b.placeholderOnlyInputs
      ? [`placeholder-only inputs: ${a.placeholderOnlyInputs} → ${b.placeholderOnlyInputs}`]
      : []),
  ];
  return [...structural, ...unexplained, ...incidental];
};
