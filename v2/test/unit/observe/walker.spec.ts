import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { inPage } from '../../../src/observe/in-page/runtime.js';
import type { WalkNode, WalkResult } from '../../../src/observe/in-page/walker.js';
import { launch, openFixture } from './helpers.js';

let browser: Browser;
let page: Page;
let walked: WalkResult;

const byName = (name: string, role?: string): WalkNode => {
  const node = walked.nodes.find((n) => n.name === name && (role === undefined || n.role === role));
  if (node === undefined) throw new Error(`no node named ${JSON.stringify(name)}${role !== undefined ? ` with role ${role}` : ''}`);
  return node;
};

beforeAll(async () => {
  browser = await launch();
  page = await openFixture(browser);
  walked = await inPage(page, 'walk', { snapshotId: 'snap-walker-1' });
});

afterAll(async () => {
  await browser.close();
});

describe('walker: roles', () => {
  it('computes implicit landmark roles with context rules', () => {
    const landmarks = walked.nodes.filter((n) => n.category === 'landmark').map((n) => n.role);
    expect(landmarks).toEqual(['banner', 'navigation', 'main', 'search', 'form', 'region', 'contentinfo']);
    // <header> inside <article> is not a banner; an unnamed <section> is not a region.
    expect(walked.nodes.filter((n) => n.role === 'banner')).toHaveLength(1);
    expect(walked.nodes.filter((n) => n.role === 'region').map((n) => n.name)).toEqual(['Summary']);
    expect(byName('Policy details', 'form').namingSource).toBe('aria-label');
  });

  it('maps inputs, selects, textareas and headings like the browser does', () => {
    expect(byName('Search Policy').role).toBe('textbox');
    expect(byName('Go').role).toBe('button');
    expect(byName('Active only').role).toBe('checkbox');
    expect(byName('Notes').role).toBe('textbox');
    expect(walked.nodes.find((n) => n.id === 'b6-Select_Status')?.role).toBe('combobox');
    expect(walked.nodes.find((n) => n.id === 'Input_Discount')?.role).toBe('spinbutton');
    const heading = byName('Policy Search', 'heading');
    expect(heading.level).toBe(1);
    expect(byName('Latest news').level).toBe(2);
  });

  it('enters open shadow roots', () => {
    expect(byName('Shadow action').role).toBe('button');
  });
});

describe('walker: accessible names', () => {
  it('puts aria-labelledby before aria-label', () => {
    const node = byName('From labelledby');
    expect(node.namingSource).toBe('aria-labelledby');
    expect(walked.nodes.some((n) => n.name === 'Both')).toBe(false);
  });

  it('names a submit input by its value and a link by its image alt', () => {
    expect(byName('Go').namingSource).toBe('value');
    const logo = byName('Logo', 'link');
    expect(logo.namingSource).toBe('content');
    // The image inside the link is part of the link's name, not a node of its own.
    expect(walked.nodes.filter((n) => n.name === 'Logo')).toHaveLength(1);
  });

  it('names a wrapped textarea by the label text without the control content', () => {
    const notes = byName('Notes');
    expect(notes.namingSource).toBe('label-wrap');
    expect(JSON.stringify(walked.nodes)).not.toContain('secret');
  });

  it('records label-for, placeholder and content sources', () => {
    expect(byName('Policy holder').namingSource).toBe('label-for');
    expect(byName('Search Policy').namingSource).toBe('placeholder');
    expect(byName('Search Policy').placeholder).toBe('Search Policy');
    expect(byName('Search', 'button').namingSource).toBe('content');
  });
});

describe('walker: affordances and roleless clickables', () => {
  it('ranks native, aria-role, handler-owner and tabindex', () => {
    expect(byName('Search', 'button').affordance).toBe('native');
    expect(byName('Overview').affordance).toBe('aria-role');
    expect(byName('Overview').role).toBe('tab');
    const filter = byName('Filter');
    expect(filter).toMatchObject({ role: 'generic', namingSource: 'content', affordance: 'handler-owner', interactive: true });
    // data-link counts as tabindex-equivalent
    expect(byName('Help')).toMatchObject({ role: 'generic', affordance: 'tabindex', interactive: true });
  });

  it('reads React onClick props as handler ownership', () => {
    expect(byName('Open details')).toMatchObject({ role: 'generic', affordance: 'handler-owner' });
  });

  it('refuses long-text and control-wrapping handler owners, and own-cursor-only elements', () => {
    expect(walked.nodes.some((n) => n.name.startsWith('This card has'))).toBe(false);
    expect(walked.nodes.some((n) => n.role === 'generic' && n.name === 'Inner action')).toBe(false);
    expect(byName('Inner action').role).toBe('button');
    expect(walked.nodes.some((n) => n.name === 'Decoration')).toBe(false);
    expect(walked.stats.ownCursorOnly).toBeGreaterThanOrEqual(1);
  });
});

