/**
 * Synthetic snapshots for driver unit tests: the Appendix C policy-search
 * page after a search with two matching rows.
 */
import type { Candidate, Snapshot, TestStep } from '../../../src/contract/schemas.js';
import type { DeciderInput } from '../../../src/driver/index.js';
import { classifyStep } from '../../../src/resolve/index.js';

export const candidate = (ref: string, role: string, name: string, extra: Partial<Candidate> = {}): Candidate => ({
  ref,
  role,
  name,
  namingSource: 'content',
  affordance: role === 'row' || role === 'heading' || role === 'status' ? 'none' : 'native',
  interactive: !(role === 'row' || role === 'heading' || role === 'status'),
  tag: role === 'button' ? 'button' : role === 'link' ? 'a' : role === 'row' ? 'tr' : role === 'heading' ? 'h1' : 'input',
  visible: true,
  enabled: true,
  inViewport: true,
  ...extra,
});

export const POLICY_SEARCH: readonly Candidate[] = [
  candidate('c1', 'link', 'Policy Search', { landmark: 'navigation', dataBlock: 'Common.Menu' }),
  candidate('c2', 'link', 'Claims', { landmark: 'navigation', dataBlock: 'Common.Menu' }),
  candidate('c3', 'heading', 'Policy Search', { landmark: 'main', level: 1 }),
  candidate('c4', 'textbox', 'Search Policy', { namingSource: 'placeholder', landmark: 'search', dataBlock: 'Policy.SearchBlock', placeholder: 'Search Policy' }),
  candidate('c5', 'button', 'Search', { landmark: 'search', dataBlock: 'Policy.SearchBlock' }),
  candidate('c6', 'generic', 'Filter', { affordance: 'handler-owner', landmark: 'search', tag: 'div' }),
  candidate('c7', 'status', '2 policies found', { landmark: 'main' }),
  candidate('c8', 'row', 'POL-001 Ada Lovelace Active 1,200.00 Edit', { landmark: 'main', rowText: 'POL-001 Ada Lovelace Active 1,200.00 Edit' }),
  candidate('c9', 'link', 'Edit', { landmark: 'main', rowText: 'POL-001 Ada Lovelace Active 1,200.00 Edit' }),
  candidate('c10', 'row', 'POL-003 Alan Turing Active 2,310.75 Edit', { landmark: 'main', rowText: 'POL-003 Alan Turing Active 2,310.75 Edit' }),
  candidate('c11', 'link', 'Edit', { landmark: 'main', rowText: 'POL-003 Alan Turing Active 2,310.75 Edit' }),
];

export const snapshot = (candidates: readonly Candidate[] = POLICY_SEARCH, extra: Partial<Snapshot> = {}): Snapshot => ({
  snapshotId: 'snap-test-1',
  pageId: 'p-1',
  at: '2026-10-19T00:00:00.000Z',
  url: 'http://app.test/PolicyApp/PolicySearch',
  title: 'Policy Search',
  variant: 'reactive',
  scope: 'page',
  fingerprint: {
    hash: 'sha256:abc',
    title: 'Policy Search',
    path: '/PolicyApp/PolicySearch',
    landmarks: ['banner', 'main', 'navigation', 'search'],
    roleCounts: {},
    interactive: 6,
    rolelessInteractive: 1,
    placeholderOnlyInputs: 1,
    dataBlocks: 4,
    runtimeGlobal: 'OutSystems',
  },
  candidates: [...candidates],
  totalCandidates: candidates.length,
  aria: '- search:\n  - textbox "Search Policy"\n  - button "Search"',
  truncated: false,
  ...extra,
});

export const step = (index: number, action: string, expected = ''): TestStep => ({ index, stepIdentifier: String(index + 1), action, expected });

export const deciderInput = (action: string, expected = '', extra: Partial<DeciderInput> = {}): DeciderInput => {
  const s = step(1, action, expected);
  return {
    testCase: { id: '10001', title: 'Verify policy search' },
    step: s,
    intent: classifyStep(action, expected, ['policyNumber'], {}),
    purpose: 'action',
    snapshot: snapshot(),
    hints: [],
    facets: [],
    params: { policyNumber: 'POL-001' },
    exclude: [],
    attempt: 1,
    history: [],
    ...extra,
  };
};
