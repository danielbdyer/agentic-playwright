/**
 * The evidence log: `.tesseract/evidence/<screen>.jsonl`, append-only. Every
 * fact memory knows about a facet (minted, enriched, resolved, run, accepted,
 * status changed) is a line here; health and promotion are folds over it.
 * Nothing in this module rewrites the file: appends are one `appendFile` per
 * batch, so a batch lands as one write, and readers skip lines they cannot
 * parse (a merge or a newer version can leave some) and say how many.
 *
 * Recommended `.gitattributes` for teams that branch:
 *   .tesseract/evidence/*.jsonl merge=union
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureDir, readText, relativePosix } from '../core/fsio.js';
import { newId } from '../core/hash.js';
import type { Workspace } from '../workspace/workspace.js';
import { EvidenceEventSchema, type EventBody, type EventFactory, type EvidenceEvent } from './types.js';

export const evidenceFile = (ws: Workspace, screen: string): string => path.join(ws.paths.evidence, `${screen}.jsonl`);

/** `.tesseract/evidence/<screen>.jsonl#<eventId>`, the pointer a facet's `evidence` field carries. */
export const evidencePointer = (ws: Workspace, screen: string, eventId: string): string =>
  `${relativePosix(ws.paths.root, evidenceFile(ws, screen))}#${eventId}`;

/** An event factory over a clock: ids are `ev-<stamp>-<random>`, times are ISO. */
export const eventFactory = (now: () => Date = () => new Date()): EventFactory =>
  (<B extends EventBody>(body: B) => {
    const at = now();
    return { v: 1, eventId: newId('ev', at), at: at.toISOString(), ...body } as unknown as Extract<EvidenceEvent, { kind: B['kind'] }>;
  }) as EventFactory;

/** Append events as JSON lines in one write. Append-only by construction. */
export const appendEvents = async (ws: Workspace, screen: string, events: readonly EvidenceEvent[]): Promise<void> => {
  if (events.length === 0) return;
  const file = evidenceFile(ws, screen);
  await ensureDir(path.dirname(file));
  await fs.appendFile(file, events.map((event) => `${JSON.stringify(event)}\n`).join(''), 'utf8');
};

export interface EvidenceRead {
  readonly events: readonly EvidenceEvent[];
  /** Lines that were not valid JSON or not a known event shape. */
  readonly skipped: number;
}

/** Parse JSONL text into events, skipping (and counting) lines that do not validate. */
export const parseEvidence = (text: string): EvidenceRead => {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  const parsed = lines.map((line): EvidenceEvent | null => {
    try {
      const result = EvidenceEventSchema.safeParse(JSON.parse(line));
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  });
  const events = parsed.filter((event): event is EvidenceEvent => event !== null);
  return { events, skipped: lines.length - events.length };
};

export const readEvents = async (ws: Workspace, screen: string): Promise<EvidenceRead> => {
  const text = await readText(evidenceFile(ws, screen));
  return text === null ? { events: [], skipped: 0 } : parseEvidence(text);
};
