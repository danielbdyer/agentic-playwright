/**
 * The contract lock: a committed, deterministic JSON rendering of every
 * tool's published shape (input and output JSON Schema exactly as the MCP
 * SDK converts them, error families, hints, caller, release). drift-check
 * compares the live declaration with the lock and classifies every
 * difference: additive changes need only a regenerated lock; breaking ones
 * fail, because a tool whose meaning changes must get a new name.
 */
import path from 'node:path';
import { z } from 'zod';
import { readJson, writeJson } from '../core/fsio.js';
import { sha256Hex } from '../core/hash.js';
import { packageRoot } from '../core/package-root.js';
import { CONTRACT_VERSION, TOOLS, wireName, type ToolDeclaration } from '../contract/tools.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface LockedTool {
  readonly name: string;
  readonly wireName: string;
  readonly release: string;
  readonly caller: string;
  readonly since: string;
  readonly errorFamilies: readonly string[];
  readonly annotations: { readonly readOnly: boolean; readonly destructive: boolean; readonly idempotent: boolean; readonly openWorld: boolean };
  readonly descriptionHash: string;
  readonly input: Json;
  readonly output: Json;
}

export interface ContractLock {
  readonly version: string;
  readonly tools: readonly LockedTool[];
}

export const LOCK_FILE = 'contract.lock.json';

/** Same conversion the MCP SDK applies in tools/list, so an unconvertible schema fails here first. */
const jsonSchema = (schema: z.ZodType, io: 'input' | 'output'): Json =>
  z.toJSONSchema(schema, { target: 'draft-7', io }) as Json;

export const buildLock = (): ContractLock => ({
  version: CONTRACT_VERSION,
  tools: (TOOLS as readonly ToolDeclaration[])
    .map((tool) => ({
      name: tool.name,
      wireName: wireName(tool.name),
      release: tool.release,
      caller: tool.caller,
      since: tool.since,
      errorFamilies: [...tool.errorFamilies].sort(),
      annotations: { readOnly: tool.readOnly, destructive: tool.destructive, idempotent: tool.idempotent, openWorld: tool.openWorld },
      descriptionHash: `sha256:${sha256Hex(`${tool.title}\n${tool.summary}\n${tool.description}`).slice(0, 16)}`,
      input: jsonSchema(tool.input, 'input'),
      output: jsonSchema(tool.output, 'output'),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
});

export interface LockDiff {
  readonly breaking: readonly string[];
  readonly additive: readonly string[];
}

const isObject = (value: Json | undefined): value is { [key: string]: Json } =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);

/** Drop documentation-only keys so a reworded description is not a shape change. */
const withoutDocs = (value: Json | undefined): Json | undefined => {
  if (Array.isArray(value)) return value.map((item) => withoutDocs(item) ?? null);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'description' && key !== 'title' && key !== '$schema')
      .map(([key, v]) => [key, withoutDocs(v) ?? null]),
  );
};

const same = (a: Json | undefined, b: Json | undefined): boolean => JSON.stringify(withoutDocs(a)) === JSON.stringify(withoutDocs(b));

const enumOf = (value: Json | undefined): readonly string[] | null =>
  isObject(value) && Array.isArray(value.enum) ? value.enum.map((v) => String(v)) : null;

const describedOnly = (a: Json | undefined, b: Json | undefined): boolean => same(a, b) && JSON.stringify(a) !== JSON.stringify(b);

/** Compare one property schema; `direction` says whether widening or narrowing is the safe side. */
const compareProperty = (
  where: string,
  before: Json | undefined,
  after: Json | undefined,
  direction: 'input' | 'output',
  out: { breaking: string[]; additive: string[] },
): void => {
  if (same(before, after)) {
    if (describedOnly(before, after)) out.additive.push(`${where}: description changed`);
    return;
  }
  const oldEnum = enumOf(before);
  const newEnum = enumOf(after);
  if (oldEnum !== null && newEnum !== null) {
    const removed = oldEnum.filter((v) => !newEnum.includes(v));
    const added = newEnum.filter((v) => !oldEnum.includes(v));
    // Inputs may widen (accept more); outputs may not (clients would see values they never handled).
    if (direction === 'input') {
      if (removed.length > 0) out.breaking.push(`${where}: enum narrowed (removed ${removed.join(', ')})`);
      if (added.length > 0) out.additive.push(`${where}: enum widened (added ${added.join(', ')})`);
    } else {
      if (added.length > 0) out.breaking.push(`${where}: output enum widened (added ${added.join(', ')})`);
      if (removed.length > 0) out.additive.push(`${where}: output enum narrowed (removed ${removed.join(', ')})`);
    }
    return;
  }
  if (isObject(before) && isObject(after) && before.type === 'object' && after.type === 'object') {
    compareObject(where, before, after, direction, out);
    return;
  }
  out.breaking.push(`${where}: type changed`);
};

