/**
 * Response shapes read from Azure DevOps, validated with zod so a surprise in
 * a response is a `malformed-response` naming the field, not a TypeError three
 * calls later. Schemas list only what is read; unknown fields are ignored.
 */
import { z } from 'zod';
import { ToolError } from '../core/errors.js';
import type { AdoClient, AdoRequest } from './client.js';

/** Ids arrive as numbers from the newer APIs and as numeric strings in ShallowReference objects. */
export const IdSchema = z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform((value) => Number(value));

export const WorkItemSchema = z.object({
  id: IdSchema,
  rev: z.number().int().optional(),
  fields: z.record(z.string(), z.unknown()).default({}),
});

export const WorkItemBatchSchema = z.object({ value: z.array(WorkItemSchema.nullable()).default([]) });

const RefSchema = z.object({ id: IdSchema }).nullable().optional();

export const WiqlResultSchema = z.object({
  workItems: z.array(z.object({ id: IdSchema })).optional(),
  workItemRelations: z.array(z.object({ source: RefSchema, target: RefSchema })).optional(),
});

export const SuiteTestCasePageSchema = z.object({
  value: z
    .array(
      z.object({
        workItem: z.object({ id: IdSchema, name: z.string().optional() }),
        pointAssignments: z
          .array(z.object({ id: IdSchema, configurationId: IdSchema.optional(), configurationName: z.string().optional() }))
          .default([]),
      }),
    )
    .default([]),
  continuationToken: z.string().optional(),
});

export const SuiteListPageSchema = z.object({
  value: z.array(z.object({ id: IdSchema, name: z.string().optional() })).default([]),
  continuationToken: z.string().optional(),
});

export const TestPointPageSchema = z.object({
  value: z
    .array(
      z.object({
        id: IdSchema,
        configuration: z.object({ id: IdSchema.optional(), name: z.string().optional() }).optional(),
        testCaseReference: z.object({ id: IdSchema }).optional(),
      }),
    )
    .default([]),
  continuationToken: z.string().optional(),
});

export const TestRunSchema = z.object({
  id: IdSchema,
  name: z.string().optional(),
  state: z.string().optional(),
  url: z.string().optional(),
  webAccessUrl: z.string().optional(),
  plan: z.object({ id: IdSchema }).nullable().optional(),
});

export const TestRunListSchema = z.object({ value: z.array(TestRunSchema).default([]), continuationToken: z.string().optional() });

export const TestResultSchema = z.object({
  id: IdSchema,
  testPoint: z.object({ id: IdSchema }).nullable().optional(),
  testCase: z.object({ id: IdSchema }).nullable().optional(),
});

export const TestResultListSchema = z.object({ value: z.array(TestResultSchema).default([]) });

export const CommentSchema = z.object({ id: IdSchema, url: z.string().optional() });

/** Validate a response body; a mismatch is malformed-response naming the first few issues. */
export const parseBody = <S extends z.ZodType>(schema: S, body: unknown, what: string): z.output<S> => {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issues = result.error.issues
    .slice(0, 4)
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ');
  throw new ToolError('malformed-response', `unexpected response from Azure DevOps for ${what}: ${issues}`);
};

/**
 * Follow continuation tokens: the testplan APIs return the token in the
 * `x-ms-continuationtoken` header (some versions also in the body) and take
 * it back as the `continuationToken` query parameter. Stops on a repeated
 * token so a misbehaving server cannot loop forever.
 */
export const collectPages = async <S extends z.ZodType<{ readonly value: readonly unknown[]; readonly continuationToken?: string | undefined }>>(
  client: AdoClient,
  request: AdoRequest,
  schema: S,
  maxPages = 500,
): Promise<readonly z.output<S>[]> => {
  const what = request.what ?? `${request.method} ${request.path}`;
  const pages: z.output<S>[] = [];
  const seen = new Set<string>();
  let token: string | undefined;
  do {
    const response = await client.request({ ...request, query: { ...(request.query ?? {}), continuationToken: token } });
    const page = parseBody(schema, response.body, what);
    pages.push(page);
    const next = response.headers.get('x-ms-continuationtoken') ?? page.continuationToken ?? undefined;
    token = next !== undefined && next.length > 0 && !seen.has(next) ? next : undefined;
    if (token !== undefined) seen.add(token);
  } while (token !== undefined && pages.length < maxPages);
  return pages;
};
