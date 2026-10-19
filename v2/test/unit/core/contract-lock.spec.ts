import { describe, expect, it } from 'vitest';
import { buildLock, diffLocks, type ContractLock, type LockedTool } from '../../../src/tools/contract-lock.js';

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[] : T[K] extends object ? Mutable<T[K]> : T[K] };
type MutableTool = Mutable<LockedTool>;

const clone = (lock: ContractLock): Mutable<ContractLock> => JSON.parse(JSON.stringify(lock)) as Mutable<ContractLock>;

const editTool = (lock: ContractLock, name: string, edit: (tool: MutableTool) => void): ContractLock => {
  const next = clone(lock);
  const tool = next.tools.find((t) => t.name === name)!;
  edit(tool);
  return next as unknown as ContractLock;
};

describe('contract lock', () => {
  const lock = buildLock();

  it('is deterministic and covers every tool with SDK-identical JSON Schema', () => {
    expect(JSON.stringify(buildLock())).toBe(JSON.stringify(lock));
    expect(lock.tools).toHaveLength(16);
    const open = lock.tools.find((t) => t.name === 'app.open')!;
    expect((open.input as { type: string }).type).toBe('object');
    expect(diffLocks(lock, lock)).toEqual({ breaking: [], additive: [] });
  });

  it('classifies a removed tool, a narrowed enum, and a new required input as breaking', () => {
    const removed = { ...lock, tools: lock.tools.filter((t) => t.name !== 'flow.run') };
    expect(diffLocks(lock, removed).breaking).toContain('flow.run: tool removed');

    const narrowed = editTool(lock, 'review.record', (tool) => {
      const props = (tool.input as { properties: Record<string, { enum?: string[] }> }).properties;
      props.decision!.enum = ['accept', 'reject'];
    });
    expect(diffLocks(lock, narrowed).breaking.join('\n')).toMatch(/review\.record input\.decision: enum narrowed \(removed accept-with-edit\)/);

    const required = editTool(lock, 'memory.query', (tool) => {
      const input = tool.input as { properties: Record<string, unknown>; required: string[] };
      input.properties.tenant = { type: 'string' };
      input.required = [...input.required, 'tenant'];
    });
    expect(diffLocks(lock, required).breaking).toContain('memory.query input.tenant: new required input');
  });

  it('classifies optional inputs, new outputs, new families, and rewording as additive', () => {
    const added = editTool(lock, 'memory.query', (tool) => {
      (tool.input as { properties: Record<string, unknown> }).properties.tenant = { type: 'string' };
      (tool.output as { properties: Record<string, unknown> }).properties.elapsedMs = { type: 'number' };
      tool.errorFamilies = [...tool.errorFamilies, 'timeout'];
      tool.descriptionHash = 'sha256:different';
    });
    const diff = diffLocks(lock, added);
    expect(diff.breaking).toEqual([]);
    expect(diff.additive).toEqual(expect.arrayContaining([
      'memory.query input.tenant: added',
      'memory.query output.elapsedMs: added',
      'memory.query: error families added (timeout)',
      'memory.query: description changed',
    ]));
  });

  it('treats a tool becoming destructive or an output field going away as breaking', () => {
    const destructive = editTool(lock, 'app.observe', (tool) => {
      tool.annotations = { ...tool.annotations, destructive: true };
      delete (tool.output as { properties: Record<string, unknown> }).properties.aria;
    });
    const diff = diffLocks(lock, destructive);
    expect(diff.breaking).toEqual(expect.arrayContaining(['app.observe: became destructive', 'app.observe output.aria: removed']));
  });
});
