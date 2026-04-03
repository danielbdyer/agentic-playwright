import { useQuery } from '@tanstack/react-query';
import type { ScreenGroupContext } from '../../../lib/domain/types/workbench';
import type {
  ConfidenceCrossedEvent,
  ElementEscalatedEvent,
  InboxItemEvent,
} from '../spatial/types';
import type {
  DashboardConnectionState,
  DashboardErrorState,
} from '../types';

const useCachedProjection = <T,>(
  queryKey: readonly [string],
  initialData: T,
) => useQuery<T>({
  queryKey,
  queryFn: async () => initialData,
  initialData,
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
  retry: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
  refetchOnWindowFocus: false,
});

export function useDashboardObservations() {
  const { data: currentScreenGroup } = useCachedProjection<ScreenGroupContext | null>(
    ['screen-group-start'],
    null,
  );
  const { data: inboxItems } = useCachedProjection<readonly InboxItemEvent[]>(
    ['inbox-items'],
    [],
  );
  const { data: confidenceCrossings } = useCachedProjection<readonly ConfidenceCrossedEvent[]>(
    ['confidence-crossings'],
    [],
  );
  const { data: escalations } = useCachedProjection<readonly ElementEscalatedEvent[]>(
    ['element-escalations'],
    [],
  );
  const { data: connection } = useCachedProjection<DashboardConnectionState>(
    ['dashboard-connection'],
    { connected: false },
  );
  const { data: error } = useCachedProjection<DashboardErrorState | null>(
    ['dashboard-error'],
    null,
  );

  return {
    currentScreenGroup: currentScreenGroup ?? null,
    inboxItems: inboxItems ?? [],
    confidenceCrossings: confidenceCrossings ?? [],
    escalations: escalations ?? [],
    connection: connection ?? { connected: false },
    error: error ?? null,
  } as const;
}
