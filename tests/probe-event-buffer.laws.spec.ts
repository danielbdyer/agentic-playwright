import { expect, test } from '@playwright/test';
import {
  createProbeEventBuffer,
  readBufferedProbeEvent,
  writeProbeEventToBuffer,
} from '../dashboard/src/hooks/probe-event-buffer';

test.describe('probe event buffer laws', () => {
  test('probe events round-trip through the browser-local buffer', () => {
    const buffer = createProbeEventBuffer(4);
    expect(buffer).not.toBeNull();

    const event = {
      id: 'probe-1',
      element: 'searchButton',
      screen: 'policy-search',
      strategy: 'role-name',
      boundingBox: { x: 12, y: 18, width: 120, height: 32 },
      locatorRung: 4,
      found: true,
      confidence: 0.83,
      actor: 'system' as const,
      governance: 'approved' as const,
      resolutionMode: 'deterministic' as const,
    };

    writeProbeEventToBuffer(buffer!, event);

    expect(readBufferedProbeEvent(buffer!, 0)).toEqual(event);
  });

  test('wrapped writes keep the latest capacity-sized suffix', () => {
    const buffer = createProbeEventBuffer(2);
    expect(buffer).not.toBeNull();

    const events = [
      {
        id: 'probe-1',
        element: 'first',
        screen: 'policy-search',
        strategy: 'role-name',
        boundingBox: null,
        locatorRung: 1,
        found: true,
        confidence: 0.1,
        actor: 'system' as const,
        governance: 'approved' as const,
        resolutionMode: 'deterministic' as const,
      },
      {
        id: 'probe-2',
        element: 'second',
        screen: 'policy-search',
        strategy: 'test-id',
        boundingBox: null,
        locatorRung: 2,
        found: false,
        confidence: 0.2,
        actor: 'agent' as const,
        governance: 'review-required' as const,
        resolutionMode: 'translation' as const,
      },
      {
        id: 'probe-3',
        element: 'third',
        screen: 'policy-search',
        strategy: 'css',
        boundingBox: { x: 1, y: 2, width: 3, height: 4 },
        locatorRung: 3,
        found: true,
        confidence: 0.3,
        actor: 'operator' as const,
        governance: 'blocked' as const,
        resolutionMode: 'agentic' as const,
      },
    ] as const;

    events.forEach((event) => writeProbeEventToBuffer(buffer!, event));

    expect(readBufferedProbeEvent(buffer!, 1)).toEqual(events[1]);
    expect(readBufferedProbeEvent(buffer!, 2)).toEqual(events[2]);
  });
});
