/**
 * The Anthropic decider over a stubbed fetch: the request it sends (model,
 * headers, the decide tool, no forced tool choice), how it reads the
 * answer into a Decision with host usage, and how it recovers (a text
 * answer, a bad ref, a refusal, 429, a context that does not fit).
 */
import { describe, expect, it } from 'vitest';
import { ToolError } from '../../../src/core/errors.js';
import { createAnthropicDecider, DECIDE_TOOL, type AnthropicDeciderOptions } from '../../../src/driver/index.js';
import { classifyStep } from '../../../src/resolve/index.js';
import { deciderInput } from './fixtures.js';

type Json = Record<string, unknown>;

interface Exchange {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Json;
}

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const toolUse = (input: Json, id = 'toolu_1'): Json => ({ type: 'tool_use', id, name: 'decide', input });

const message = (content: Json[], usage: Json = { input_tokens: 1000, output_tokens: 50 }, extra: Json = {}): Json => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  stop_reason: content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn',
  content,
  usage,
  ...extra,
});

/** A fetch that answers from a script and records every request. */
const scripted = (responses: readonly (() => Response)[]) => {
  const exchanges: Exchange[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    exchanges.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Json });
    const next = responses[exchanges.length - 1];
    if (next === undefined) throw new Error(`unexpected request ${exchanges.length}`);
    return next();
  }) as typeof fetch;
  return { exchanges, fetchImpl };
};

const decider = (fetchImpl: typeof fetch, options: Partial<AnthropicDeciderOptions> = {}) =>
  createAnthropicDecider({ env: { ANTHROPIC_API_KEY: 'sk-test' }, fetchImpl, sleep: async () => undefined, ...options });

const userText = (body: Json): string => {
  const messages = body.messages as { role: string; content: unknown }[];
  return String(messages[0]!.content);
};

