/**
 * The authoring receipt is the one record of every call, committed to the
 * customer's repository. Nothing that leaves a page may ride into it
 * unredacted: not the error message, not a URL's query values (session
 * tokens, emails), and not the half of a PII value that a 400-character
 * truncation happened to cut through.
 */
import { describe, expect, it } from 'vitest';
import { buildReceipt, type AuthoringReceipt } from '../../../src/receipts/receipts.js';
import { redactUrlsIn } from '../../../src/core/pii.js';

const base: AuthoringReceipt = { at: 't', session: 's', tool: 'app.open', input: {}, outcome: 'succeeded', durationMs: 1 };

describe('authoring receipts: redaction', () => {
  it('redacts the error message, URL query values in the input, and the URL inside the message', () => {
    const receipt = buildReceipt(
      {
        ...base,
        input: { url: 'https://app.example.com/Login?token=abcDEFsecret' },
        outcome: 'failed',
        errorFamily: 'unavailable',
        message: 'page.goto: net::ERR_ABORTED at https://app.example.com/Home?sessionToken=abcDEFsecret&user=jdoe@acme.com\nCall log:\n  - navigating to "https://app.example.com/Home?sessionToken=abcDEFsecret", waiting until "load"',
      },
      'standard',
    );
    const line = JSON.stringify(receipt);
    expect(line).not.toContain('abcDEFsecret');
    expect(line).not.toContain('jdoe');
    expect(receipt.input).toEqual({ url: 'https://app.example.com/Login?token=<redacted>' });
    expect(receipt.message).toContain('https://app.example.com/Home?sessionToken=<redacted>&user=<redacted>');
    expect(receipt.message).toContain('"https://app.example.com/Home?sessionToken=<redacted>", waiting');
  });

  it('redacts query values of relative URLs under URL fields and in a navigate action\'s value', () => {
    const receipt = buildReceipt(
      {
        ...base,
        tool: 'app.act',
        input: { pageId: 'p1', action: 'navigate', value: 'Home?sessionToken=abcDEFsecret#frag', note: 'fill value=abc?x=1 stays text' },
        output: { finalUrl: 'Detail?id=POL-001', flow: { startUrl: 'Login?returnTo=Home', steps: [{ navigatesTo: 'Claims?claim=42' }] } },
      },
      'standard',
    );
    expect(receipt.input).toEqual({ pageId: 'p1', action: 'navigate', value: 'Home?sessionToken=<redacted>#<redacted>', note: 'fill value=abc?x=1 stays text' });
    expect(receipt.output).toEqual({ finalUrl: 'Detail?id=<redacted>', flow: { startUrl: 'Login?returnTo=<redacted>', steps: [{ navigatesTo: 'Claims?claim=<redacted>' }] } });
  });

  it('does not treat a fill value as a URL', () => {
    const receipt = buildReceipt({ ...base, tool: 'app.act', input: { action: 'fill', value: 'Find?me' } }, 'standard');
    expect(receipt.input).toEqual({ action: 'fill', value: 'Find?me' });
  });

  it('redacts URLs and text in the decision', () => {
    const receipt = buildReceipt(
      { ...base, decision: { reason: 'the link https://app.example.com/Detail?ssn=123-45-6789 matched jane@example.com' } },
      'standard',
    );
    expect(receipt.decision).toEqual({ reason: 'the link https://app.example.com/Detail?ssn=<redacted> matched <email>' });
  });

  it('keeps trailing punctuation outside an embedded URL', () => {
    expect(redactUrlsIn('opened https://a.example.com/P?id=7. Then (see https://a.example.com/Q?t=x), done', 'standard'))
      .toBe('opened https://a.example.com/P?id=<redacted>. Then (see https://a.example.com/Q?t=<redacted>), done');
  });

  it('leaves everything as written when PII mode is off, except secret-named fields', () => {
    const receipt = buildReceipt(
      { ...base, input: { url: 'https://app.example.com/Login?token=abc', password: 'hunter2' }, outcome: 'failed', message: 'at https://app.example.com/x?y=1' },
      'off',
    );
    expect(receipt.input).toEqual({ url: 'https://app.example.com/Login?token=abc', password: '<secret>' });
    expect(receipt.message).toBe('at https://app.example.com/x?y=1');
  });
});

describe('authoring receipts: truncation', () => {
  it('redacts before truncating, so an email cut at the 400-character boundary does not leak its local part', () => {
    const text = `${'x'.repeat(388)} jonathan.smith@example.com and more text after it`;
    const receipt = buildReceipt({ ...base, output: { aria: text } }, 'standard');
    const aria = (receipt.output as { aria: string }).aria;
    expect(aria).not.toContain('jonathan');
    expect(aria).toContain('<email>');
  });

  it('redacts before truncating a phone number cut mid-way', () => {
    // The cut at 400 falls after '555-123-45', which no phone rule matches.
    const text = `${'y'.repeat(385)} tel 555-123-4567 today`;
    const receipt = buildReceipt({ ...base, output: { text } }, 'standard');
    expect((receipt.output as { text: string }).text).not.toMatch(/555-123/);
    expect((receipt.output as { text: string }).text).toContain('<phone>');
  });

  it('still truncates long strings and samples long arrays', () => {
    const receipt = buildReceipt({ ...base, output: { aria: 'z'.repeat(1000), items: Array.from({ length: 20 }, (_, i) => i) } }, 'standard');
    const output = receipt.output as { aria: string; items: unknown[] };
    expect(output.aria).toBe(`${'z'.repeat(400)}…(1000 chars)`);
    expect(output.items).toHaveLength(13);
    expect(output.items[12]).toBe('…(8 more)');
  });

  it('redacts a long error message whole', () => {
    const message = `${'m'.repeat(1990)} jonathan.smith@example.com`;
    const receipt = buildReceipt({ ...base, outcome: 'failed', message }, 'standard');
    expect(receipt.message).not.toContain('jonathan');
  });
});
