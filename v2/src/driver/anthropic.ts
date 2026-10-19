/**
 * A decider backed by Claude over the Messages API, called with fetch (no
 * SDK dependency). The batch driver is the only place Tesseract itself
 * calls a model (vision §5.11); this adapter sees one decision at a time:
 * a playbook excerpt, the step, the heuristic reading, the facets memory
 * returned, and the scoped candidates as a table. It answers through one
 * tool, `decide`, whose input is the Decision.
 *
 * Request shape, per the current API:
 *  - model from TESSERACT_MODEL, default claude-opus-5-5;
 *  - tool_choice "auto" with strict: true and an instruction to call the
 *    tool. Claude Opus 5.5 (like Fable 5.1 and Sonnet 5.5) rejects forced
 *    tool use ("any"/"tool") with a 400, so the response is checked for a
 *    tool call and the model reminded once when it answered in text;
 *  - thinking left at the model's default (adaptive, always on for Opus
 *    5.5) and effort set explicitly (default "medium", TESSERACT_EFFORT);
 *  - server-side refusal fallbacks (`fallbacks: "default"`, beta
 *    server-side-fallback-2026-07-01) on the models that support them, and
 *    stop_reason "refusal" checked before reading content.
 * The model id that served, a sha256 fingerprint of the prompt, and the
 * usage token counts go into Decision.host, so the authoring receipt of the
 * call that acts on the decision carries them.
 */
import { z } from 'zod';
import { ToolError } from '../core/errors.js';
import { sha256Hex, stableStringify } from '../core/hash.js';
import { AssertionKindSchema, HandoffBlockageSchema, VerbSchema, type Candidate } from '../contract/schemas.js';
import type { Decider, DeciderInput, Decision, HandoffCandidate, HostUsage } from './types.js';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
export const ANTHROPIC_VERSION = '2023-06-01';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** Models that take server-side refusal fallbacks in the "default" form. */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-fable-5', 'claude-sonnet-5-5']);
/** Models that take output_config.effort. */
const EFFORT_MODELS = /^claude-(?:opus-(?:4-[5-9]|5)|sonnet-(?:4-6|5)|fable-|mythos-|haiku-5)/;

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AnthropicDeciderOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** Default: env ANTHROPIC_API_KEY. */
  readonly apiKey?: string;
  /** Default: env TESSERACT_MODEL, else claude-opus-5-5. */
  readonly model?: string;
  /** Default: env ANTHROPIC_BASE_URL, else https://api.anthropic.com. */
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  /** Default 16000 (thinking counts against it). */
  readonly maxTokens?: number;
  /** Default: env TESSERACT_EFFORT, else "medium"; null sends no effort. */
  readonly effort?: Effort | null;
  /** Server-side refusal fallbacks; default true where the model supports them (env TESSERACT_ANTHROPIC_FALLBACKS=0 turns them off). */
  readonly fallbacks?: boolean;
  /** Retries for 429 / 5xx / 529 / network errors. Default 2. */
  readonly maxRetries?: number;
  readonly timeoutMs?: number;
  /** Candidates shown in the table. Default 80. */
  readonly maxCandidates?: number;
  /** ARIA snapshot text shown, in bytes. Default 6000. */
  readonly maxAriaBytes?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

// ─── The prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = [
  'You choose targets for Tesseract, which authors plain Playwright tests for OutSystems applications from Azure DevOps test cases.',
  'For one step at a time you see the step wording, a heuristic reading of it, facets memory already knows, and the candidates an accessibility snapshot of the live page offers.',
  'Answer by calling the decide tool exactly once. Do not answer in text.',
  '',
  'Rules:',
  '- Act only on a candidate ref from the table, or a facet id from memory. Never invent refs. Excluded refs were tried and failed.',
  '- Names come from the test author, locators from the page: match the step words to accessible names; prefer role and name inside the landmark the step names. A roleless clickable (role generic, affordance handler-owner) is what an author calls a button by its text.',
  '- Values come from the test case: use "@param" for an ADO parameter, never invent data.',
  '- For an assertion, choose the element whose content proves the expected result and set assertionKind; prefer text, value, a row, or a count over bare visibility. ADO expected text is often a paraphrase: if the page words it differently, still choose the element and say so in the reason.',
  '- When two or more candidates fit equally (an "Edit" link in every row and the step names no row), do not guess: kind "handoff", blockage "ambiguous-target", and list them in candidates.',
  '- When nothing fits, kind "handoff", blockage "not-found". Missing test data is "missing-data".',
  '- reason: one sentence a reviewer can check. rejected: refs you considered and rejected.',
].join('\n');

