import { promises as fs } from 'node:fs';
import { ToolError } from '../../../src/core/errors.js';
import os from 'node:os';
import path from 'node:path';
import { loadWorkspace, type Workspace } from '../../../src/workspace/workspace.js';
import type { Candidate, Facet, FacetStatus, LocatorSpec, ResolvedLocator } from '../../../src/contract/schemas.js';
import { renderLocator } from '../../../src/locator/locator.js';
import type { EventBody, EventFactory, EvidenceEvent } from '../../../src/memory/types.js';

export const tempWorkspace = async (): Promise<Workspace> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tesseract-memory-'));
  return loadWorkspace(root, {});
};

export const removeWorkspace = async (ws: Workspace): Promise<void> => {
  await fs.rm(ws.paths.root, { recursive: true, force: true });
};

export const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  ref: 'c1',
  role: 'textbox',
  name: 'Search Policy',
  namingSource: 'placeholder',
  affordance: 'native',
  interactive: true,
  tag: 'input',
  landmark: 'search',
  dataBlock: 'SearchBlock',
  placeholder: 'Search Policy',
  id: 'b3-Input_Search',
  idKind: 'structural',
  visible: true,
  enabled: true,
  inViewport: true,
  ...overrides,
});

export const verified = (locator: LocatorSpec, ok = true): ResolvedLocator => ({
  locator,
  expression: renderLocator(locator),
  verified: ok,
  alternatives: [],
});

/** A fixed clock that advances one second per call, so event times are distinct and deterministic. */
export const steppingClock = (start = '2026-09-20T14:00:00.000Z'): (() => Date) => {
  let t = Date.parse(start);
  return () => {
    const now = new Date(t);
    t += 1000;
    return now;
  };
};

/** Deterministic event factory for pure tests: ev-0001, ev-0002, … */
export const counterFactory = (start = '2026-09-20T14:00:00.000Z'): EventFactory => {
  let n = 0;
  const clock = steppingClock(start);
  return (<B extends EventBody>(body: B) => {
    n += 1;
    return { v: 1, eventId: `ev-${String(n).padStart(4, '0')}`, at: clock().toISOString(), ...body } as unknown as Extract<EvidenceEvent, { kind: B['kind'] }>;
  }) as EventFactory;
};

export const facet = (overrides: Partial<Facet> & Pick<Facet, 'id'>): Facet => ({
  screen: overrides.id.split(':')[0]!,
  kind: 'element',
  displayName: overrides.id.split(':')[1]!.replace(/-/g, ' '),
  aliases: [],
  locators: [],
  status: 'candidate' as FacetStatus,
  provenance: { mintedAt: '2026-09-20T14:00:00.000Z', instrument: 'app.observe' },
  ...overrides,
});

export const readText = (file: string): Promise<string> => fs.readFile(file, 'utf8');

/** The ToolError a function throws (fails the test when it does not throw). */
export const thrown = (fn: () => unknown): ToolError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ToolError) return error;
    throw error;
  }
  throw new Error('expected a ToolError to be thrown');
};

/** The ToolError a promise rejects with (fails the test when it resolves). */
export const rejected = async (promise: Promise<unknown>): Promise<ToolError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ToolError) return error;
    throw error;
  }
  throw new Error('expected a ToolError rejection');
};
