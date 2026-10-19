/**
 * The §5.5 sample from docs/app-v2-vision.md as contract objects: ADO test
 * case 10001 (four steps, parameter policyNumber) and the policy-search
 * catalog (heading, policy-number input in the search landmark, search button,
 * results-table row facet by policyNumber).
 */
import type { Facet, FacetLocator, Handoff, ResolvedStep, TestCase } from '../../../src/contract/schemas.js';
import type { FlowRecording, ScreenCatalog } from '../../../src/emit/types.js';

const provenance = { mintedAt: '2026-09-20T14:02:11Z', instrument: 'app.observe' as const, testCase: '10001' };

export const facet = (overrides: Partial<Facet> & Pick<Facet, 'id' | 'locators'>): Facet => ({
  screen: overrides.id.split(':')[0]!,
  kind: 'element',
  displayName: overrides.id,
  aliases: [],
  status: 'trusted',
  provenance,
  ...overrides,
});

const loc = (spec: FacetLocator): FacetLocator => spec;

export const policySearchFacets: readonly Facet[] = [
  facet({
    id: 'policy-search:heading',
    role: 'heading',
    tag: 'h1',
    namingSource: 'content',
    scope: { landmark: 'banner' },
    locators: [
      loc({ strategy: 'role-name', role: 'heading', name: 'Policy Search', health: '12/12' }),
      loc({ strategy: 'text', value: 'Policy Search', health: '12/12' }),
    ],
  }),
  facet({
    id: 'policy-search:policy-number-input',
    displayName: 'Policy number search field',
    aliases: ['search field', 'policy number'],
    role: 'textbox',
    tag: 'input',
    namingSource: 'placeholder',
    affordance: 'native',
    scope: { landmark: 'search', dataBlock: 'SearchBlock' },
    locators: [
      loc({ strategy: 'role-name', role: 'textbox', name: 'Search Policy', scope: { landmark: 'search' }, health: '12/12' }),
      loc({ strategy: 'placeholder', value: 'Search Policy', health: '12/12' }),
      loc({ strategy: 'css', value: '#b3-Input_Search', health: '3/12', note: 'structural id, fragile' }),
    ],
  }),
  facet({
    id: 'policy-search:search-button',
    role: 'button',
    tag: 'button',
    namingSource: 'content',
    affordance: 'native',
    scope: { landmark: 'search' },
    locators: [loc({ strategy: 'role-name', role: 'button', name: 'Search', scope: { landmark: 'search' }, health: '12/12' })],
  }),
  facet({
    id: 'policy-search:results-table',
    kind: 'row',
    role: 'row',
    tag: 'tr',
    namingSource: 'content',
    parameter: 'policyNumber',
    locators: [loc({ strategy: 'row-text', value: '{policyNumber}', health: '9/9' })],
  }),
];

export const policySearchCatalog: ScreenCatalog = {
  screen: 'policy-search',
  route: { url: 'PolicySearch', variant: 'reactive', landmarks: ['banner', 'main', 'search'] },
  facets: policySearchFacets,
};

export const testCase10001: TestCase = {
  id: '10001',
  title: 'Verify policy search returns matching policy',
  revision: 1,
  contentHash: 'sha256:1930319ee9882abb4af0ab8dc9d6c120f6ddc8b77ca6441c20be91697f7b19d1',
  priority: 1,
  tags: ['smoke', 'billing'],
  steps: [
    { index: 1, stepIdentifier: '2', action: 'Navigate to Policy Search screen', expected: 'Policy Search screen loads' },
    { index: 2, stepIdentifier: '3', action: 'Enter policy number in search field', expected: 'Policy Number accepts a valid policy' },
    { index: 3, stepIdentifier: '4', action: 'Click Search button', expected: 'Search runs' },
    { index: 4, stepIdentifier: '5', action: 'Verify search results show policy', expected: 'Matching policy appears in Search Results' },
  ],
  parameters: ['policyNumber'],
  dataRows: [{ policyNumber: 'POL-001' }],
};

export const steps10001: readonly ResolvedStep[] = [
  {
    index: 1,
    stepIdentifier: '2',
    actionText: 'Navigate to Policy Search screen',
    expectedText: 'Policy Search screen loads',
    verb: 'navigate',
    screen: 'policy-search',
    assertions: [{ kind: 'visible', target: { facetId: 'policy-search:heading' } }],
  },
  {
    index: 2,
    stepIdentifier: '3',
    actionText: 'Enter policy number in search field',
    expectedText: 'Policy Number accepts a valid policy',
    verb: 'fill',
    target: { facetId: 'policy-search:policy-number-input' },
    value: '@policyNumber',
  },
  {
    index: 3,
    stepIdentifier: '4',
    actionText: 'Click Search button',
    expectedText: 'Search runs',
    verb: 'click',
    target: { facetId: 'policy-search:search-button' },
  },
  {
    index: 4,
    stepIdentifier: '5',
    actionText: 'Verify search results show policy',
    expectedText: 'Matching policy appears in Search Results',
    verb: 'assert',
    assertions: [{ kind: 'visible', target: { facetId: 'policy-search:results-table' } }],
  },
];

export const handoff = (overrides: Partial<Handoff> = {}): Handoff => ({
  handoffId: 'h-10001-4',
  testCaseId: '10001',
  stepIndex: 4,
  stepIdentifier: '5',
  blockage: 'ambiguous-target',
  unresolvedIntent: 'Three rows mention "POL-001"; which one is the result?',
  attempted: ['memory.query', 'app.observe'],
  evidence: {},
  candidates: [],
  nextMoves: ['Clarify the expected row in ADO'],
  raisedAt: '2026-10-19T10:00:00Z',
  status: 'open',
  ...overrides,
});

export const loginFacets: readonly Facet[] = [
  facet({
    id: 'login:username-input',
    role: 'textbox',
    tag: 'input',
    namingSource: 'label-for',
    locators: [loc({ strategy: 'label', value: 'Username' })],
  }),
  facet({
    id: 'login:password-input',
    role: 'textbox',
    tag: 'input',
    namingSource: 'label-for',
    locators: [loc({ strategy: 'label', value: 'Password' })],
  }),
  facet({
    id: 'login:log-in-button',
    role: 'button',
    tag: 'button',
    namingSource: 'content',
    locators: [loc({ strategy: 'role-name', role: 'button', name: 'Log in' })],
  }),
];

export const loginCatalog: ScreenCatalog = { screen: 'login', route: { url: 'Login' }, facets: loginFacets };

export const loginRecording: FlowRecording = {
  name: 'login',
  params: [
    { name: 'username', secret: false, default: 'qa.user' },
    { name: 'password', secret: true },
  ],
  steps: [
    { index: 1, action: 'navigate', screen: 'login', url: 'https://qa.example.com/App/Login' },
    { index: 2, action: 'fill', facetId: 'login:username-input', screen: 'login', value: { param: 'username' }, url: 'https://qa.example.com/App/Login' },
    { index: 3, action: 'fill', facetId: 'login:password-input', screen: 'login', value: { param: 'password', secret: true }, url: 'https://qa.example.com/App/Login' },
    { index: 4, action: 'click', facetId: 'login:log-in-button', screen: 'login', url: 'https://qa.example.com/App/Login' },
  ],
};