const cell = (text: string | undefined, max = 60): string => {
  if (text === undefined || text.length === 0) return '';
  const flat = text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const stateOf = (c: Candidate): string =>
  [!c.visible ? 'hidden' : null, !c.enabled ? 'disabled' : null, !c.inViewport ? 'offscreen' : null, c.checked === true ? 'checked' : null]
    .filter((s): s is string => s !== null)
    .join(' ');

/** Hinted candidates first (best first), then the rest in page order; excluded refs left out. */
export const orderCandidates = (input: DeciderInput, max: number): readonly Candidate[] => {
  const excluded = new Set(input.exclude);
  const byRef = new Map(input.snapshot.candidates.map((c) => [c.ref, c] as const));
  const hinted = input.hints.flatMap((h) => {
    const c = byRef.get(h.ref);
    return c === undefined || excluded.has(c.ref) ? [] : [c];
  });
  const seen = new Set(hinted.map((c) => c.ref));
  const rest = input.snapshot.candidates.filter((c) => !seen.has(c.ref) && !excluded.has(c.ref));
  return [...hinted, ...rest].slice(0, max);
};

export const candidateTable = (candidates: readonly Candidate[]): string =>
  [
    '| ref | role | name | named by | affordance | landmark | block | row | state |',
    '|---|---|---|---|---|---|---|---|---|',
    ...candidates.map(
      (c) =>
        `| ${c.ref} | ${c.role}${c.level !== undefined ? ` h${c.level}` : ''} | ${cell(c.name)} | ${c.namingSource} | ${c.affordance} | ${cell(c.landmark)}${c.landmarkName !== undefined ? ` "${cell(c.landmarkName, 30)}"` : ''} | ${cell(c.dataBlock, 30)} | ${cell(c.rowText, 50)} | ${stateOf(c)} |`,
    ),
  ].join('\n');

/** Parameter names whose values never go into a prompt. */
const SECRET_PARAM = /pass(?:word)?|secret|token|pin\b|api.?key|credential/i;

/** How much context to send: 0 everything; 1 without earlier-step history; 2 also without the ARIA text and with fewer candidates. */
export type ContextLevel = 0 | 1 | 2;

export const buildUserPrompt = (input: DeciderInput, level: ContextLevel, limits: { readonly maxCandidates: number; readonly maxAriaBytes: number }): string => {
  const { intent, step, snapshot } = input;
  const candidates = orderCandidates(input, level === 2 ? Math.min(25, limits.maxCandidates) : limits.maxCandidates);
  const params = Object.entries(input.params);
  const purpose =
    input.purpose === 'assertion' && input.assertion !== undefined
      ? `Check the expected result: ${input.assertion.kind}${input.assertion.expected !== null ? ` ${JSON.stringify(input.assertion.expected)}` : ''} on ${input.assertion.targetPhrase ?? input.assertion.roleHint ?? 'the element'}${input.assertion.rowCue !== null ? ` in the row with ${input.assertion.rowCue}` : ''} (from "${input.assertion.source}"${input.assertion.note !== null ? `; ${input.assertion.note}` : ''}). Choose the element to assert on.`
      : input.purpose === 'navigation'
        ? 'Reach the screen the step names: choose the link or menu entry to click.'
        : `Perform the step: choose the element to ${intent.verb}.`;
  const sections = [
    `Test case ${input.testCase.id}: ${input.testCase.title}`,
    `Step ${step.index}: ${step.action}`,
    `Expected result: ${step.expected.length > 0 ? step.expected : '(none)'}`,
    `Task: ${purpose}`,
    `Heuristic reading: verb ${intent.verb}; target "${intent.targetMention ?? intent.targetPhrase ?? ''}"${intent.roleHint !== null ? `; role ${intent.roleHint}` : ''}${intent.value !== null ? `; value ${intent.value}` : ''}${intent.landmarkCue !== null ? `; landmark ${intent.landmarkCue}` : ''}${intent.rowCue !== null ? `; row ${intent.rowCue}` : ''}`,
    params.length > 0 ? `Parameters (data row 1): ${params.map(([k, v]) => `@${k} = ${SECRET_PARAM.test(k) ? '<secret>' : JSON.stringify(v)}`).join(', ')}` : null,
    level === 0 && input.history.length > 0 ? `Earlier steps:\n${input.history.map((h) => `- ${h}`).join('\n')}` : null,
    input.exclude.length > 0 ? `Excluded (already tried): ${input.exclude.join(', ')}` : null,
    `Attempt ${input.attempt}.`,
    input.facets.length > 0
      ? `Facets memory knows on this screen:\n${input.facets
          .slice(0, 8)
          .map((f) => `- ${f.id} "${cell(f.displayName)}" ${f.kind}${f.role !== undefined ? ` ${f.role}` : ''}, ${f.status}, score ${f.score.toFixed(2)}`)
          .join('\n')}`
      : null,
    `Page: ${cell(snapshot.title, 80)} — ${snapshot.url} (scope ${snapshot.scope}, ${snapshot.totalCandidates} candidates${candidates.length < snapshot.candidates.length ? `, ${candidates.length} shown` : ''})`,
    input.hints.length > 0 ? `Pre-filter hints (a suggestion): ${input.hints.slice(0, 5).map((h) => `${h.ref} ${h.score.toFixed(2)}`).join(', ')}` : null,
    `Candidates:\n${candidateTable(candidates)}`,
    level < 2 && snapshot.aria.length > 0
      ? `ARIA snapshot:\n${Buffer.byteLength(snapshot.aria) > limits.maxAriaBytes ? `${Buffer.from(snapshot.aria).subarray(0, limits.maxAriaBytes).toString('utf8')}\n…(truncated)` : snapshot.aria}`
      : null,
  ];
  return sections.filter((s): s is string => s !== null).join('\n\n');
};

// ─── The tool ──────────────────────────────────────────────────────────────

export const DECIDE_TOOL = {
  name: 'decide',
  description:
    'Record your decision for this step: act on one candidate ref (or one memory facet id), or hand the step to a human with the blockage and the plausible candidates.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'reason'],
    properties: {
      kind: { type: 'string', enum: ['act', 'handoff'] },
      ref: { type: 'string', description: 'Candidate ref from the table, e.g. "c12" (kind act).' },
      facetId: { type: 'string', description: 'A memory facet id instead of a ref (kind act).' },
      verb: { type: 'string', enum: [...VerbSchema.options], description: 'The action; usually the heuristic reading.' },
      value: { type: 'string', description: 'Text to type or option to select; "@param" for an ADO parameter.' },
      assertionKind: { type: 'string', enum: [...AssertionKindSchema.options], description: 'For an expected-result check.' },
      assertionExpected: { type: 'string', description: 'Expected text, value, or count; "@param" for an ADO parameter.' },
      reason: { type: 'string' },
      rejected: { type: 'array', items: { type: 'string' } },
      blockage: { type: 'string', enum: [...HandoffBlockageSchema.options], description: 'Kind handoff: why a human is needed.' },
      candidates: {
        type: 'array',
        description: 'Kind handoff: the plausible candidates.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: { ref: { type: 'string' }, name: { type: 'string' }, why: { type: 'string' } },
        },
      },
    },
  },
} as const;

