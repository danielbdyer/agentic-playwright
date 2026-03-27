/**
 * useEventDispatch — composable dispatch router factory.
 *
 * Composes multiple dispatch tables into a single O(1) lookup.
 * Replaces the monolithic if (!dispatchRef.current) pattern
 * with layered, independently testable dispatch tables.
 *
 * Complexity: O(k) one-time merge where k = total handler count across tables.
 * O(1) per-message dispatch via Record lookup.
 */

import { useRef, useCallback, useMemo } from 'react';

export type EventHandler = (data: unknown) => void;
export type DispatchTable = Readonly<Record<string, EventHandler>>;

export function useEventDispatch(...tables: readonly DispatchTable[]) {
  const mergedRef = useRef<DispatchTable | null>(null);

  const merged = useMemo(() => {
    const result: Record<string, EventHandler> = {};
    for (const table of tables) {
      for (const key of Object.keys(table)) {
        result[key] = table[key]!;
      }
    }
    return result as DispatchTable;
  }, tables); // eslint-disable-line react-hooks/exhaustive-deps — intentional identity deps

  mergedRef.current = merged;

  const dispatch = useCallback((type: string, data: unknown) => {
    mergedRef.current?.[type]?.(data);
  }, []);

  return { dispatch, table: merged } as const;
}
