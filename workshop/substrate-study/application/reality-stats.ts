/**
 * Reality stats — the six measurements `docs/v2-substrate-reality-
 * study.md §2` reports, computed from a SnapshotRecord so the study
 * is reproducible and so a held-out route can be scored against the
 * same yardstick the study routes were.
 *
 *   F1  Reactive identity: variant verdict, `data-block` count,
 *       distinct block names.
 *   F2  Naming path shares over elements that resolved a name.
 *       Placeholder-only inputs counted separately.
 *   F3  Roleless interactives: interactive elements with no ARIA
 *       role (explicit or implicit), as a share of all interactives.
 *   F4  Landmark roles present.
 *   F5  Structural ids (block/list-path shape) vs. other ids;
 *       `data-testid` count; max depth.
 *   F6  Top data-* attribute names by frequency.
 *
 * Pure — no Effect, no IO. Reads only the node list.
 */

import type { NamingSource, SnapshotNode, SnapshotRecord } from '../domain/snapshot-record';

/** Tags whose implicit ARIA role makes them role-addressable
 *  without a `role` attribute. `a` counts only with `href`, which
 *  the walker does not record — treated as role-bearing here, so
 *  the roleless share is a lower bound (the study's own §2 F3
 *  reading used the same convention). */
const IMPLICIT_ROLE_TAGS: ReadonlySet<string> = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'summary', 'option',
]);

const LANDMARK_ROLES: ReadonlySet<string> = new Set([
  'banner', 'navigation', 'main', 'search', 'region', 'complementary', 'contentinfo', 'form',
]);

/** Compiled block/list-path id shape: `b3-Column`, `l1-0_0-$b2`,
 *  `l1-0_0-b3-l2-1_1-$b4`, `l2_0-2_0-Select`, `l2_0-2_1-b6-Content`.
 *  A block segment is `b<n>`; a list segment is `l<n>[_<n>]-<i>_<j>`;
 *  the leaf is `$b<n>` or a block/list segment followed by a
 *  designer-given widget name. Ids that are ONLY a widget name
 *  (`Filters`, `SelectAll`) are not structural — the held-out
 *  Bulkactionswithfilters screen showed those exist too. */
const STRUCTURAL_ID_RE =
  /^(?:(?:b\d+|l\d+(?:_\d+)?-\d+_\d+)-)*(?:\$b\d+|(?:b\d+|l\d+(?:_\d+)?-\d+_\d+)-[A-Za-z][A-Za-z0-9]*)$/;

const NAMING_SOURCES: readonly NamingSource[] = [
  'content', 'aria-label', 'aria-labelledby', 'label-for', 'label-wrap', 'placeholder', 'none',
];

export interface RealityStats {
  readonly url: string;
  readonly nodeCount: number;
  readonly variant: SnapshotRecord['payload']['variantClassifier']['kind'];
  readonly hydration: string;
  /** F1 */
  readonly dataBlockCount: number;
  readonly distinctBlockNames: number;
  readonly osuiAnyTokenCount: number;
  /** F2 */
  readonly namedElements: number;
  readonly namingShares: Readonly<Record<NamingSource, number>>;
  readonly placeholderOnlyInputs: number;
  readonly formControls: number;
  /** F3 */
  readonly interactiveCount: number;
  readonly rolelessInteractiveCount: number;
  readonly rolelessInteractiveShare: number;
  readonly explicitRoleButtonDivs: number;
  readonly nativeButtons: number;
  readonly anchors: number;
  /** F4 */
  readonly landmarks: readonly string[];
  /** F5 */
  readonly structuralIds: number;
  readonly otherIds: number;
  readonly testIds: number;
  readonly maxDepth: number;
  /** F6 */
  readonly topDataAttrs: readonly (readonly [name: string, count: number])[];
}

function isRoleBearing(n: SnapshotNode): boolean {
  return n.ariaRole !== null || IMPLICIT_ROLE_TAGS.has(n.tag.toLowerCase());
}

function countBy<T>(items: readonly T[], key: (t: T) => string | null): ReadonlyMap<string, number> {
  return items.reduce((acc, item) => {
    const k = key(item);
    return k === null ? acc : new Map(acc).set(k, (acc.get(k) ?? 0) + 1);
  }, new Map<string, number>());
}

