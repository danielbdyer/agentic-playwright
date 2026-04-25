/**
 * Manifest → MCP Tool Projection — Law Tests (v2 §6 Step 4c).
 *
 * Exercises `projectManifestVerbToMcpTool` (the implementation of
 * "adding a verb to product/ automatically extends the dashboard's
 * tool surface").
 */

import { expect, test } from '@playwright/test';
import {
  mcpCategoryForVerbCategory,
  projectManifestVerbToMcpTool,
  projectManifestVerbsToMcpTools,
} from '../../product/domain/manifest/mcp-projection';
import type { VerbEntry } from '../../product/domain/manifest/verb-entry';

function makeVerb(overrides: Partial<VerbEntry> = {}): VerbEntry {
  return {
    name: 'test-verb',
    category: 'observe',
    summary: 'A verb for testing.',
    inputs: {
      typeName: 'TestVerbInput',
      declaredIn: 'product/test/verb.ts',
      summary: 'The input shape.',
    },
    outputs: {
      typeName: 'TestVerbOutput',
      declaredIn: 'product/test/verb.ts',
    },
    errorFamilies: ['unclassified'],
    sinceVersion: '2.1.0',
    declaredIn: 'product/test/verb.ts',
    ...overrides,
  };
}

// ─── Law 1: name + description pass through ───

test('projectManifestVerbToMcpTool carries name and summary to the MCP tool', () => {
  const tool = projectManifestVerbToMcpTool(makeVerb({
    name: 'facet-query',
    summary: 'Query facet catalog for records matching a predicate.',
  }));
  expect(tool.name).toBe('facet-query');
  expect(tool.description).toBe('Query facet catalog for records matching a predicate.');
});

// ─── Law 2: category taxonomy flattens per the documented rationale ───

test('mcpCategoryForVerbCategory flattens intent/memory/diagnostic/observe → observe', () => {
  expect(mcpCategoryForVerbCategory('observe')).toBe('observe');
  expect(mcpCategoryForVerbCategory('intent')).toBe('observe');
  expect(mcpCategoryForVerbCategory('memory')).toBe('observe');
  expect(mcpCategoryForVerbCategory('diagnostic')).toBe('observe');
});

test('mcpCategoryForVerbCategory flattens mutation/reason/compose/execute → decide', () => {
  expect(mcpCategoryForVerbCategory('mutation')).toBe('decide');
  expect(mcpCategoryForVerbCategory('reason')).toBe('decide');
  expect(mcpCategoryForVerbCategory('compose')).toBe('decide');
  expect(mcpCategoryForVerbCategory('execute')).toBe('decide');
});

test('mcpCategoryForVerbCategory maps governance → control', () => {
  expect(mcpCategoryForVerbCategory('governance')).toBe('control');
});

// ─── Law 3: input schema carries type identity via x-tesseract-* extensions ───

test('inputSchema embeds the input type name + declaredIn as extension fields', () => {
  const tool = projectManifestVerbToMcpTool(makeVerb({
    inputs: {
      typeName: 'FacetEnrichmentProposal',
      declaredIn: 'product/domain/memory/facet-record.ts',
      summary: 'A proposal to enrich an existing facet.',
    },
  }));
  expect(tool.inputSchema.type).toBe('object');
  expect(tool.inputSchema['x-tesseract-input-type']).toBe('FacetEnrichmentProposal');
  expect(tool.inputSchema['x-tesseract-declared-in']).toBe('product/domain/memory/facet-record.ts');
  expect(tool.inputSchema.description).toBe('A proposal to enrich an existing facet.');
});

test('inputSchema embeds error families for agent-legible error-handling hints', () => {
  const tool = projectManifestVerbToMcpTool(makeVerb({
    errorFamilies: ['rate-limited', 'malformed-response', 'unclassified'],
  }));
  expect(tool.inputSchema['x-tesseract-error-families']).toEqual([
    'rate-limited', 'malformed-response', 'unclassified',
  ]);
});

// ─── Law 4: projectManifestVerbsToMcpTools preserves verb order ───

test('projectManifestVerbsToMcpTools preserves the input verb order', () => {
  const verbs: ReadonlyArray<VerbEntry> = [
    makeVerb({ name: 'first', category: 'observe' }),
    makeVerb({ name: 'second', category: 'mutation' }),
    makeVerb({ name: 'third', category: 'governance' }),
  ];
  const tools = projectManifestVerbsToMcpTools(verbs);
  expect(tools.map((t) => t.name)).toEqual(['first', 'second', 'third']);
  expect(tools.map((t) => t.category)).toEqual(['observe', 'decide', 'control']);
});

// ─── Law 5: pure — same input produces identical output ───

test('projectManifestVerbToMcpTool is deterministic across repeated calls', () => {
  const verb = makeVerb({ name: 'determinism-check' });
  const a = projectManifestVerbToMcpTool(verb);
  const b = projectManifestVerbToMcpTool(verb);
  expect(a).toEqual(b);
});
