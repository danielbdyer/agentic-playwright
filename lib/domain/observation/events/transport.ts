export const TRANSPORT_EVENT_KINDS = [
  'connected',
  'error',
] as const;

export interface ConnectedPayload {
  readonly sessionId?: string;
}

export interface ErrorPayload {
  readonly message: string;
  readonly code?: string;
}

export interface TransportEventMap {
  readonly connected: ConnectedPayload;
  readonly error: ErrorPayload;
}
