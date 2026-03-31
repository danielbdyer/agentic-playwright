import path from 'path';
import type { AdoId } from '../../domain/identity';
import type { ProjectPaths } from './types';
import { resolvePathWithinRoot } from './shared';

export function boundPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.resolution.boundDir, `${adoId}.json`);
}

export function taskPacketPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.resolution.tasksDir, `${adoId}.resolution.json`);
}

export function approvalReceiptPath(paths: ProjectPaths, proposalId: string): string {
  return resolvePathWithinRoot(paths.resolution.approvalsDir, `${proposalId}.approval.json`, 'proposalId');
}

export function rerunPlanPath(paths: ProjectPaths, planId: string): string {
  return resolvePathWithinRoot(paths.governance.inboxDir, `${planId}.rerun-plan.json`, 'planId');
}
