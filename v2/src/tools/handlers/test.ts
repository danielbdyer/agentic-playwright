/**
 * test.emit and test.run: the pen and the harness.
 *
 * test.emit turns the agent's resolved steps into a plain Playwright spec,
 * the page objects it uses and the flows it calls (the emission library does
 * the rendering, merging and writing); this handler loads what emission
 * needs, mints loose targets as candidate facets, and appends the emit
 * record that test.run, review.record and ado.publish read.
 *
 * test.run is a thin wrapper over the runner library.
 */
import path from 'node:path';
import { ToolError } from '../../core/errors.js';
import { readJson } from '../../core/fsio.js';
import { FlowRecordingSchema, type Handoff, type TestCase } from '../../contract/schemas.js';
import { loadCase } from '../../ado/index.js';
import { emitTest, type FlowRecording, type FlowUse } from '../../emit/index.js';
import { appendEmitRecord, runSpecs } from '../../run/index.js';
import { loadProfile, type Profile } from '../../workspace/profiles.js';
import type { Workspace } from '../../workspace/workspace.js';
import type { ToolHandlers } from '../types.js';
import { adoText, loadEmitCatalogs, normalizeSteps, screensUsed, validateSteps } from './emit-targets.js';
import { findHandoff } from './handoff-store.js';

const isFullCase = (value: TestCase | { readonly id: string }): value is TestCase => 'steps' in value && Array.isArray((value as TestCase).steps);

/** The case as given, or the cached copy for {id}. */
const resolveTestCase = async (workspace: Workspace, given: TestCase | { readonly id: string }): Promise<TestCase> => {
  if (isFullCase(given)) return given;
  const cached = await loadCase(workspace, given.id);
  if (cached === null) throw new ToolError('not-found', `test case ${given.id} is not cached; fetch it with ado.fetch first`, { testCaseId: given.id });
  return cached;
};

const FLOW_NAME = /^[A-Za-z0-9._-]{1,80}$/;

/** A recorded flow from .tesseract/flows/<name>.json, parsed with the contract's recording schema. */
export const loadRecording = async (workspace: Workspace, name: string): Promise<FlowRecording> => {
  if (!FLOW_NAME.test(name)) throw new ToolError('invalid-input', `invalid flow name: ${JSON.stringify(name)}`);
  const file = path.join(workspace.paths.recordings, `${name}.json`);
  const raw = await readJson<unknown>(file).catch((error: Error) => {
    throw new ToolError('malformed-response', `.tesseract/flows/${name}.json is not valid JSON (${error.message})`);
  });
  if (raw === null) throw new ToolError('not-found', `no recorded flow ${name}; record it with flow.record first`, { flow: name });
  const parsed = FlowRecordingSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ToolError('malformed-response', `.tesseract/flows/${name}.json is not a flow recording (${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'})`);
  }
  return parsed.data;
};

const defaultProfile = async (workspace: Workspace, env: NodeJS.ProcessEnv): Promise<Profile | null> => {
  try {
    return await loadProfile(workspace, undefined, env);
  } catch {
    return null;
  }
};

export const testHandlers: Pick<ToolHandlers, 'test.emit' | 'test.run'> = {
  'test.emit': async (input, ctx) => {
    const { workspace } = ctx;
    const dryRun = input.dryRun === true;
    const testCase = await resolveTestCase(workspace, input.testCase);
    validateSteps(testCase, input.steps);

    const handoffs: Handoff[] = [];
    for (const step of input.steps) {
      if (step.handoffId !== undefined) handoffs.push(await findHandoff(workspace, step.handoffId, { testCaseId: testCase.id, stepIndex: step.index }));
    }
    const flowUses: FlowUse[] = await Promise.all(
      (input.flows ?? []).map(async (flow) => ({ recording: await loadRecording(workspace, flow.name), ...(flow.params !== undefined ? { params: flow.params } : {}) })),
    );

    const profile = await defaultProfile(workspace, ctx.env);
    const normalized = await normalizeSteps(
      {
        workspace,
        testCase,
        session: ctx.session,
        now: ctx.now,
        dryRun,
        ...(input.decision?.host?.model !== undefined ? { model: input.decision.host.model } : {}),
        ...(profile !== null ? { baseURL: profile.baseURL } : {}),
      },
      input.steps,
    );
    const screens = screensUsed(normalized.steps, flowUses.map((use) => use.recording));
    const catalogs = await loadEmitCatalogs(workspace, screens, normalized.planned, ctx.now);

    const result = await emitTest(
      workspace,
      {
        testCase,
        steps: normalized.steps,
        catalogs,
        handoffs,
        flows: flowUses,
        ...(input.area !== undefined ? { area: input.area } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      },
      { dryRun, ...(input.force === true ? { force: true } : {}) },
    );

    const facets = [...new Set([...result.spec.facetsUsed, ...result.flowFiles.flatMap((flow) => flow.facetsUsed)])];
    if (!dryRun) {
      await appendEmitRecord(workspace, {
        at: ctx.now().toISOString(),
        testCaseId: testCase.id,
        revision: testCase.revision,
        contentHash: testCase.contentHash,
        specPath: result.spec.path,
        testTitle: `ADO ${testCase.id} — ${adoText(testCase.title)}`,
        steps: result.spec.stepFacets.map((step) => ({ index: step.index, stepIdentifier: step.stepIdentifier, title: step.title, facets: [...step.facets] })),
        facets,
        pageObjects: result.pageObjects.map((page) => page.path),
        flows: [...result.spec.flows],
        session: ctx.session,
      });
    }

    return {
      specPath: result.spec.path,
      pageObjectPaths: result.pageObjects.map((page) => page.path),
      flowPaths: result.flowFiles.map((flow) => flow.path),
      facetsMinted: [...normalized.minted],
      facetsUsed: [...result.spec.facetsUsed],
      diff: result.diff,
      written: result.written.length > 0,
      orphaned: result.orphaned.map((entry) => ({ path: entry.path, keys: [...entry.keys] })),
    };
  },

  'test.run': async (input, ctx) => {
    const { workspace } = ctx;
    const profileName = input.profile ?? (ctx.env.TESSERACT_PROFILE !== undefined && ctx.env.TESSERACT_PROFILE.length > 0 ? ctx.env.TESSERACT_PROFILE : undefined);
    const profile = await loadProfile(workspace, profileName, ctx.env);
    const result = await runSpecs(workspace, {
      ...(input.specPaths !== undefined ? { specPaths: input.specPaths } : {}),
      ...(input.grep !== undefined ? { grep: input.grep } : {}),
      profile,
      ...(profileName !== undefined ? { profileName } : {}),
      env: ctx.env,
      ...(input.headed !== undefined ? { headed: input.headed } : {}),
      ...(input.retries !== undefined ? { retries: input.retries } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.pauseOnFailure !== undefined ? { pauseOnFailure: input.pauseOnFailure } : {}),
      ...(input.updateMemory !== undefined ? { updateMemory: input.updateMemory } : {}),
      now: ctx.now,
      log: ctx.log,
    });
    return {
      runId: result.runId,
      receipts: [...result.receipts],
      summary: result.summary,
      ...(result.reportPath !== undefined ? { reportPath: result.reportPath } : {}),
      ...(result.paused !== undefined ? { paused: result.paused } : {}),
      promoted: [...result.promoted],
      staled: [...result.staled],
    };
  },
};
