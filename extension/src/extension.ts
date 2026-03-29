/**
 * Tesseract VSCode Extension — entry point.
 *
 * This extension bridges the Tesseract QA pipeline's artifact surface
 * to the VSCode UI. It reads .tesseract/ artifacts produced by the CLI,
 * maps them through pure domain transformations, and projects them as:
 *
 * - Tasks (inbox items → VSCode task provider)
 * - Diagnostics (proposal bundles → VSCode problem matcher)
 * - Copilot Chat (natural language → query/approve/rerun handlers)
 * - Commands (tesseract.refresh, tesseract.approve, tesseract.rerun)
 *
 * The extension introduces no new domain concepts. All business logic
 * lives in lib/infrastructure/vscode/ as pure functions.
 */

import * as vscode from 'vscode';
import { loadArtifacts } from './artifact-loader';
import { TesseractTaskProvider } from './task-bridge';
import { TesseractDiagnosticBridge } from './diagnostic-bridge';
import { TesseractCopilotBridge } from './copilot-bridge';

let taskProvider: TesseractTaskProvider;
let diagnosticBridge: TesseractDiagnosticBridge;
let copilotBridge: TesseractCopilotBridge;

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function refresh(): void {
  const rootDir = getWorkspaceRoot();
  if (!rootDir) return;

  const snapshot = loadArtifacts(rootDir);
  taskProvider.update(snapshot);
  diagnosticBridge.update(snapshot);
  copilotBridge.update(snapshot);
}

export function activate(context: vscode.ExtensionContext): void {
  // Initialize bridges
  taskProvider = new TesseractTaskProvider();
  diagnosticBridge = new TesseractDiagnosticBridge();
  copilotBridge = new TesseractCopilotBridge();

  // Register task provider
  const taskDisposable = vscode.tasks.registerTaskProvider('tesseract', taskProvider);
  context.subscriptions.push(taskDisposable);

  // Register diagnostics
  context.subscriptions.push(diagnosticBridge);

  // Register Copilot Chat participant (graceful degradation if unavailable)
  copilotBridge.register(context);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('tesseract.refresh', () => {
      refresh();
      vscode.window.showInformationMessage('Tesseract: Inbox and diagnostics refreshed.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tesseract.approve', async (proposalId?: string) => {
      const rootDir = getWorkspaceRoot();
      if (!rootDir) return;

      if (!proposalId) {
        proposalId = await vscode.window.showInputBox({
          prompt: 'Enter proposal ID to approve',
          placeHolder: 'e.g., WI:10001-step-3',
        });
      }
      if (!proposalId) return;

      const terminal = vscode.window.createTerminal('Tesseract Approve');
      terminal.show();
      terminal.sendText(`npm run approve -- --proposal-id=${proposalId}`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tesseract.rerun', async (adoId?: string) => {
      const rootDir = getWorkspaceRoot();
      if (!rootDir) return;

      if (!adoId) {
        adoId = await vscode.window.showInputBox({
          prompt: 'Enter ADO ID to rerun',
          placeHolder: 'e.g., 10001',
        });
      }
      if (!adoId) return;

      const terminal = vscode.window.createTerminal('Tesseract Rerun');
      terminal.show();
      terminal.sendText(`npm run rerun-plan -- --ado-id=${adoId}`);
    }),
  );

  // Watch .tesseract/ for changes and auto-refresh
  const rootDir = getWorkspaceRoot();
  if (rootDir) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(rootDir, '.tesseract/**/*.json'),
    );
    watcher.onDidChange(() => refresh());
    watcher.onDidCreate(() => refresh());
    watcher.onDidDelete(() => refresh());
    context.subscriptions.push(watcher);

    // Also watch generated/ for proposal changes
    const generatedWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(rootDir, 'generated/**/*.proposals.json'),
    );
    generatedWatcher.onDidChange(() => refresh());
    generatedWatcher.onDidCreate(() => refresh());
    generatedWatcher.onDidDelete(() => refresh());
    context.subscriptions.push(generatedWatcher);

    // Initial load
    refresh();
  }
}

export function deactivate(): void {
  diagnosticBridge?.dispose();
  copilotBridge?.dispose();
}
