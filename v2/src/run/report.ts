/**
 * Playwright's JSON report → a flat list of test outcomes. Only the subset
 * of the report the receipts need is read, leniently (unknown fields are
 * ignored, a malformed report is malformed-response), so a newer Playwright
 * that adds fields does not break the run.
 *
 * The same TestOutcome shape is what the repair progress reporter writes per
 * finished test, so a paused run reports what it already knows through the
 * same mapping.
 */
import path from 'node:path';
import { z } from 'zod';
import { ToolError } from '../core/errors.js';

// ─── The report, as far as it is read ─────────────────────────────────────

const ReportErrorSchema = z.object({
  message: z.string().optional(),
  value: z.string().optional(),
  stack: z.string().optional(),
});

interface ReportStep {
  readonly title: string;
  readonly duration: number;
  readonly error?: z.infer<typeof ReportErrorSchema>;
}

const ReportStepSchema: z.ZodType<ReportStep> = z.object({
  title: z.string(),
  duration: z.number(),
  error: ReportErrorSchema.optional(),
});

const AnnotationSchema = z.object({ type: z.string(), description: z.string().optional() });

const ReportResultSchema = z.object({
  status: z.string(),
  duration: z.number(),
  retry: z.number().int().default(0),
  error: ReportErrorSchema.optional(),
  errors: z.array(ReportErrorSchema).default([]),
  steps: z.array(ReportStepSchema).default([]),
  attachments: z.array(z.object({ name: z.string(), contentType: z.string().optional(), path: z.string().optional() })).default([]),
  annotations: z.array(AnnotationSchema).optional(),
});

const ReportTestSchema = z.object({
  annotations: z.array(AnnotationSchema).default([]),
  expectedStatus: z.string(),
  status: z.string(),
  projectName: z.string().optional(),
  results: z.array(ReportResultSchema).default([]),
});

const ReportSpecSchema = z.object({
  title: z.string(),
  file: z.string(),
  tests: z.array(ReportTestSchema).default([]),
});

interface ReportSuite {
  readonly title: string;
  readonly file?: string;
  readonly specs: readonly z.infer<typeof ReportSpecSchema>[];
  readonly suites?: readonly ReportSuite[];
}

const ReportSuiteSchema: z.ZodType<ReportSuite> = z.lazy(() =>
  z.object({
    title: z.string(),
    file: z.string().optional(),
    specs: z.array(ReportSpecSchema).default([]),
    suites: z.array(ReportSuiteSchema).optional(),
  }),
);

const ReportSchema = z.object({
  config: z.object({ rootDir: z.string() }),
  suites: z.array(ReportSuiteSchema).default([]),
  errors: z.array(ReportErrorSchema).default([]),
});

export type PlaywrightReport = z.infer<typeof ReportSchema>;

// ─── Outcomes ──────────────────────────────────────────────────────────────

export const TestOutcomeStepSchema = z.object({
  title: z.string(),
  durationMs: z.number(),
  error: z.string().optional(),
});

export const TestOutcomeSchema = z.object({
  /** Absolute path of the spec file that ran. */
  file: z.string(),
  /** Describe titles, then the test title. */
  titlePath: z.array(z.string()),
  annotations: z.array(AnnotationSchema),
  /** Playwright's test outcome: expected, unexpected, flaky or skipped. */
  status: z.string(),
  /** Status of the last attempt: passed, failed, timedOut, skipped, interrupted. */
  lastStatus: z.string(),
  durationMs: z.number(),
  retries: z.number().int(),
  /** Raw message of the last attempt's first error (ANSI codes possible). */
  error: z.string().optional(),
  /** Top-level test.step blocks of the last attempt, in order. */
  steps: z.array(TestOutcomeStepSchema),
  /** Absolute path of the last attempt's trace, when one was kept. */
  tracePath: z.string().optional(),
});

export type TestOutcomeStep = z.infer<typeof TestOutcomeStepSchema>;
export type TestOutcome = z.infer<typeof TestOutcomeSchema>;

const errorText = (error: z.infer<typeof ReportErrorSchema> | undefined): string | undefined => {
  if (error === undefined) return undefined;
  const text = error.message ?? error.value;
  return text !== undefined && text.length > 0 ? text : undefined;
};

const outcomesOfSuite = (suite: ReportSuite, rootDir: string, describePath: readonly string[]): readonly TestOutcome[] => {
  const specs = suite.specs.flatMap((spec) =>
    spec.tests.flatMap((test): readonly TestOutcome[] => {
      const last = test.results[test.results.length - 1];
      if (last === undefined) return [];
      const annotations = [...test.annotations, ...(last.annotations ?? []).filter((a) => !test.annotations.some((t) => t.type === a.type && t.description === a.description))];
      const error = errorText(last.error) ?? errorText(last.errors[0]);
      const trace = last.attachments.find((attachment) => attachment.name === 'trace' && attachment.path !== undefined)?.path;
      return [
        {
          file: path.resolve(rootDir, spec.file),
          titlePath: [...describePath, spec.title],
          annotations: annotations.map((a) => ({ type: a.type, ...(a.description !== undefined ? { description: a.description } : {}) })),
          status: test.status,
          lastStatus: last.status,
          durationMs: test.results.reduce((sum, result) => sum + result.duration, 0),
          retries: Math.max(0, test.results.length - 1),
          ...(error !== undefined ? { error } : {}),
          steps: last.steps.map((step) => {
            const stepError = errorText(step.error);
            return { title: step.title, durationMs: step.duration, ...(stepError !== undefined ? { error: stepError } : {}) };
          }),
          ...(trace !== undefined ? { tracePath: trace } : {}),
        },
      ];
    }),
  );
  // A file suite's title is the file name; only describe suites below it name tests.
  const nested = (suite.suites ?? []).flatMap((child) => outcomesOfSuite(child, rootDir, [...describePath, child.title]));
  return [...specs, ...nested];
};

export interface ParsedReport {
  readonly outcomes: readonly TestOutcome[];
  /** Errors outside any test (load errors, "No tests found", max-failures notices), ANSI-stripped. */
  readonly errors: readonly string[];
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/** Parse the JSON reporter's output. A file that is not a Playwright report is malformed-response. */
export const parseReport = (text: string): ParsedReport => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new ToolError('malformed-response', `the Playwright JSON report is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = ReportSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ToolError('malformed-response', `the Playwright JSON report has an unexpected shape (${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'})`);
  }
  const report = parsed.data;
  return {
    outcomes: report.suites.flatMap((suite) => outcomesOfSuite(suite, report.config.rootDir, [])),
    errors: report.errors.flatMap((error) => {
      const message = errorText(error);
      return message === undefined ? [] : [message.replace(ANSI, '').trim()];
    }),
  };
};

/** Parse the repair progress reporter's JSON lines (malformed lines skipped). */
export const parseProgress = (text: string): readonly TestOutcome[] =>
  text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        const parsed = TestOutcomeSchema.safeParse(JSON.parse(line));
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    });
