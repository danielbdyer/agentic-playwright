/**
 * The pre-filter against candidates from a real walk: Chromium renders an
 * OutSystems-Reactive-shaped page, observe/ walks it, and resolve/ ranks
 * and decides on what the walker actually reports (nearest landmark and
 * its name, row text, handler-owners, feedback messages). The synthetic
 * fixtures elsewhere in this folder assume those field semantics; this
 * file proves them on a live DOM, and checks each decision against the
 * element Playwright finds on the page.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { observePage } from '../../../src/observe/index.js';
import { classifyStep, decideTarget, facetIdFor, intentForAssertion, rankCandidates, screenNameFromUrl } from '../../../src/resolve/index.js';
import type { Candidate } from '../../../src/contract/schemas.js';

const PAGE = `<!doctype html>
<html><head><title>Policy Search</title></head>
<body>
  <header>
    <nav aria-label="Main menu">
      <a href="#home">Home</a> <a href="#policies">Policy Search</a> <a href="#claims">Claims</a>
    </nav>
  </header>
  <main>
    <h1>Policy Search</h1>
    <div role="search" data-block="SearchBlock">
      <input type="text" id="b3-Input_Search" placeholder="Search Policy">
      <button type="button">Search</button>
      <div class="btn-filter" onclick="void 0" style="cursor:pointer">Filter</div>
    </div>
    <table>
      <thead><tr><th>Select</th><th>Policy</th><th>Holder</th><th>Actions</th></tr></thead>
      <tbody>
        <tr><td><input type="checkbox" aria-label="Select"></td><td>POL-001</td><td>John Smith</td><td><a href="#v1">View</a></td></tr>
        <tr><td><input type="checkbox" aria-label="Select"></td><td>POL-002</td><td>Jane Doe</td><td><a href="#v2">View</a></td></tr>
      </tbody>
    </table>
    <div class="feedback-message">Policy saved successfully</div>
    <section>
      <h2>Filters</h2>
      <footer><a href="#all">All</a> <a href="#active">Active</a> <a href="#done">Completed</a></footer>
    </section>
  </main>
  <footer><a href="#privacy">Privacy</a></footer>
  <div role="dialog" aria-label="Delete policy?"><p>Delete this policy?</p><button>OK</button><button>Cancel</button></div>
</body></html>`;

let browser: Browser;
let page: Page;
let candidates: readonly Candidate[];

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setContent(PAGE, { waitUntil: 'load' });
  const observed = await observePage(page, { pageId: 'live', snapshotId: 'snap-live', pii: 'standard', now: () => new Date('2026-10-19T00:00:00Z') });
  candidates = observed.snapshot.candidates;
});

afterAll(async () => {
  await browser?.close();
});

const byRef = (ref: string): Candidate => {
  const found = candidates.find((c) => c.ref === ref);
  if (found === undefined) throw new Error(`no candidate ${ref}`);
  return found;
};

interface Case {
  readonly action: string;
  readonly expected?: string;
  readonly params?: readonly string[];
  readonly values?: Record<string, string>;
  readonly want: Partial<Candidate>;
}

const decideOn = (c: Case) => {
  const intent = classifyStep(c.action, c.expected ?? '', c.params ?? []);
  const hints = rankCandidates(intent, candidates, c.values === undefined ? {} : { params: c.values });
  return { intent, hints, decision: decideTarget(intent, hints, candidates) };
};

describe('resolve on a live walk', () => {
  it('the walker reports the fields the index relies on', () => {
    const textbox = candidates.find((c) => c.role === 'textbox');
    expect(textbox).toMatchObject({ name: 'Search Policy', namingSource: 'placeholder', landmark: 'search', dataBlock: 'SearchBlock' });
    expect(candidates.find((c) => c.role === 'link' && c.name === 'Claims')).toMatchObject({ landmark: 'navigation', landmarkName: 'Main menu' });
    expect(candidates.find((c) => c.role === 'generic' && c.name === 'Filter')).toMatchObject({ affordance: 'handler-owner', interactive: true });
    expect(candidates.filter((c) => c.role === 'link' && c.name === 'View').map((c) => c.rowText)).toEqual([
      expect.stringContaining('POL-001'),
      expect.stringContaining('POL-002'),
    ]);
    // The nested <footer> is not contentinfo; the page-level one is.
    expect(candidates.find((c) => c.name === 'Active')?.landmark).toBe('main');
    expect(candidates.find((c) => c.name === 'Privacy')?.landmark).toBe('contentinfo');
    expect(candidates.find((c) => c.role === 'button' && c.name === 'OK')?.landmark).toBe('dialog');
  });

  const cases: readonly Case[] = [
    { action: 'Navigate to Policy Search screen', want: { role: 'link', name: 'Policy Search' } },
    { action: 'Enter @policyNumber in search field', params: ['policyNumber'], want: { role: 'textbox', name: 'Search Policy' } },
    { action: 'Click Search button', want: { role: 'button', name: 'Search' } },
    { action: 'Click Filter', want: { role: 'generic', name: 'Filter' } },
    { action: 'Click View in the row for @policyNumber', params: ['policyNumber'], values: { policyNumber: 'POL-002' }, want: { role: 'link', name: 'View' } },
    { action: 'Check the checkbox in the row for POL-001', want: { role: 'checkbox' } },
    { action: 'Click the Active filter link in the footer', want: { role: 'link', name: 'Active' } },
    { action: 'Click the Privacy link in the footer', want: { role: 'link', name: 'Privacy' } },
    { action: 'Click OK in the confirmation dialog', want: { role: 'button', name: 'OK' } },
    { action: 'Verify the success message is displayed', want: { name: 'Policy saved successfully' } },
  ];

  for (const c of cases) {
    it(`${c.action} → ${c.want.role ?? ''} ${c.want.name ?? ''}`.trim(), async () => {
      const { decision } = decideOn(c);
      expect(decision.kind, decision.reason).toBe('chosen');
      if (decision.kind !== 'chosen') return;
      const chosen = byRef(decision.ref);
      expect(chosen).toMatchObject(c.want);
      // The decision names a real, visible element on the page.
      const locator =
        chosen.role === 'generic'
          ? page.getByText(chosen.name, { exact: true })
          : chosen.name.length > 0
            ? page.getByRole(chosen.role as Parameters<Page['getByRole']>[0], { name: chosen.name, exact: true })
            : page.getByRole(chosen.role as Parameters<Page['getByRole']>[0]);
      expect(await locator.filter({ visible: true }).count()).toBeGreaterThan(0);
    });
  }

  it('picks the row in the right table row, and the row for a row assertion', async () => {
    const { decision } = decideOn({ action: 'Check the checkbox in the row for POL-002', want: {} });
    expect(decision.kind).toBe('chosen');
    if (decision.kind === 'chosen') expect(byRef(decision.ref).rowText).toContain('POL-002');

    const intent = classifyStep('Click Search button', 'Matching policy appears in Search Results', ['policyNumber'], { priorValues: ['@policyNumber'] });
    const rowIntent = intentForAssertion(intent, intent.assertions[0]!);
    const hints = rankCandidates(rowIntent, candidates, { params: { policyNumber: 'POL-001' } });
    const rowDecision = decideTarget(rowIntent, hints, candidates);
    expect(rowDecision.kind).toBe('chosen');
    if (rowDecision.kind === 'chosen') {
      const row = byRef(rowDecision.ref);
      expect(row.role).toBe('row');
      expect(row.name).toContain('POL-001');
      expect(await page.getByRole('row').filter({ hasText: 'POL-001' }).count()).toBe(1);
    }
  });

  it('is ambiguous on the two View links when no row is named', () => {
    const { decision } = decideOn({ action: 'Click View', want: {} });
    expect(decision.kind).toBe('ambiguous');
    if (decision.kind === 'ambiguous') expect(decision.refs.map((r) => byRef(r).name)).toEqual(['View', 'View']);
  });

  it('names facets and the screen the way the authoring loop mints them', () => {
    const screen = screenNameFromUrl('https://acme.example.com/Insurance/PolicySearch', 'https://acme.example.com/Insurance/');
    expect(screen).toBe('policy-search');
    const fill = decideOn({ action: 'Enter @policyNumber in search field', params: ['policyNumber'], want: {} });
    if (fill.decision.kind !== 'chosen') throw new Error(fill.decision.reason);
    expect(facetIdFor(screen, fill.intent, byRef(fill.decision.ref))).toBe('policy-search:policy-number-input');
    const click = decideOn({ action: 'Click Search button', want: {} });
    if (click.decision.kind !== 'chosen') throw new Error(click.decision.reason);
    expect(facetIdFor(screen, click.intent, byRef(click.decision.ref))).toBe('policy-search:search-button');
  });
});