export function computeRealityStats(record: SnapshotRecord): RealityStats {
  const nodes = record.payload.nodes;
  const blocks = nodes.filter((n) => n.dataAttrNames.includes('data-block'));
  const blockNames = new Set(blocks.map((n) => n.dataAttrValues['data-block'] ?? ''));
  const osuiAny = nodes.filter((n) => n.classTokens.some((c) => c.startsWith('osui-'))).length;

  const named = nodes.filter((n) => n.ariaNaming.accessibleName !== null);
  const bySource = countBy(named, (n) => n.ariaNaming.source);
  const namingShares = Object.fromEntries(
    NAMING_SOURCES.map((s) => [s, named.length === 0 ? 0 : (bySource.get(s) ?? 0) / named.length]),
  ) as Record<NamingSource, number>;
  const formControls = nodes.filter((n) => ['input', 'select', 'textarea'].includes(n.tag.toLowerCase()) && n.interaction.inputType !== 'hidden');
  const placeholderOnlyInputs = formControls.filter((n) => n.ariaNaming.source === 'placeholder').length;

  const interactive = nodes.filter((n) => n.interaction.interactive && n.visibility === 'visible');
  const rolelessInteractive = interactive.filter((n) => !isRoleBearing(n));

  const landmarks = [...new Set(nodes.map((n) => n.ariaRole).filter((r): r is string => r !== null && LANDMARK_ROLES.has(r)))].sort();

  const ids = nodes.map((n) => n.id).filter((id): id is string => id !== null);
  const structuralIds = ids.filter((id) => STRUCTURAL_ID_RE.test(id)).length;
  const testIds = nodes.filter((n) => n.dataAttrNames.includes('data-testid')).length;

  const dataAttrCounts = countBy(nodes.flatMap((n) => n.dataAttrNames.map((a) => ({ a }))), (x) => x.a);
  const topDataAttrs = [...dataAttrCounts.entries()]
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .slice(0, 10)
    .map(([name, count]) => [name, count] as const);

  return {
    url: record.payload.url,
    nodeCount: record.payload.nodeCount,
    variant: record.payload.variantClassifier.kind,
    hydration: record.payload.hydration.kind,
    dataBlockCount: blocks.length,
    distinctBlockNames: blockNames.size,
    osuiAnyTokenCount: osuiAny,
    namedElements: named.length,
    namingShares,
    placeholderOnlyInputs,
    formControls: formControls.length,
    interactiveCount: interactive.length,
    rolelessInteractiveCount: rolelessInteractive.length,
    rolelessInteractiveShare: interactive.length === 0 ? 0 : rolelessInteractive.length / interactive.length,
    explicitRoleButtonDivs: nodes.filter((n) => n.ariaRole === 'button' && !['button', 'input'].includes(n.tag.toLowerCase())).length,
    nativeButtons: nodes.filter((n) => n.tag.toLowerCase() === 'button').length,
    anchors: nodes.filter((n) => n.tag.toLowerCase() === 'a').length,
    landmarks,
    structuralIds,
    otherIds: ids.length - structuralIds,
    testIds,
    maxDepth: nodes.reduce((m, n) => Math.max(m, n.depth), 0),
    topDataAttrs,
  };
}

/** One-line-per-finding rendering for the CLI and the study doc. */
export function renderRealityStats(s: RealityStats): string {
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  const shares = NAMING_SOURCES.filter((k) => k !== 'none').map((k) => `${k} ${pct(s.namingShares[k])}`).join(', ');
  return [
    `${s.url}`,
    `  nodes=${s.nodeCount} hydration=${s.hydration} variant=${s.variant} maxDepth=${s.maxDepth}`,
    `  F1 data-block=${s.dataBlockCount} (${s.distinctBlockNames} distinct) osui-any=${s.osuiAnyTokenCount}`,
    `  F2 named=${s.namedElements}: ${shares}; placeholder-only inputs ${s.placeholderOnlyInputs}/${s.formControls}`,
    `  F3 interactive=${s.interactiveCount} roleless=${s.rolelessInteractiveCount} (${pct(s.rolelessInteractiveShare)}); <button>=${s.nativeButtons} <a>=${s.anchors} div[role=button]=${s.explicitRoleButtonDivs}`,
    `  F4 landmarks=${s.landmarks.join('+') || '(none)'}`,
    `  F5 structural ids=${s.structuralIds} other ids=${s.otherIds} data-testid=${s.testIds}`,
    `  F6 data-*: ${s.topDataAttrs.map(([n, c]) => `${n}(${c})`).join(' ')}`,
  ].join('\n');
}