const compareObject = (
  where: string,
  before: { [key: string]: Json },
  after: { [key: string]: Json },
  direction: 'input' | 'output',
  out: { breaking: string[]; additive: string[] },
): void => {
  const oldProps = isObject(before.properties) ? before.properties : {};
  const newProps = isObject(after.properties) ? after.properties : {};
  const oldRequired = new Set(Array.isArray(before.required) ? before.required.map(String) : []);
  const newRequired = new Set(Array.isArray(after.required) ? after.required.map(String) : []);
  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) out.breaking.push(`${where}.${key}: removed`);
  }
  for (const key of Object.keys(newProps)) {
    const at = `${where}.${key}`;
    if (!(key in oldProps)) {
      if (direction === 'input' && newRequired.has(key)) out.breaking.push(`${at}: new required input`);
      else out.additive.push(`${at}: added`);
      continue;
    }
    if (direction === 'input' && !oldRequired.has(key) && newRequired.has(key)) out.breaking.push(`${at}: became required`);
    if (direction === 'input' && oldRequired.has(key) && !newRequired.has(key)) out.additive.push(`${at}: became optional`);
    if (direction === 'output' && oldRequired.has(key) && !newRequired.has(key)) out.breaking.push(`${at}: output became optional`);
    if (direction === 'output' && !oldRequired.has(key) && newRequired.has(key)) out.additive.push(`${at}: output became required`);
    compareProperty(at, oldProps[key], newProps[key], direction, out);
  }
};

export const diffLocks = (before: ContractLock, after: ContractLock): LockDiff => {
  const out = { breaking: [] as string[], additive: [] as string[] };
  const oldTools = new Map(before.tools.map((t) => [t.name, t]));
  const newTools = new Map(after.tools.map((t) => [t.name, t]));
  for (const [name] of oldTools) {
    if (!newTools.has(name)) out.breaking.push(`${name}: tool removed`);
  }
  for (const [name, tool] of newTools) {
    const old = oldTools.get(name);
    if (old === undefined) {
      out.additive.push(`${name}: tool added`);
      continue;
    }
    const removedFamilies = old.errorFamilies.filter((f) => !tool.errorFamilies.includes(f));
    const addedFamilies = tool.errorFamilies.filter((f) => !old.errorFamilies.includes(f));
    if (removedFamilies.length > 0) out.breaking.push(`${name}: error families removed (${removedFamilies.join(', ')})`);
    if (addedFamilies.length > 0) out.additive.push(`${name}: error families added (${addedFamilies.join(', ')})`);
    if (!old.annotations.destructive && tool.annotations.destructive) out.breaking.push(`${name}: became destructive`);
    if (old.annotations.readOnly && !tool.annotations.readOnly) out.breaking.push(`${name}: stopped being read-only`);
    if (old.annotations.destructive && !tool.annotations.destructive) out.additive.push(`${name}: no longer destructive`);
    if (!old.annotations.readOnly && tool.annotations.readOnly) out.additive.push(`${name}: became read-only`);
    if (old.annotations.idempotent !== tool.annotations.idempotent || old.annotations.openWorld !== tool.annotations.openWorld) {
      out.additive.push(`${name}: idempotent/openWorld hints changed`);
    }
    if (old.caller !== tool.caller) out.breaking.push(`${name}: caller changed (${old.caller} → ${tool.caller})`);
    if (old.descriptionHash !== tool.descriptionHash) out.additive.push(`${name}: description changed`);
    compareProperty(`${name} input`, old.input, tool.input, 'input', out);
    compareProperty(`${name} output`, old.output, tool.output, 'output', out);
  }
  if (before.version !== after.version) out.additive.push(`contract version ${before.version} → ${after.version}`);
  return out;
};

export const lockPath = (root: string = packageRoot()): string => path.join(root, LOCK_FILE);

export const readLock = async (root?: string): Promise<ContractLock | null> => readJson<ContractLock>(lockPath(root));

export const writeLock = async (lock: ContractLock, root?: string): Promise<void> => writeJson(lockPath(root), lock);

export type LockCheck =
  | { readonly status: 'ok' }
  | { readonly status: 'missing' }
  | { readonly status: 'changed'; readonly diff: LockDiff };

export const checkLock = async (root?: string): Promise<LockCheck> => {
  const committed = await readLock(root);
  if (committed === null) return { status: 'missing' };
  const current = buildLock();
  if (JSON.stringify(committed) === JSON.stringify(current)) return { status: 'ok' };
  return { status: 'changed', diff: diffLocks(committed, current) };
};
