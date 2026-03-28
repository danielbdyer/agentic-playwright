/**
 * Task Provider — maps Tesseract inbox items to VSCode task format.
 *
 * Pure transformation: OperatorInboxItem[] → VSCodeTask[].
 * No side effects, no VSCode API dependency.
 */

import type { OperatorInboxItem } from '../../domain/types/resolution';
import type { VSCodeTask, VSCodeTaskGroup } from './types';

// ─── Inbox Status → Task Group ───

const STATUS_TO_GROUP: Readonly<Record<string, VSCodeTaskGroup>> = {
  actionable: 'test',
  approved: 'build',
  blocked: 'none',
  informational: 'none',
};

// ─── Inbox Kind → CLI Command ───

const KIND_TO_COMMAND: Readonly<Record<string, string>> = {
  'needs-human': 'npm run inbox',
  'degraded-locator': 'npm run surface',
  proposal: 'npm run approve',
  'certification-required': 'npm run workflow',
  'rerun-available': 'npm run rerun-plan',
  'improvement-available': 'npm run run',
};

const DEFAULT_COMMAND = 'npm run inbox';

function inboxItemToCommand(item: OperatorInboxItem): string {
  return KIND_TO_COMMAND[item.kind] ?? DEFAULT_COMMAND;
}

function inboxItemToArgs(item: OperatorInboxItem): readonly string[] {
  const base: readonly string[] = item.adoId ? ['--', `--ado-id=${item.adoId}`] : [];
  return item.proposalId
    ? [...base, `--proposal-id=${item.proposalId}`]
    : base;
}

function inboxItemToGroup(item: OperatorInboxItem): VSCodeTaskGroup {
  return STATUS_TO_GROUP[item.status] ?? 'none';
}

function inboxItemToDetail(item: OperatorInboxItem): string {
  const parts: readonly string[] = [
    item.summary,
    ...(item.adoId ? [`ADO: ${item.adoId}`] : []),
    ...(item.artifactPath ? [`Path: ${item.artifactPath}`] : []),
  ];
  return parts.join(' | ');
}

// ─── Public API ───

/**
 * Map a single inbox item to a VSCode task definition.
 * Pure function — no side effects.
 */
export function createTaskFromInboxItem(item: OperatorInboxItem): VSCodeTask {
  return {
    name: `tesseract: ${item.title}`,
    detail: inboxItemToDetail(item),
    group: inboxItemToGroup(item),
    scope: 'workspace',
    definition: {
      type: 'tesseract',
      inboxItemId: item.id,
      kind: item.kind,
      status: item.status,
    },
    command: inboxItemToCommand(item),
    args: inboxItemToArgs(item),
    problemMatcher: '$tesseract',
    source: 'tesseract',
  };
}

/**
 * Map a readonly array of inbox items to VSCode tasks.
 * Pure function — no side effects, deterministic output order.
 */
export function createTaskProvider(
  inbox: readonly OperatorInboxItem[],
): readonly VSCodeTask[] {
  return inbox.map(createTaskFromInboxItem);
}
