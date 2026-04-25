/**
 * Shared test fixture: minimal SnapshotNode with overrides.
 *
 * Three test files independently grew copies of this stub
 * (tests/algebra/quotient.laws.spec.ts, tests/substrate-study/
 * snapshot-record.laws.spec.ts, tests/substrate-study/
 * snapshot-store.laws.spec.ts). Extracted here so the default
 * shape is single-source-of-truth — adding a field to
 * SnapshotNode requires updating one place, not three.
 */

import type { SnapshotNode } from '../../workshop/substrate-study/domain/snapshot-record';

export function stubNode(overrides: Partial<SnapshotNode> = {}): SnapshotNode {
  return {
    path: 'body > div',
    depth: 1,
    tag: 'div',
    id: null,
    classTokens: [],
    classPrefixFamily: null,
    dataAttrNames: [],
    dataAttrValues: {},
    ariaRole: null,
    ariaState: {},
    ariaNaming: { label: null, accessibleName: null },
    interaction: {
      tabindex: null,
      focusable: false,
      interactive: false,
      formRef: null,
      inputType: null,
      disabled: false,
      readonly: false,
      required: false,
      placeholder: null,
    },
    visibility: 'visible',
    boundingRect: { xBin: 0, yBin: 0, widthBin: 0, heightBin: 0 },
    clipped: false,
    framework: { hasShadowRoot: false, customElementName: null, iframeSrc: null },
    structural: {
      parentTag: null,
      parentRole: null,
      parentClassFamily: null,
      siblingIndex: 0,
      siblingCount: 1,
    },
    labelText: null,
    textLengthBucket: null,
    textNodeCount: 0,
    ...overrides,
  };
}
