/**
 * Public-AUT cohort intervention store.
 *
 * The file-mediated layer that closes the spike's intervention
 * loop. Three artifact kinds, written/read at three filesystem
 * paths beneath workshop/customer-backlog/public-aut/:
 *
 *   handoffs/<aut>/<adoId>-step<N>-<runStamp>.handoff.json
 *     Runtime queue of stuck-step records emitted by the runner
 *     on not-found / wrong-target / no-target-name / unclassified.
 *     Gitignored — accumulates per run; consumed by `cohort-resolve`.
 *
 *   proposals/<aut>/<adoId>-step<N>-<proposeStamp>.proposal.json
 *     Operator (or agent) decisions on how to resolve a stuck step.
 *     Committed for audit. Multiple proposals per case+step are
 *     allowed; latest wins on read.
 *
 *   canon/<aut>/<adoId>-step<N>.canon.json
 *     Approved, durable knowledge. The runner consults canon
 *     BEFORE classifying. At most one canon entry per case+step;
 *     re-approving overwrites. Committed — this is the cohort's
 *     earned-knowledge surface.
 *
 * Pure module — no Effect imports, no side effects beyond
 * fs.read/write. Cycle 10 of the cold-start cohort spike (see
 * journal Entry 38).
 */

import * as fs from 'fs';
import * as path from 'path';

const COHORT_ROOT_RELATIVE = 'workshop/customer-backlog/public-aut';

export interface CanonResolution {
  /** Today only 'role-name' is supported; future kinds (CSS,
   *  XPath, accessibility-snapshot path) extend this union. */
  readonly kind: 'role-name';
  readonly role: string;
  readonly name: string;
}

export interface HandoffRecord {
  readonly handoffId: string;
  readonly aut: string;
  readonly adoId: string;
  readonly stepIndex: number;
  readonly actionText: string;
  readonly domResolution: string;
  readonly classifierVerb: string | null;
  readonly classifierRole: string | null;
  readonly classifierNameSubstring: string | null;
  readonly rationale: string;
  readonly autUrl: string;
  readonly createdAt: string;
}

export interface ProposalRecord {
  readonly proposalId: string;
  readonly fromHandoffId: string | null;
  readonly aut: string;
  readonly adoId: string;
  readonly stepIndex: number;
  readonly resolution: CanonResolution;
  readonly proposedAt: string;
  readonly proposedBy: string;
  readonly rationale: string;
  readonly status: 'pending' | 'approved';
}

export interface CanonRecord {
  readonly canonId: string;
  readonly aut: string;
  readonly adoId: string;
  readonly stepIndex: number;
  readonly resolution: CanonResolution;
  readonly approvedAt: string;
  readonly approvedBy: string;
  readonly approvedFromProposalId: string | null;
  readonly rationale: string;
}

function handoffsDir(rootDir: string, aut: string): string {
  return path.join(rootDir, COHORT_ROOT_RELATIVE, 'handoffs', aut);
}

function proposalsDir(rootDir: string, aut: string): string {
  return path.join(rootDir, COHORT_ROOT_RELATIVE, 'proposals', aut);
}

function canonDir(rootDir: string, aut: string): string {
  return path.join(rootDir, COHORT_ROOT_RELATIVE, 'canon', aut);
}