describe('walker: context', () => {
  it('records landmark, data-block and row text', () => {
    const search = byName('Search Policy');
    expect(search).toMatchObject({ landmark: 'search', dataBlock: 'SearchBlock' });
    const edits = walked.nodes.filter((n) => n.name === 'Edit');
    expect(edits).toHaveLength(3);
    expect(edits[0]).toMatchObject({ role: 'link', landmark: 'main', dataBlock: 'ResultsTable' });
    expect(edits[0]?.rowText).toContain('POL-001');
    expect(edits[1]?.rowText).toContain('POL-002');
    expect(byName('Policy holder')).toMatchObject({ landmark: 'form', landmarkName: 'Policy details', dataBlock: 'DetailsForm' });
  });

  it('keeps rows, cells, headings and feedback messages for assertions', () => {
    const row = walked.nodes.find((n) => n.category === 'row' && n.name.startsWith('POL-001'));
    expect(row?.role).toBe('row');
    expect(walked.nodes.some((n) => n.category === 'cell' && n.name === 'POL-002')).toBe(true);
    const message = walked.nodes.find((n) => n.category === 'message');
    expect(message?.name).toContain('3 policies found');
    // Cells that hold a control are not cells of their own.
    expect(walked.nodes.some((n) => n.category === 'cell' && n.name === 'Edit')).toBe(false);
  });

  it('classifies ids and test ids', () => {
    expect(byName('Search Policy')).toMatchObject({ id: 'b3-Input_Search', idKind: 'structural' });
    expect(byName('Policy holder')).toMatchObject({ id: 'Input_PolicyHolder', idKind: 'designer' });
    expect(byName('Save draft')).toMatchObject({ testId: 'save-draft', testIdAttribute: 'data-testid', idKind: 'plain' });
    const icon = walked.nodes.find((n) => n.testId === 'CloseIcon');
    expect(icon).toMatchObject({ testIdAttribute: 'os-test-id', name: '', namingSource: 'none' });
  });
});

describe('walker: visibility and enabled state', () => {
  it('treats display:none as invisible and below-the-fold as visible but off-viewport', () => {
    expect(byName('Hidden action')).toMatchObject({ visible: false, inViewport: false });
    expect(byName('Load more')).toMatchObject({ visible: true, inViewport: false });
    expect(byName('Search', 'button')).toMatchObject({ visible: true, inViewport: true });
  });

  it('inherits disabled from a fieldset and from an aria-disabled ancestor', () => {
    expect(byName('Delete').enabled).toBe(false);
    expect(byName('Archive').enabled).toBe(false);
    expect(byName('Search', 'button').enabled).toBe(true);
  });

  it('records checked state', () => {
    expect(byName('Active only').checked).toBe(true);
  });
});

