/** ConnectionDot — WebSocket connection status indicator. Pure atom. */
import { memo } from 'react';

interface ConnectionDotProps { readonly connected: boolean }

export const ConnectionDot = memo(function ConnectionDot({ connected }: ConnectionDotProps) {
  return <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} aria-label={connected ? 'Connected' : 'Disconnected'} role="status" />;
});
