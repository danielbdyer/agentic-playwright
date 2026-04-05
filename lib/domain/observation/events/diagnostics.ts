export const DIAGNOSTICS_EVENT_KINDS = [
  'diagnostics',
  'learning-signals',
  'browser-pool-health',
  'proposal-quarantined',
] as const;

export interface DiagnosticsPayload {
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface DiagnosticsEventMap {
  readonly diagnostics: DiagnosticsPayload;
  readonly 'learning-signals': Record<string, unknown>;
  readonly 'browser-pool-health': Record<string, unknown>;
  readonly 'proposal-quarantined': Record<string, unknown>;
}
