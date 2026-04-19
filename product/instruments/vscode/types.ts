/**
 * VSCode-compatible type definitions for the Tesseract integration layer.
 *
 * These are domain-side value types that mirror the VSCode extension API
 * shapes without depending on the `vscode` module. The actual extension
 * registration package maps these 1:1 to the real API.
 */

// ─── Task Types ───

export type VSCodeTaskGroup = 'build' | 'test' | 'clean' | 'none';
export type VSCodeTaskScope = 'workspace' | 'global';

export interface VSCodeTaskDefinition {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface VSCodeTask {
  readonly name: string;
  readonly detail: string;
  readonly group: VSCodeTaskGroup;
  readonly scope: VSCodeTaskScope;
  readonly definition: VSCodeTaskDefinition;
  readonly command: string;
  readonly args: readonly string[];
  readonly problemMatcher: string;
  readonly source: string;
}

// ─── Diagnostic Types ───

export type VSCodeDiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

export interface VSCodePosition {
  readonly line: number;
  readonly character: number;
}

export interface VSCodeRange {
  readonly start: VSCodePosition;
  readonly end: VSCodePosition;
}

export interface VSCodeDiagnostic {
  readonly message: string;
  readonly severity: VSCodeDiagnosticSeverity;
  readonly range: VSCodeRange;
  readonly source: string;
  readonly code: string;
  readonly relatedInformation: readonly VSCodeRelatedInformation[];
}

export interface VSCodeRelatedInformation {
  readonly message: string;
  readonly location: VSCodeLocation;
}

export interface VSCodeLocation {
  readonly uri: string;
  readonly range: VSCodeRange;
}

// ─── Copilot Participant Types ───

export type CopilotParticipantAction = 'query' | 'approve' | 'rerun';

export interface CopilotRequest {
  readonly action: CopilotParticipantAction;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface CopilotResponse {
  readonly action: CopilotParticipantAction;
  readonly success: boolean;
  readonly message: string;
  readonly artifacts: readonly CopilotArtifactRef[];
}

export interface CopilotArtifactRef {
  readonly kind: string;
  readonly path: string;
  readonly label: string;
}
