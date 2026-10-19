/**
 * Playwright errors → error families.
 *
 * v1 mapped every TimeoutError to `timeout`, which threw away the reason
 * Playwright had already written down: an action that times out logs why it
 * kept retrying ("element is not visible", "element is not enabled",
 * "<div> intercepts pointer events"). That call log is the evidence an agent
 * needs to decide what to try next, so the classifier reads it — the most
 * recent state line wins, because Playwright retries and the last reason is
 * the one that held at the deadline.
 */
import { isToolError, type ErrorFamily } from '../core/errors.js';

export interface ClassifiedError {
  readonly family: ErrorFamily;
  readonly message: string;
}

// Playwright colours call logs when stdout is a TTY or FORCE_COLOR is set.
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

export const stripAnsi = (text: string): string => text.replace(ANSI, '');

const MAX_MESSAGE = 600;

interface ParsedError {
  readonly name: string;
  /** First non-empty line of the message (e.g. "locator.click: Timeout 500ms exceeded."). */
  readonly firstLine: string;
  /** The message body before "Call log:". */
  readonly body: string;
  /** Call-log entries with indentation, bullets, and "2 ×" repeat counts removed. */
  readonly callLog: readonly string[];
}

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error !== null && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return String(error);
};

const nameOf = (error: unknown): string => {
  if (error instanceof Error) return error.name;
  if (error !== null && typeof error === 'object' && typeof (error as { name?: unknown }).name === 'string') {
    return (error as { name: string }).name;
  }
  return '';
};

const cleanLogLine = (line: string): string =>
  line
    .trim()
    .replace(/^-\s*/, '')
    .replace(/^\d+\s*×\s*/, '')
    .replace(/^-\s*/, '')
    .trim();

const parse = (error: unknown): ParsedError => {
  const lines = stripAnsi(messageOf(error)).split(/\r?\n/);
  const logStart = lines.findIndex((line) => line.trim() === 'Call log:');
  const bodyLines = logStart >= 0 ? lines.slice(0, logStart) : lines;
  const callLog = logStart >= 0 ? lines.slice(logStart + 1).map(cleanLogLine).filter((line) => line.length > 0) : [];
  const firstLine = bodyLines.map((line) => line.trim()).find((line) => line.length > 0) ?? (nameOf(error) || 'unknown error');
  return { name: nameOf(error), firstLine, body: bodyLines.join('\n'), callLog };
};

