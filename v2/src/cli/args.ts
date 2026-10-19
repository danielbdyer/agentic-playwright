/**
 * CLI flags generated from a tool's input schema, so the shell surface is
 * the same contract as the MCP surface. Scalars become flags, string arrays
 * accept repeats or commas, numbers are coerced, and anything structured is
 * a JSON value. `--json '<object>'` or `--input <file|->` supplies the whole
 * input; explicit flags override its fields. Secrets never come from flags:
 * flows read them from the environment.
 */
import { readFile } from 'node:fs/promises';
import type { z } from 'zod';
import { ToolError } from '../core/errors.js';

type FieldKind = 'string' | 'number' | 'boolean' | 'string-array' | 'json';

export interface FieldSpec {
  readonly name: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly description: string;
  readonly choices?: readonly string[];
}

interface ZodDef {
  readonly type: string;
  readonly innerType?: z.ZodType;
  readonly element?: z.ZodType;
  readonly entries?: Record<string, string>;
}

const defOf = (schema: z.ZodType): ZodDef => (schema as unknown as { def: ZodDef }).def;

const unwrap = (schema: z.ZodType): { readonly inner: z.ZodType; readonly optional: boolean } => {
  let current = schema;
  let optional = false;
  for (;;) {
    const def = defOf(current);
    if ((def.type === 'optional' || def.type === 'default' || def.type === 'nullable' || def.type === 'prefault') && def.innerType !== undefined) {
      optional = true;
      current = def.innerType;
      continue;
    }
    return { inner: current, optional };
  }
};

export const fieldsOf = (input: z.ZodObject): readonly FieldSpec[] =>
  Object.entries(input.shape as Record<string, z.ZodType>).map(([name, schema]) => {
    const { inner, optional } = unwrap(schema);
    const def = defOf(inner);
    const description = schema.description ?? inner.description ?? '';
    const base = { name, required: !optional, description };
    switch (def.type) {
      case 'string':
        return { ...base, kind: 'string' as const };
      case 'enum':
        return { ...base, kind: 'string' as const, choices: Object.values(def.entries ?? {}) };
      case 'number':
        return { ...base, kind: 'number' as const };
      case 'boolean':
        return { ...base, kind: 'boolean' as const };
      case 'array':
        return def.element !== undefined && defOf(unwrap(def.element).inner).type === 'string'
          ? { ...base, kind: 'string-array' as const }
          : { ...base, kind: 'json' as const };
      default:
        return { ...base, kind: 'json' as const };
    }
  });

const readInputSource = async (source: string): Promise<unknown> => {
  const text = source === '-' ? await readStdin() : await readFile(source, 'utf8');
  return parseJson(text, source === '-' ? 'stdin' : source);
};

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString('utf8');
};

const parseJson = (text: string, where: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ToolError('invalid-input', `${where} is not valid JSON: ${(error as Error).message}`);
  }
};

const kebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** Parse `--field value` pairs (and `--field=value`) against the tool's input fields. */
export const parseToolArgs = async (input: z.ZodObject, argv: readonly string[]): Promise<Record<string, unknown>> => {
  const fields = fieldsOf(input);
  const byFlag = new Map<string, FieldSpec>(fields.flatMap((f) => [[f.name, f], [kebab(f.name), f]] as [string, FieldSpec][]));
  let base: Record<string, unknown> = {};
  const explicit: Record<string, unknown> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith('--')) throw new ToolError('invalid-input', `unexpected argument: ${token}`);
    const eq = token.indexOf('=');
    const flag = eq >= 0 ? token.slice(2, eq) : token.slice(2);
    const inline = eq >= 0 ? token.slice(eq + 1) : undefined;
    const next = (): string => {
      if (inline !== undefined) return inline;
      const value = argv[i + 1];
      if (value === undefined) throw new ToolError('invalid-input', `--${flag} needs a value`);
      i += 1;
      return value;
    };
    if (flag === 'json') {
      const value = parseJson(next(), '--json');
      if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ToolError('invalid-input', '--json must be an object');
      base = { ...base, ...(value as Record<string, unknown>) };
      continue;
    }
    if (flag === 'input') {
      const value = await readInputSource(next());
      if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ToolError('invalid-input', '--input must contain an object');
      base = { ...base, ...(value as Record<string, unknown>) };
      continue;
    }
    const negated = flag.startsWith('no-') ? byFlag.get(flag.slice(3)) : undefined;
    if (negated !== undefined && negated.kind === 'boolean') {
      explicit[negated.name] = false;
      continue;
    }
    const field = byFlag.get(flag);
    if (field === undefined) {
      throw new ToolError('invalid-input', `unknown flag --${flag}; fields are ${fields.map((f) => `--${kebab(f.name)}`).join(', ')}`);
    }
    switch (field.kind) {
      case 'boolean': {
        const peek = inline ?? argv[i + 1];
        if (peek === 'true' || peek === 'false') {
          if (inline === undefined) i += 1;
          explicit[field.name] = peek === 'true';
        } else {
          explicit[field.name] = true;
        }
        break;
      }
      case 'number': {
        const raw = next();
        const value = Number(raw);
        if (!Number.isFinite(value)) throw new ToolError('invalid-input', `--${flag} must be a number, got ${raw}`);
        explicit[field.name] = value;
        break;
      }
      case 'string-array': {
        const values = next().split(',').map((v) => v.trim()).filter((v) => v.length > 0);
        explicit[field.name] = [...((explicit[field.name] as string[] | undefined) ?? []), ...values];
        break;
      }
      case 'json':
        explicit[field.name] = parseJson(next(), `--${flag}`);
        break;
      case 'string':
      default:
        explicit[field.name] = next();
    }
  }
  return { ...base, ...explicit };
};

export const toolHelp = (name: string, summary: string, description: string, input: z.ZodObject): string => {
  const lines = fieldsOf(input).map((f) => {
    const flag = `--${kebab(f.name)}`;
    const value = f.kind === 'boolean' ? '' : f.kind === 'string-array' ? ' <a,b,…>' : f.kind === 'json' ? ' <json>' : f.kind === 'number' ? ' <n>' : ' <value>';
    const choices = f.choices !== undefined ? ` (${f.choices.join(' | ')})` : '';
    return `  ${`${flag}${value}`.padEnd(30)} ${f.required ? '[required] ' : ''}${f.description}${choices}`;
  });
  return [
    `tesseract-qa ${name} — ${summary}`,
    '',
    description,
    '',
    'Flags:',
    ...lines,
    `  ${'--json <object>'.padEnd(30)} the whole input as JSON (flags override its fields)`,
    `  ${'--input <file|->'.padEnd(30)} read the input JSON from a file or stdin`,
  ].join('\n');
};