describe('walker: registry', () => {
  it('registers every node by ref in document order', async () => {
    expect(walked.nodes.map((n) => n.ref)).toEqual(walked.nodes.map((_n, i) => `c${i + 1}`));
    const registry = await page.evaluate(() => {
      const value = (window as unknown as { __tesseract?: { snapshotId: string; refs: Map<string, Element> } }).__tesseract;
      return value === undefined ? null : { snapshotId: value.snapshotId, size: value.refs.size };
    });
    expect(registry).toEqual({ snapshotId: 'snap-walker-1', size: walked.nodes.length });
  });

  it('describes a registered element raw, and returns null once the snapshot is stale', async () => {
    const edit = walked.nodes.filter((n) => n.name === 'Edit')[1];
    if (edit === undefined) throw new Error('missing edit link');
    const description = await inPage(page, 'describeRef', 'snap-walker-1', edit.ref);
    expect(description).toMatchObject({ role: 'link', name: 'Edit', landmark: 'main', dataBlock: 'ResultsTable' });
    expect(description?.rowCells).toEqual(['POL-002', 'John Roe', '555-123-4567', 'Lapsed', 'Edit']);

    const status = await inPage(page, 'refStatus', 'snap-walker-1', edit.ref);
    expect(status).toBe('ok');

    // A second walk replaces the registry: refs from the first snapshot are stale.
    const page2 = await browser.newPage();
    try {
      await page2.setContent(await page.content());
      await inPage(page2, 'walk', { snapshotId: 'a' });
      await inPage(page2, 'walk', { snapshotId: 'b' });
      expect(await inPage(page2, 'describeRef', 'a', 'c1')).toBeNull();
      expect(await inPage(page2, 'refStatus', 'a', 'c1')).toBe('stale');
      expect(await inPage(page2, 'refStatus', 'b', 'c9999')).toBe('unknown-ref');
      expect(await inPage(page2, 'describeRef', 'b', 'c1')).not.toBeNull();
    } finally {
      await page2.close();
    }
  });

  it('reports a detached element', async () => {
    const page2 = await browser.newPage();
    try {
      await page2.setContent('<main><button id="x">Go away</button></main>');
      const result = await inPage(page2, 'walk', { snapshotId: 'd' });
      const ref = result.nodes.find((n) => n.name === 'Go away')?.ref ?? '';
      await page2.evaluate(() => document.getElementById('x')?.remove());
      expect(await inPage(page2, 'describeRef', 'd', ref)).toBeNull();
      expect(await inPage(page2, 'refStatus', 'd', ref)).toBe('detached');
    } finally {
      await page2.close();
    }
  });
});

describe('walker: scope', () => {
  it('walks only the scoped landmark or block, and says when the scope is missing', async () => {
    const search = await inPage(page, 'walk', { snapshotId: 'scoped-1', scope: { landmark: 'search' } });
    expect(search.scopeFound).toBe(true);
    expect(search.nodes.map((n) => n.name)).toEqual(['', 'Search Policy', 'Search', 'Filter']);
    const block = await inPage(page, 'walk', { snapshotId: 'scoped-2', scope: { dataBlock: 'ResultsTable' } });
    expect(block.nodes.filter((n) => n.interactive).map((n) => n.name)).toEqual(['Edit', 'Edit', 'Edit']);
    const missing = await inPage(page, 'walk', { snapshotId: 'scoped-3', scope: { landmark: 'complementary' } });
    expect(missing.scopeFound).toBe(false);
    expect(missing.nodes).toHaveLength(0);
    // Re-register the full walk for the other tests in this file.
    walked = await inPage(page, 'walk', { snapshotId: 'snap-walker-1' });
  });
});

describe('walker: page signals', () => {
  it('collects variant signals and fingerprint inputs', async () => {
    const signals = await inPage(page, 'signals');
    expect(signals.variant.outSystemsRuntimeGlobal).toBe('OutSystems');
    expect(signals.variant.dataBlockCount).toBeGreaterThanOrEqual(3);
    expect(signals.variant.osvstatePresent).toBe(false);
    expect(signals.fingerprint.landmarks).toEqual(['banner', 'contentinfo', 'form', 'main', 'navigation', 'region', 'search']);
    expect(signals.fingerprint.dataBlockNames).toContain('SearchBlock');
    expect(signals.fingerprint.placeholderOnlyInputs).toBe(1);
    expect(signals.fingerprint.rolelessInteractive).toBeGreaterThanOrEqual(3);
    expect(signals.fingerprint.roleCounts['button']).toBeGreaterThan(0);
  });

  it('computes a structural signature that ignores text but sees structure', async () => {
    const before = await inPage(page, 'structuralSignature');
    await page.evaluate(() => {
      const heading = document.querySelector('h1');
      if (heading !== null) heading.textContent = 'Renamed';
    });
    expect(await inPage(page, 'structuralSignature')).toBe(before);
    await page.evaluate(() => document.querySelector('main')?.appendChild(document.createElement('section')));
    expect(await inPage(page, 'structuralSignature')).not.toBe(before);
  });
});
