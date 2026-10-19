/**
 * Handoff files: .tesseract/handoffs/<testCaseId>-<stepIndex>.json, one per
 * step that needs a human. The file holds the open handoff; raising another
 * for the same step replaces it and moves the previous one into `history`,
 * so the attempts that led here are never lost. test.emit reads the file to
 * write the test.fixme reason.
 */
import path from 'node:path';
import { z } from 'zod';
import { ToolError } from '../../core/errors.js';
import { listFiles, readJson, writeJson } from '../../core/fsio.js';
import { HandoffSchema, type Handoff } from '../../contract/schemas.js';
import type { Workspace } from '../../workspace/workspace.js';

export const HandoffFileSchema = HandoffSchema.extend({
  history: z.array(HandoffSchema).optional().describe('Earlier handoffs for the same step, oldest first.'),
});

export type HandoffFile = z.infer<typeof HandoffFileSchema>;

const CASE_ID = /^[A-Za-z0-9_-]+$/;

export const assertCaseId = (testCaseId: string): string => {
  if (!CASE_ID.test(testCaseId)) throw new ToolError('invalid-input', `invalid test case id: ${JSON.stringify(testCaseId)}`);
  return testCaseId;
};

/** Absolute path of the handoff file for a step. */
export const handoffPath = (workspace: Workspace, testCaseId: string, stepIndex: number): string =>
  path.join(workspace.paths.handoffs, `${assertCaseId(testCaseId)}-${stepIndex}.json`);

/** Absolute path of the screenshot taken with a handoff. */
export const handoffScreenshotPath = (workspace: Workspace, testCaseId: string, stepIndex: number): string =>
  path.join(workspace.paths.handoffs, `${assertCaseId(testCaseId)}-${stepIndex}.png`);

const parseFile = (value: unknown, file: string): HandoffFile => {
  const parsed = HandoffFileSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ToolError('malformed-response', `${file} is not a handoff (${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'})`, { file });
  }
  return parsed.data;
};

/** The handoff file for a step, or null when none was raised. */
export const readHandoffFile = async (workspace: Workspace, testCaseId: string, stepIndex: number): Promise<HandoffFile | null> => {
  const file = handoffPath(workspace, testCaseId, stepIndex);
  const value = await readJson<unknown>(file).catch((error: Error) => {
    throw new ToolError('malformed-response', `${file} is not valid JSON (${error.message})`, { file });
  });
  return value === null ? null : parseFile(value, file);
};

export const writeHandoffFile = async (workspace: Workspace, handoff: HandoffFile): Promise<string> => {
  const file = handoffPath(workspace, handoff.testCaseId, handoff.stepIndex);
  await writeJson(file, HandoffFileSchema.parse(handoff));
  return file;
};

/** The open handoff without its history: what the contract's Handoff shape carries. */
export const openHandoff = (file: HandoffFile): Handoff => {
  const { history: _history, ...handoff } = file;
  return handoff;
};

const ID = /^h-(.+)-(\d+)-[0-9a-f]{8}$/;

/**
 * The open handoff with this id. Looked up in the step's own file first
 * (the id names the case and step), then in every handoff file. An id that
 * a later handoff for the same step superseded is not-found, naming the
 * current one.
 */
export const findHandoff = async (workspace: Workspace, handoffId: string, hint?: { readonly testCaseId: string; readonly stepIndex: number }): Promise<Handoff> => {
  const parsed = ID.exec(handoffId);
  const located = [
    ...(hint !== undefined ? [hint] : []),
    ...(parsed !== null && CASE_ID.test(parsed[1]!) ? [{ testCaseId: parsed[1]!, stepIndex: Number(parsed[2]) }] : []),
  ];
  const candidates: HandoffFile[] = [];
  for (const where of located) {
    const file = await readHandoffFile(workspace, where.testCaseId, where.stepIndex);
    if (file !== null) candidates.push(file);
  }
  if (candidates.length === 0) {
    for (const file of await listFiles(workspace.paths.handoffs, '.json')) {
      const value = await readJson<unknown>(file).catch(() => null);
      const checked = HandoffFileSchema.safeParse(value);
      if (checked.success) candidates.push(checked.data);
    }
  }
  const current = candidates.find((file) => file.handoffId === handoffId);
  if (current !== undefined) return openHandoff(current);
  const superseded = candidates.find((file) => (file.history ?? []).some((h) => h.handoffId === handoffId));
  if (superseded !== undefined) {
    throw new ToolError('not-found', `handoff ${handoffId} was superseded by ${superseded.handoffId} for step ${superseded.stepIndex}; pass that id`, {
      handoffId,
      current: superseded.handoffId,
    });
  }
  throw new ToolError('not-found', `no handoff ${handoffId} under .tesseract/handoffs/; raise it with handoff.raise first`, { handoffId });
};
