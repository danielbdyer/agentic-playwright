/**
 * Reality stats — laws (docs/v2-substrate-reality-study.md §2).
 *
 *   RSt1. F3: an interactive div/span with no role is roleless; a
 *         <button>, an <a>, and a div[role=button] are not; hidden
 *         interactives are excluded from the denominator.
 *   RSt2. F2: naming shares partition the named elements and sum
 *         to 1; placeholder-only inputs are counted among form
 *         controls only.
 *   RSt3. F1/F4/F5/F6: data-block count + distinct names, landmark
 *         set, structural-vs-other ids, data-* frequency ordering.
 *   RSt4. Pure: same record → deep-equal stats.
 */

import { describe, test, expect } from 'vitest';
import { stubNode } from '../__fixtures__/snapshot-node-stub';
import { snapshotRecord, type SnapshotNode } from '../../workshop/substrate-study/domain/snapshot-record';
import { computeRealityStats, renderRealityStats } from '../../workshop/substrate-study/application/reality-stats';

function record(nodes: readonly SnapshotNode[]) {
  return snapshotRecord({
    url: 'https://example.test/Route',
    fetchedAt: '2026-09-16T00:00:00.000Z',
    substrateVersion: '1.1.0',
    userAgent: 'test',
    viewport: { width: 1280, height: 800 },
    hydration: { kind: 'stable', diagnostic: 'ok', phases: [] } as never,
    captureLatencyMs: 1,
    nodes,
    framework: { reactDetected: false, angularDetected: false, vueDetected: false, webComponentCount: 0, shadowRootCount: 0, iframeCount: 0 },
    variantClassifier: { kind: 'reactive', osuiClassCount: 2, evidence: [] },
  });
}

const interactive = (o: Partial<SnapshotNode>): SnapshotNode =>
  stubNode({ ...o, interaction: { ...stubNode().interaction, interactive: true, ...(o.interaction ?? {}) } });

describe('reality stats laws', () => {
  test('RSt1: roleless interactives are div/span with a click affordance and no role', () => {
    const nodes = [
      interactive({ path: 'a', tag: 'div', ariaNaming: { label: null, accessibleName: null, source: 'none' } }),
      interactive({ path: 'b', tag: 'span' }),
      interactive({ path: 'c', tag: 'button', ariaNaming: { label: null, accessibleName: 'Save', source: 'content' } }),
      interactive({ path: 'd', tag: 'a', ariaNaming: { label: null, accessibleName: 'Home', source: 'content' } }),
      interactive({ path: 'e', tag: 'div', ariaRole: 'button', ariaNaming: { label: null, accessibleName: 'Go', source: 'content' } }),
      interactive({ path: 'f', tag: 'div', visibility: 'display-none' }),
    ];
    const s = computeRealityStats(record(nodes));
    expect(s.interactiveCount).toBe(5);
    expect(s.rolelessInteractiveCount).toBe(2);
    expect(s.rolelessInteractiveShare).toBeCloseTo(0.4, 6);
    expect(s.nativeButtons).toBe(1);
    expect(s.anchors).toBe(1);
    expect(s.explicitRoleButtonDivs).toBe(1);
  });

  test('RSt2: naming shares partition named elements; placeholder-only counted among form controls', () => {
    const nodes = [
      stubNode({ path: 'a', tag: 'button', ariaNaming: { label: null, accessibleName: 'Save', source: 'content' } }),
      stubNode({ path: 'b', tag: 'button', ariaNaming: { label: null, accessibleName: 'Cancel', source: 'content' } }),
      stubNode({ path: 'c', tag: 'input', ariaNaming: { label: null, accessibleName: 'Search', source: 'placeholder' }, interaction: { ...stubNode().interaction, placeholder: 'Search', inputType: 'text' } }),
      stubNode({ path: 'd', tag: 'input', ariaNaming: { label: null, accessibleName: 'Name', source: 'label-for' }, interaction: { ...stubNode().interaction, inputType: 'text' } }),
      stubNode({ path: 'e', tag: 'div' }),
    ];
    const s = computeRealityStats(record(nodes));
    expect(s.namedElements).toBe(4);
    expect(s.namingShares.content).toBeCloseTo(0.5, 6);
    expect(s.namingShares.placeholder).toBeCloseTo(0.25, 6);
    expect(s.namingShares['label-for']).toBeCloseTo(0.25, 6);
    const sum = Object.values(s.namingShares).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(s.formControls).toBe(2);
    expect(s.placeholderOnlyInputs).toBe(1);
  });

  test('RSt3: block, landmark, id-shape and data-* measures', () => {
    const nodes = [
      stubNode({ path: 'a', id: 'b1-Column', dataAttrNames: ['data-block', 'data-container'], dataAttrValues: { 'data-block': 'X.Section', 'data-container': '' }, ariaRole: 'main', depth: 2 }),
      stubNode({ path: 'b', id: 'l1-0_0-$b2', dataAttrNames: ['data-block'], dataAttrValues: { 'data-block': 'X.Section' } , depth: 5 }),
      stubNode({ path: 'c', id: 'hero', dataAttrNames: ['data-block', 'data-testid'], dataAttrValues: { 'data-block': 'X.Gallery', 'data-testid': 't' }, ariaRole: 'navigation' }),
      stubNode({ path: 'c2', id: 'l2_0-2_0-Select' }),
      stubNode({ path: 'c3', id: 'l2_0-2_1-b6-Content' }),
      stubNode({ path: 'c4', id: 'SelectAll' }),
      stubNode({ path: 'd', ariaRole: 'banner', dataAttrNames: ['data-container'], dataAttrValues: { 'data-container': '' } }),
      stubNode({ path: 'e', ariaRole: 'tab' }),
    ];
    const s = computeRealityStats(record(nodes));
    expect(s.dataBlockCount).toBe(3);
    expect(s.distinctBlockNames).toBe(2);
    expect(s.landmarks).toEqual(['banner', 'main', 'navigation']);
    expect(s.structuralIds).toBe(4);
    expect(s.otherIds).toBe(2);
    expect(s.testIds).toBe(1);
    expect(s.maxDepth).toBe(5);
    expect(s.topDataAttrs[0]).toEqual(['data-block', 3]);
    expect(s.topDataAttrs[1]).toEqual(['data-container', 2]);
    expect(renderRealityStats(s)).toContain('F4 landmarks=banner+main+navigation');
  });

  test('RSt4: pure — same record, same stats', () => {
    const r = record([stubNode({ path: 'a', tag: 'button' })]);
    expect(computeRealityStats(r)).toEqual(computeRealityStats(r));
  });
});