describe('the Anthropic decider', () => {
  it('needs ANTHROPIC_API_KEY', () => {
    expect(() => createAnthropicDecider({ env: {} })).toThrow(ToolError);
    try {
      createAnthropicDecider({ env: {} });
    } catch (error) {
      expect((error as ToolError).family).toBe('not-configured');
    }
  });

  it('asks claude-opus-5-5 with one strict decide tool, auto tool choice, explicit effort, and refusal fallbacks', async () => {
    const { exchanges, fetchImpl } = scripted([
      () =>
        reply(
          message(
            [{ type: 'thinking', thinking: '' }, toolUse({ kind: 'act', ref: 'c5', verb: 'click', reason: 'the only Search button, in the search landmark', rejected: ['c1'] })],
            { input_tokens: 2000, output_tokens: 84, cache_read_input_tokens: 210, cache_creation_input_tokens: 0 },
          ),
        ),
    ]);
    const d = decider(fetchImpl);
    expect(d.name).toBe('anthropic:claude-opus-5-5');
    const decision = await d.decide(deciderInput('Click Search button'));

    expect(exchanges).toHaveLength(1);
    const { url, headers, body } = exchanges[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers).toMatchObject({ 'x-api-key': 'sk-test', 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' });
    expect(body).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 16000, tool_choice: { type: 'auto' }, output_config: { effort: 'medium' }, fallbacks: 'default' });
    expect(body).not.toHaveProperty('thinking');
    expect(body.tools).toEqual([DECIDE_TOOL]);
    expect(DECIDE_TOOL.strict).toBe(true);
    const system = body.system as Json[];
    expect(system[0]).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } });
    expect(String(system[0]!.text)).toMatch(/call(?:ing)? the decide tool exactly once/i);
    const prompt = userText(body);
    expect(prompt).toMatch(/Step 1: Click Search button/);
    expect(prompt).toMatch(/\| c5 \| button \| Search \| content \| native \| search \|/);
    expect(prompt).toMatch(/@policyNumber = "POL-001"/);

    expect(decision).toMatchObject({ kind: 'act', ref: 'c5', verb: 'click', reason: 'the only Search button, in the search landmark', rejected: ['c1'] });
    expect(decision.host?.model).toBe('claude-opus-5-5');
    expect(decision.host?.tokens).toEqual({ prompt: 2210, completion: 84 });
    expect(decision.host?.promptFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('honours TESSERACT_MODEL and leaves out fallbacks and effort where the model does not take them', async () => {
    const { exchanges, fetchImpl } = scripted([() => reply(message([toolUse({ kind: 'act', ref: 'c5', reason: 'r' })]))]);
    const d = createAnthropicDecider({ env: { ANTHROPIC_API_KEY: 'sk-test', TESSERACT_MODEL: 'claude-haiku-4-5' }, fetchImpl });
    expect(d.name).toBe('anthropic:claude-haiku-4-5');
    await d.decide(deciderInput('Click Search button'));
    const { headers, body } = exchanges[0]!;
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body).not.toHaveProperty('fallbacks');
    expect(body).not.toHaveProperty('output_config');
    expect(headers).not.toHaveProperty('anthropic-beta');
  });

  it('reminds the model once when it answers in text instead of calling the tool', async () => {
    const { exchanges, fetchImpl } = scripted([
      () => reply(message([{ type: 'text', text: 'I would click the Search button.' }])),
      () => reply(message([toolUse({ kind: 'act', ref: 'c5', reason: 'Search button' })])),
    ]);
    const decision = await decider(fetchImpl).decide(deciderInput('Click Search button'));
    expect(decision).toMatchObject({ kind: 'act', ref: 'c5' });
    const second = exchanges[1]!.body.messages as { role: string; content: unknown }[];
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(String(second[2]!.content)).toMatch(/decide tool/);
    expect(decision.host?.tokens).toEqual({ prompt: 2000, completion: 100 });
  });

  it('returns a bad ref to the model as a tool error and takes its correction', async () => {
    const { exchanges, fetchImpl } = scripted([
      () => reply(message([toolUse({ kind: 'act', ref: 'c99', reason: 'guess' }, 'toolu_a')])),
      () => reply(message([toolUse({ kind: 'act', ref: 'c5', reason: 'Search button' }, 'toolu_b')])),
    ]);
    const decision = await decider(fetchImpl).decide(deciderInput('Click Search button'));
    expect(decision).toMatchObject({ kind: 'act', ref: 'c5' });
    const turn = (exchanges[1]!.body.messages as { content: unknown }[])[2]!.content as Json[];
    expect(turn[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_a', is_error: true });
    expect(String(turn[0]!.content)).toMatch(/c99 is not an available candidate/);
  });

  it('refuses refs the driver excluded', async () => {
    const { fetchImpl } = scripted([
      () => reply(message([toolUse({ kind: 'act', ref: 'c9', reason: 'first Edit' })])),
      () => reply(message([toolUse({ kind: 'act', ref: 'c11', reason: 'the other Edit' })])),
    ]);
    const decision = await decider(fetchImpl).decide(deciderInput('Click Edit', '', { exclude: ['c9'] }));
    expect(decision).toMatchObject({ kind: 'act', ref: 'c11' });
  });

  it('maps a handoff, filling in each candidate’s role from the snapshot', async () => {
    const { fetchImpl } = scripted([
      () =>
        reply(
          message([
            toolUse({
              kind: 'handoff',
              blockage: 'ambiguous-target',
              reason: 'two Edit links and the step names no row',
              candidates: [
                { ref: 'c9', name: 'Edit', why: 'row POL-001' },
                { ref: 'c11', name: 'Edit', why: 'row POL-003' },
              ],
            }),
          ]),
        ),
    ]);
    const decision = await decider(fetchImpl).decide(deciderInput('Click Edit'));
    expect(decision).toMatchObject({
      kind: 'handoff',
      blockage: 'ambiguous-target',
      candidates: [
        { ref: 'c9', role: 'link', name: 'Edit', why: 'row POL-001' },
        { ref: 'c11', role: 'link', name: 'Edit', why: 'row POL-003' },
      ],
    });
  });

  it('carries the assertion it chose for an expected-result check', async () => {
    const intent = classifyStep('Verify search results show policy', 'Matching policy appears', ['policyNumber'], { priorValues: ['@policyNumber'] });
    const { exchanges, fetchImpl } = scripted([() => reply(message([toolUse({ kind: 'act', ref: 'c8', assertionKind: 'contains-text', assertionExpected: '@policyNumber', reason: 'the row holding the policy' })]))]);
    const decision = await decider(fetchImpl).decide(
      deciderInput('Verify search results show policy', 'Matching policy appears', { purpose: 'assertion', assertion: intent.assertions[0]!, intent }),
    );
    expect(decision).toMatchObject({ kind: 'act', ref: 'c8', assertion: { kind: 'contains-text', expected: '@policyNumber' } });
    expect(userText(exchanges[0]!.body)).toMatch(/Task: Check the expected result/);
  });

  it('turns a refusal into a handoff instead of reading the content', async () => {
    const { fetchImpl } = scripted([() => reply(message([], { input_tokens: 900, output_tokens: 0 }, { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' } }))]);
    const decision = await decider(fetchImpl).decide(deciderInput('Click Search button'));
    expect(decision).toMatchObject({ kind: 'handoff', blockage: 'other' });
    if (decision.kind !== 'handoff') throw new Error('unreachable');
    expect(decision.reason).toMatch(/declined the request \(cyber\)/);
    expect(decision.host?.tokens).toEqual({ prompt: 900, completion: 0 });
  });

  it('retries 429 and 529 after the server’s delay', async () => {
    const delays: number[] = [];
    const { exchanges, fetchImpl } = scripted([
      () => reply({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 429, { 'retry-after': '2' }),
      () => reply({ type: 'error', error: { type: 'overloaded_error', message: 'overloaded' } }, 529),
      () => reply(message([toolUse({ kind: 'act', ref: 'c5', reason: 'Search' })])),
    ]);
    const decision = await decider(fetchImpl, { sleep: async (ms) => void delays.push(ms) }).decide(deciderInput('Click Search button'));
    expect(decision).toMatchObject({ kind: 'act', ref: 'c5' });
    expect(exchanges).toHaveLength(3);
    expect(delays[0]).toBe(2000);
  });

  it('reports bad credentials as not-configured, and other failures with their family', async () => {
    const unauthorized = scripted([() => reply({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401)]);
    await expect(decider(unauthorized.fetchImpl).decide(deciderInput('Click Search button'))).rejects.toMatchObject({ family: 'not-configured' });
    const down = scripted([0, 1, 2].map(() => () => reply({ type: 'error', error: { type: 'api_error', message: 'boom' } }, 500)));
    await expect(decider(down.fetchImpl).decide(deciderInput('Click Search button'))).rejects.toMatchObject({ family: 'unavailable' });
    expect(down.exchanges).toHaveLength(3);
  });

  it('drops the earlier-step history, then the ARIA text, when the prompt does not fit, then hands off', async () => {
    const tooLong = () => reply({ type: 'error', error: { type: 'invalid_request_error', message: 'prompt is too long: 1200000 tokens > 1000000 maximum' } }, 400);
    const input = deciderInput('Click Search button', '', { history: ['Step 0 "Open the app": resolved via observe'] });
    const fits = scripted([tooLong, () => reply(message([toolUse({ kind: 'act', ref: 'c5', reason: 'Search' })]))]);
    await expect(decider(fits.fetchImpl).decide(input)).resolves.toMatchObject({ kind: 'act', ref: 'c5' });
    expect(userText(fits.exchanges[0]!.body)).toMatch(/Earlier steps:/);
    expect(userText(fits.exchanges[1]!.body)).not.toMatch(/Earlier steps:/);
    expect(userText(fits.exchanges[1]!.body)).toMatch(/ARIA snapshot:/);

    const never = scripted([tooLong, tooLong, tooLong]);
    const decision = await decider(never.fetchImpl).decide(input);
    expect(decision).toMatchObject({ kind: 'handoff', blockage: 'other' });
    expect(userText(never.exchanges[2]!.body)).not.toMatch(/ARIA snapshot:/);
  });
});

describe('the Anthropic prompt', () => {
  it('never puts a secret-looking parameter value into the prompt', async () => {
    const { exchanges, fetchImpl } = scripted([() => reply(message([toolUse({ kind: 'act', ref: 'c4', reason: 'r' })]))]);
    await decider(fetchImpl).decide(deciderInput('Enter @policyNumber in search field', '', { params: { policyNumber: 'POL-001', password: 'correct-horse' } }));
    const prompt = userText(exchanges[0]!.body);
    expect(prompt).toMatch(/@password = <secret>/);
    expect(prompt).not.toMatch(/correct-horse/);
  });
});