const compose = (firstLine: string, relevant?: string): string => {
  const text = relevant !== undefined && relevant.length > 0 && !firstLine.includes(relevant) ? `${firstLine} (${relevant})` : firstLine;
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}…` : text;
};

const NOT_VISIBLE = /element is not visible|outside of the viewport|intercepts pointer events/i;
const NOT_ENABLED = /element is not (enabled|editable)|option being selected is not enabled/i;
const OPTION_MISSING = /did not find some options/i;
const WAITING_FOR_LOCATOR = /^waiting for (?!element to be|scheduled navigations)/i;
const RESOLVED = /resolved to/i;
/** Retry bookkeeping lines carry no cause; skip them when picking the line to quote. */
const BOOKKEEPING = /^(waiting \d+ms|retrying .+ action|attempting .+ action|scrolling into view if needed|done scrolling)/i;

const ASSERTION_LIKE =
  /Element is not an? <|Not a checkbox|Malformed value|Cannot type text|did not find some options|did not change its state|Unknown key|expect\(/;
const UNAVAILABLE =
  /Target page, context or browser has been closed|Target closed|[Bb]rowser has been closed|Browser closed|net::ERR_|Connection closed|has been disconnected|ECONNREFUSED|ECONNRESET|WebSocket error/;
const INVALID_URL = /Cannot navigate to invalid URL|Invalid URL|invalid url/;

const isTimeout = (parsed: ParsedError): boolean =>
  parsed.name === 'TimeoutError' || /: Timeout \d+ms exceeded/.test(parsed.firstLine) || /^Timeout \d+ms exceeded/.test(parsed.firstLine);

const classifyTimeout = (parsed: ParsedError): ClassifiedError => {
  // Newest reason first: the state that still held when the deadline passed.
  for (const line of [...parsed.callLog].reverse()) {
    if (NOT_VISIBLE.test(line)) return { family: 'not-visible', message: compose(parsed.firstLine, line) };
    if (NOT_ENABLED.test(line)) return { family: 'not-enabled', message: compose(parsed.firstLine, line) };
    if (OPTION_MISSING.test(line)) return { family: 'assertion-like', message: compose(parsed.firstLine, line) };
  }
  const waiting = parsed.callLog.find((line) => WAITING_FOR_LOCATOR.test(line));
  const resolved = parsed.callLog.some((line) => RESOLVED.test(line));
  if ((waiting !== undefined && !resolved) || /element\(s\) not found/.test(parsed.body)) {
    return { family: 'not-found', message: compose(parsed.firstLine, waiting) };
  }
  const lastCause = [...parsed.callLog].reverse().find((line) => !BOOKKEEPING.test(line));
  return { family: 'timeout', message: compose(parsed.firstLine, lastCause) };
};

/**
 * Classify anything an action or navigation threw. A ToolError keeps its
 * family. The message is Playwright's first line plus the call-log line that
 * explains it, ANSI-stripped, so it is short enough for a tool result.
 */
export const classifyPlaywrightError = (error: unknown): ClassifiedError => {
  if (isToolError(error)) return { family: error.family, message: error.message };
  const parsed = parse(error);
  if (isTimeout(parsed)) return classifyTimeout(parsed);
  const text = `${parsed.body}\n${parsed.callLog.join('\n')}`;
  if (/strict mode violation/.test(text)) return { family: 'ambiguous', message: compose(parsed.firstLine) };
  if (/outside of the viewport/i.test(text)) return { family: 'not-visible', message: compose(parsed.firstLine) };
  if (ASSERTION_LIKE.test(text)) return { family: 'assertion-like', message: compose(parsed.firstLine) };
  if (parsed.name === 'TargetClosedError' || UNAVAILABLE.test(text)) return { family: 'unavailable', message: compose(parsed.firstLine) };
  if (INVALID_URL.test(text)) return { family: 'invalid-input', message: compose(parsed.firstLine) };
  return { family: 'unclassified', message: compose(parsed.firstLine) };
};

/** Render an expected/actual value from a matcher result for a one-line message. */
const renderMatcherValue = (value: unknown): string => {
  if (value instanceof RegExp) return String(value);
  // Playwright reports states and absence as bare words or <placeholders>.
  if (typeof value === 'string') return /^<.*>$/.test(value) ? value : JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? String(value);
};

interface MatcherResult {
  readonly expected?: unknown;
  readonly actual?: unknown;
}

const matcherResultOf = (error: unknown): MatcherResult | null => {
  if (error === null || typeof error !== 'object' || !('matcherResult' in error)) return null;
  const result = (error as { matcherResult?: unknown }).matcherResult;
  return result !== null && typeof result === 'object' ? (result as MatcherResult) : null;
};

/**
 * The informative part of a failed `expect`: the first line plus what was
 * expected and what was received — which is what tells a paraphrase from a
 * mismatch. Read from Playwright's structured matcherResult when present
 * (its printed message switches to a diff for near-misses), else from the
 * Expected/Received lines of the message.
 */
export const summarizeExpectMessage = (error: unknown): string => {
  const parsed = parse(error);
  const result = matcherResultOf(error);
  const details =
    result !== null && ('expected' in result || 'actual' in result)
      ? [
          ...('expected' in result && result.expected !== undefined ? [`Expected: ${renderMatcherValue(result.expected)}`] : []),
          ...('actual' in result && result.actual !== undefined ? [`Received: ${renderMatcherValue(result.actual)}`] : []),
        ]
      : parsed.body
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => /^(Expected|Received)\b/.test(line))
          .map((line) => line.replace(/\s{2,}/g, ' '));
  const text = [parsed.firstLine, ...details].join('; ');
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}…` : text;
};
