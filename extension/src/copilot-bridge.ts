/**
 * Copilot Chat Bridge — registers the @tesseract Copilot Chat participant.
 *
 * Routes natural-language chat messages to the pure domain handlers in
 * lib/infrastructure/vscode/copilot-participant.ts. The bridge parses
 * slash commands (/inbox, /approve, /rerun, /hotspots) and maps them
 * to CopilotRequest values.
 *
 * When Copilot Chat is not available, the bridge silently skips registration.
 */

import * as vscode from 'vscode';
import { dispatchCopilotRequest } from '../../lib/infrastructure/vscode/copilot-participant';
import type { CopilotRequest, CopilotResponse } from '../../lib/infrastructure/vscode/types';
import type { ArtifactSnapshot } from './artifact-loader';

const PARTICIPANT_ID = 'tesseract.participant';

function parseCommand(command: string, prompt: string): CopilotRequest {
  switch (command) {
    case 'inbox':
      return { action: 'query', payload: {} };

    case 'approve': {
      const proposalId = prompt.trim();
      return { action: 'approve', payload: { proposalId } };
    }

    case 'rerun': {
      const adoId = prompt.trim();
      return { action: 'rerun', payload: { adoId } };
    }

    case 'hotspots':
      return { action: 'query', payload: { filter: { status: 'actionable' } } };

    default:
      // Free-form query — try to infer intent from prompt
      return inferFromPrompt(prompt);
  }
}

function inferFromPrompt(prompt: string): CopilotRequest {
  const lower = prompt.toLowerCase();

  if (lower.includes('approve') || lower.includes('proposal')) {
    // Try to extract a proposal ID (pattern: WI:NNNNN or similar)
    const idMatch = prompt.match(/(?:WI:|proposal\s+)(\S+)/i);
    if (idMatch) {
      return { action: 'approve', payload: { proposalId: idMatch[1]! } };
    }
  }

  if (lower.includes('rerun') || lower.includes('re-run')) {
    const idMatch = prompt.match(/(?:WI:|ado\s+|scenario\s+)(\S+)/i);
    if (idMatch) {
      return { action: 'rerun', payload: { adoId: idMatch[1]! } };
    }
  }

  // Default: show inbox
  return { action: 'query', payload: {} };
}

function formatResponse(response: CopilotResponse): string {
  const parts = [response.message];

  if (response.artifacts.length > 0) {
    parts.push('');
    parts.push('**Artifacts:**');
    for (const artifact of response.artifacts) {
      parts.push(`- \`${artifact.path}\` (${artifact.kind}): ${artifact.label}`);
    }
  }

  return parts.join('\n');
}

export class TesseractCopilotBridge {
  private snapshot: ArtifactSnapshot = { inbox: [], proposals: [] };
  private disposable: vscode.Disposable | undefined;

  /**
   * Try to register the Copilot Chat participant.
   * Returns silently if the Chat API is not available.
   */
  register(context: vscode.ExtensionContext): void {
    try {
      const participant = vscode.chat.createChatParticipant(
        PARTICIPANT_ID,
        this.handleRequest.bind(this),
      );
      participant.iconPath = new vscode.ThemeIcon('beaker');
      this.disposable = participant;
      context.subscriptions.push(participant);
    } catch {
      // Copilot Chat not available — degrade silently
    }
  }

  update(snapshot: ArtifactSnapshot): void {
    this.snapshot = snapshot;
  }

  private async handleRequest(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const command = request.command ?? '';
    const domainRequest = parseCommand(command, request.prompt);

    const response = dispatchCopilotRequest(domainRequest, {
      inbox: [...this.snapshot.inbox],
      proposals: [...this.snapshot.proposals],
    });

    stream.markdown(formatResponse(response));

    // If the response suggests a command, offer a follow-up
    if (response.success && response.action === 'approve') {
      stream.button({
        command: 'tesseract.approve',
        title: 'Apply Proposal',
        arguments: [domainRequest.payload.proposalId],
      });
    }

    if (response.success && response.action === 'rerun') {
      stream.button({
        command: 'tesseract.rerun',
        title: 'Run Rerun Plan',
        arguments: [domainRequest.payload.adoId],
      });
    }
  }

  dispose(): void {
    this.disposable?.dispose();
  }
}