const DecideInputSchema = z.object({
  kind: z.enum(['act', 'handoff']),
  ref: z.string().optional(),
  facetId: z.string().optional(),
  verb: VerbSchema.optional(),
  value: z.string().optional(),
  assertionKind: AssertionKindSchema.optional(),
  assertionExpected: z.string().optional(),
  reason: z.string(),
  rejected: z.array(z.string()).optional(),
  blockage: HandoffBlockageSchema.optional(),
  candidates: z.array(z.object({ ref: z.string().optional(), name: z.string(), why: z.string().optional() })).optional(),
});

/** Turn the tool input into a Decision, or say what is wrong with it so the model can correct it. */
export const toDecision = (raw: unknown, input: DeciderInput): { readonly decision: Decision } | { readonly error: string } => {
  const parsed = DecideInputSchema.safeParse(raw);
  if (!parsed.success) return { error: `the decide input does not match its schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const d = parsed.data;
  const byRef = new Map(input.snapshot.candidates.map((c) => [c.ref, c] as const));
  if (d.kind === 'handoff') {
    const candidates: HandoffCandidate[] = (d.candidates ?? []).map((c) => {
      const known = c.ref !== undefined ? byRef.get(c.ref) : undefined;
      return { name: c.name, ...(c.ref !== undefined ? { ref: c.ref } : {}), ...(known !== undefined ? { role: known.role } : {}), ...(c.why !== undefined ? { why: c.why } : {}) };
    });
    return { decision: { kind: 'handoff', blockage: d.blockage ?? 'other', reason: d.reason, candidates } };
  }
  const hasRef = d.ref !== undefined && d.ref.length > 0;
  const hasFacet = d.facetId !== undefined && d.facetId.length > 0;
  if (hasRef === hasFacet) return { error: 'kind "act" needs exactly one of ref or facetId' };
  if (hasRef && (!byRef.has(d.ref!) || input.exclude.includes(d.ref!))) return { error: `ref ${d.ref} is not an available candidate; choose a ref from the table` };
  if (hasFacet && !input.facets.some((f) => f.id === d.facetId)) return { error: `facet ${d.facetId} is not one of the facets memory returned` };
  const kind = d.assertionKind ?? (input.purpose === 'assertion' ? input.assertion?.kind : undefined);
  const expectedText = d.assertionExpected ?? (input.assertion?.expected !== null && input.assertion?.expected !== undefined ? String(input.assertion.expected) : undefined);
  const expected = expectedText !== undefined && kind === 'count' && /^\d+$/.test(expectedText) ? Number(expectedText) : expectedText;
  return {
    decision: {
      kind: 'act',
      ...(hasRef ? { ref: d.ref! } : { facetId: d.facetId! }),
      verb: d.verb ?? input.intent.verb,
      ...(d.value !== undefined ? { value: d.value } : input.intent.value !== null ? { value: input.intent.value } : {}),
      ...(kind !== undefined ? { assertion: { kind, ...(expected !== undefined ? { expected } : {}) } } : {}),
      reason: d.reason,
      ...(d.rejected !== undefined ? { rejected: d.rejected } : {}),
    },
  };
};

// ─── The HTTP exchange ─────────────────────────────────────────────────────

const ContentBlockSchema = z.looseObject({ type: z.string() });
const ToolUseSchema = z.object({ type: z.literal('tool_use'), id: z.string(), name: z.string(), input: z.unknown() });
const ResponseSchema = z.looseObject({
  model: z.string().optional(),
  stop_reason: z.string().nullable().optional(),
  stop_details: z.looseObject({ category: z.string().nullable().optional(), explanation: z.string().nullable().optional() }).nullable().optional(),
  content: z.array(ContentBlockSchema),
  usage: z
    .looseObject({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().nullable().optional(),
      cache_read_input_tokens: z.number().nullable().optional(),
    })
    .optional(),
});
type Response = z.infer<typeof ResponseSchema>;
type Block = z.infer<typeof ContentBlockSchema>;

type Message = { readonly role: 'user' | 'assistant'; readonly content: string | readonly Record<string, unknown>[] };

class ContextExceeded extends Error {}

const isContextExceeded = (status: number, body: string): boolean =>
  (status === 400 || status === 413) && /prompt is too long|too many (?:input )?tokens|context (?:window|length)|exceeds? the (?:maximum|context)/i.test(body);

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

const retryAfterMs = (header: string | null, attempt: number): number => {
  const seconds = header === null ? NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 30_000) : Math.min(1000 * 2 ** attempt, 15_000);
};

const errorMessage = (body: string): string => {
  try {
    const parsed = z.object({ error: z.object({ message: z.string() }) }).safeParse(JSON.parse(body));
    return parsed.success ? parsed.data.error.message : body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
};

export const createAnthropicDecider = (options: AnthropicDeciderOptions = {}): Decider => {
  const env = options.env ?? process.env;
  const apiKey = options.apiKey ?? env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new ToolError('not-configured', 'the anthropic decider needs ANTHROPIC_API_KEY in the environment (or use the heuristic decider)');
  }
  const model = options.model ?? (env.TESSERACT_MODEL !== undefined && env.TESSERACT_MODEL.length > 0 ? env.TESSERACT_MODEL : DEFAULT_ANTHROPIC_MODEL);
  const baseUrl = (options.baseUrl ?? env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxTokens = options.maxTokens ?? 16_000;
  const envEffort = env.TESSERACT_EFFORT as Effort | undefined;
  const effort = options.effort === null ? null : (options.effort ?? (envEffort !== undefined && ['low', 'medium', 'high', 'xhigh', 'max'].includes(envEffort) ? envEffort : 'medium'));
  const fallbacks = (options.fallbacks ?? env.TESSERACT_ANTHROPIC_FALLBACKS !== '0') && FALLBACK_MODELS.has(model);
  const maxRetries = options.maxRetries ?? 2;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const limits = { maxCandidates: options.maxCandidates ?? 80, maxAriaBytes: options.maxAriaBytes ?? 6_000 };
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const system = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }];
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    ...(fallbacks ? { 'anthropic-beta': FALLBACK_BETA } : {}),
  };

  const post = async (messages: readonly Message[]): Promise<Response> => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      tools: [DECIDE_TOOL],
      tool_choice: { type: 'auto' },
      messages,
      ...(effort !== null && EFFORT_MODELS.test(model) ? { output_config: { effort } } : {}),
      ...(fallbacks ? { fallbacks: 'default' } : {}),
    });
    for (let attempt = 0; ; attempt += 1) {
      let response: globalThis.Response;
      try {
        response = await fetchImpl(`${baseUrl}/v1/messages`, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        if (attempt < maxRetries) {
          await sleep(retryAfterMs(null, attempt));
          continue;
        }
        throw new ToolError('unavailable', `the Messages API could not be reached: ${error instanceof Error ? error.message : String(error)}`);
      }
      const text = await response.text();
      if (response.ok) {
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new ToolError('malformed-response', 'the Messages API returned a body that is not JSON');
        }
        const parsed = ResponseSchema.safeParse(json);
        if (!parsed.success) throw new ToolError('malformed-response', `unexpected Messages API response: ${parsed.error.issues[0]?.message ?? 'shape'}`);
        return parsed.data;
      }
      if (isContextExceeded(response.status, text)) throw new ContextExceeded(errorMessage(text));
      if (response.status === 401 || response.status === 403) {
        throw new ToolError('not-configured', `the Messages API refused the credentials (${response.status}): ${errorMessage(text)}`);
      }
      if (RETRYABLE.has(response.status) && attempt < maxRetries) {
        await sleep(retryAfterMs(response.headers.get('retry-after'), attempt));
        continue;
      }
      throw new ToolError(response.status === 429 ? 'rate-limited' : response.status >= 500 ? 'unavailable' : 'invalid-input', `Messages API ${response.status}: ${errorMessage(text)}`);
    }
  };

  const decide = async (input: DeciderInput): Promise<Decision> => {
    const tokens = { prompt: 0, completion: 0 };
    let served = model;
    let fingerprint = '';
    const host = (): HostUsage => ({ model: served, promptFingerprint: fingerprint, tokens: { ...tokens } });
    const handoff = (reason: string): Decision => ({ kind: 'handoff', blockage: 'other', reason, candidates: [], host: host() });

    for (const level of [0, 1, 2] as const) {
      const prompt = buildUserPrompt(input, level, limits);
      fingerprint = `sha256:${sha256Hex(stableStringify({ model, system: SYSTEM_PROMPT, tool: DECIDE_TOOL, prompt }))}`;
      const messages: Message[] = [{ role: 'user', content: prompt }];
      try {
        for (let turn = 0; turn < 3; turn += 1) {
          const response = await post(messages);
          served = response.model ?? served;
          tokens.prompt += (response.usage?.input_tokens ?? 0) + (response.usage?.cache_creation_input_tokens ?? 0) + (response.usage?.cache_read_input_tokens ?? 0);
          tokens.completion += response.usage?.output_tokens ?? 0;
          if (response.stop_reason === 'refusal') {
            const category = response.stop_details?.category;
            return handoff(`the model declined the request${category !== undefined && category !== null ? ` (${category})` : ''}`);
          }
          const call = response.content.map((block: Block) => ToolUseSchema.safeParse(block)).find((p) => p.success && p.data.name === DECIDE_TOOL.name);
          const assistant: Message = { role: 'assistant', content: response.content };
          if (call === undefined || !call.success) {
            messages.push(assistant, { role: 'user', content: 'Call the decide tool now with your decision for this step.' });
            continue;
          }
          const result = toDecision(call.data.input, input);
          if ('decision' in result) return { ...result.decision, host: host() };
          messages.push(assistant, {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: call.data.id, is_error: true, content: `${result.error}. Call decide again.` }],
          });
        }
        return handoff('the model did not return a usable decision after three turns');
      } catch (error) {
        if (error instanceof ContextExceeded) continue;
        throw error;
      }
    }
    return handoff('the step does not fit the model context even without history and ARIA text');
  };

  return { name: `anthropic:${model}`, decide };
};