function safeStamp(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

function canonFilename(adoId: string, stepIndex: number): string {
  return `${adoId}-step${stepIndex}.canon.json`;
}

export function buildHandoffId(aut: string, adoId: string, stepIndex: number, runStartedAt: string): string {
  return `h-${aut}-${adoId}-step${stepIndex}-${safeStamp(runStartedAt)}`;
}

export function buildProposalId(aut: string, adoId: string, stepIndex: number, proposedAt: string): string {
  return `p-${aut}-${adoId}-step${stepIndex}-${safeStamp(proposedAt)}`;
}

export function buildCanonId(aut: string, adoId: string, stepIndex: number): string {
  return `c-${aut}-${adoId}-step${stepIndex}`;
}

export function writeHandoff(rootDir: string, record: HandoffRecord): string {
  const dir = handoffsDir(rootDir, record.aut);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${record.adoId}-step${record.stepIndex}-${safeStamp(record.createdAt)}.handoff.json`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, JSON.stringify(record, null, 2));
  return fullPath;
}

export function readHandoff(rootDir: string, aut: string, handoffId: string): HandoffRecord | null {
  const dir = handoffsDir(rootDir, aut);
  if (!fs.existsSync(dir)) return null;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.handoff.json')) continue;
    const fullPath = path.join(dir, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const record = JSON.parse(raw) as HandoffRecord;
    if (record.handoffId === handoffId) return record;
  }
  return null;
}

export function listPendingHandoffs(rootDir: string, aut?: string): readonly HandoffRecord[] {
  const result: HandoffRecord[] = [];
  const collectFromAut = (autName: string) => {
    const dir = handoffsDir(rootDir, autName);
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.handoff.json')) continue;
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      result.push(JSON.parse(raw) as HandoffRecord);
    }
  };
  if (aut) {
    collectFromAut(aut);
  } else {
    const handoffsRoot = path.join(rootDir, COHORT_ROOT_RELATIVE, 'handoffs');
    if (!fs.existsSync(handoffsRoot)) return result;
    for (const subdir of fs.readdirSync(handoffsRoot)) {
      collectFromAut(subdir);
    }
  }
  return result;
}

export function writeProposal(rootDir: string, record: ProposalRecord): string {
  const dir = proposalsDir(rootDir, record.aut);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${record.adoId}-step${record.stepIndex}-${safeStamp(record.proposedAt)}.proposal.json`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, JSON.stringify(record, null, 2));
  return fullPath;
}

export function readProposal(rootDir: string, aut: string, proposalId: string): ProposalRecord | null {
  const dir = proposalsDir(rootDir, aut);
  if (!fs.existsSync(dir)) return null;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.proposal.json')) continue;
    const fullPath = path.join(dir, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const record = JSON.parse(raw) as ProposalRecord;
    if (record.proposalId === proposalId) return record;
  }
  return null;
}

export function listProposals(rootDir: string, aut?: string): readonly ProposalRecord[] {
  const result: ProposalRecord[] = [];
  const collectFromAut = (autName: string) => {
    const dir = proposalsDir(rootDir, autName);
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.proposal.json')) continue;
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      result.push(JSON.parse(raw) as ProposalRecord);
    }
  };
  if (aut) {
    collectFromAut(aut);
  } else {
    const proposalsRoot = path.join(rootDir, COHORT_ROOT_RELATIVE, 'proposals');
    if (!fs.existsSync(proposalsRoot)) return result;
    for (const subdir of fs.readdirSync(proposalsRoot)) {
      collectFromAut(subdir);
    }
  }
  return result;
}

export function writeCanon(rootDir: string, record: CanonRecord): string {
  const dir = canonDir(rootDir, record.aut);
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(dir, canonFilename(record.adoId, record.stepIndex));
  fs.writeFileSync(fullPath, JSON.stringify(record, null, 2));
  return fullPath;
}

export function readCanonForStep(
  rootDir: string,
  aut: string,
  adoId: string,
  stepIndex: number,
): CanonRecord | null {
  const fullPath = path.join(canonDir(rootDir, aut), canonFilename(adoId, stepIndex));
  if (!fs.existsSync(fullPath)) return null;
  const raw = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(raw) as CanonRecord;
}

export function listCanon(rootDir: string, aut?: string): readonly CanonRecord[] {
  const result: CanonRecord[] = [];
  const collectFromAut = (autName: string) => {
    const dir = canonDir(rootDir, autName);
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.canon.json')) continue;
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      result.push(JSON.parse(raw) as CanonRecord);
    }
  };
  if (aut) {
    collectFromAut(aut);
  } else {
    const canonRoot = path.join(rootDir, COHORT_ROOT_RELATIVE, 'canon');
    if (!fs.existsSync(canonRoot)) return result;
    for (const subdir of fs.readdirSync(canonRoot)) {
      collectFromAut(subdir);
    }
  }
  return result;
}
