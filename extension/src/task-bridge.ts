/**
 * Task Bridge — maps domain task-provider output to real VSCode tasks.
 *
 * The pure domain layer (lib/infrastructure/vscode/task-provider.ts) produces
 * VSCodeTask value objects. This bridge registers a real vscode.TaskProvider
 * and maps those values to vscode.Task instances.
 */

import * as vscode from 'vscode';
import { createTaskProvider } from '../../lib/infrastructure/vscode/task-provider';
import type { VSCodeTask, VSCodeTaskGroup } from '../../lib/infrastructure/vscode/types';
import type { ArtifactSnapshot } from './artifact-loader';

const GROUP_MAP: Readonly<Record<VSCodeTaskGroup, vscode.TaskGroup | undefined>> = {
  build: vscode.TaskGroup.Build,
  test: vscode.TaskGroup.Test,
  clean: vscode.TaskGroup.Clean,
  none: undefined,
};

function toVscodeTask(task: VSCodeTask, workspaceFolder: vscode.WorkspaceFolder): vscode.Task {
  const { type: _type, ...rest } = task.definition;
  const definition: vscode.TaskDefinition = {
    type: task.definition.type,
    ...rest,
  };

  const shellExec = new vscode.ShellExecution(task.command, task.args as string[]);
  const vscTask = new vscode.Task(
    definition,
    workspaceFolder,
    task.name,
    task.source,
    shellExec,
    task.problemMatcher,
  );
  vscTask.detail = task.detail;
  vscTask.group = GROUP_MAP[task.group];

  return vscTask;
}

export class TesseractTaskProvider implements vscode.TaskProvider {
  private snapshot: ArtifactSnapshot = { inbox: [], proposals: [] };

  update(snapshot: ArtifactSnapshot): void {
    this.snapshot = snapshot;
  }

  provideTasks(): vscode.Task[] {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return [];

    const domainTasks = createTaskProvider(this.snapshot.inbox);
    return domainTasks.map((t) => toVscodeTask(t, folders[0]!));
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    // VSCode calls this for tasks from tasks.json that match our type.
    // We don't need to resolve externally-defined tasks.
    return task.definition.type === 'tesseract' ? task : undefined;
  }
}
