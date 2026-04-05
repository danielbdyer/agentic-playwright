import { expect, test } from '@playwright/test';
import { generateRunId, parseDashboardConfig } from '../../dashboard/server/config';

test.describe('dashboard config parsing', () => {
  test('applies defaults when no flags are set', () => {
    const config = parseDashboardConfig({
      argv: ['node', 'dashboard/server.ts'],
      serverDir: '/workspace/repo/dashboard',
      now: new Date('2026-04-05T08:00:00.000Z'),
    });

    expect(config.port).toBe(3100);
    expect(config.journalEnabled).toBe(false);
    expect(config.speedrun.enabled).toBe(false);
    expect(config.speedrun.count).toBe(50);
    expect(config.speedrun.mode).toBe('playwright');
    expect(config.journalRunId).toBe('run-2026-04-05T08-00-00');
  });

  test('derives journal mode and speedrun settings from CLI flags', () => {
    const config = parseDashboardConfig({
      argv: [
        'node',
        'dashboard/server.ts',
        '--speedrun',
        '--port',
        '4100',
        '--count',
        '9',
        '--seed',
        'alpha-seed',
        '--max-iterations',
        '3',
        '--posture',
        'cold-start',
        '--mode',
        'diagnostic',
        '--run-id',
        'manual-run-1',
      ],
      serverDir: '/workspace/repo/dashboard',
    });

    expect(config.port).toBe(4100);
    expect(config.journalEnabled).toBe(true);
    expect(config.journalRunId).toBe('manual-run-1');
    expect(config.speedrun).toEqual({
      enabled: true,
      count: 9,
      seed: 'alpha-seed',
      maxIterations: 3,
      posture: 'cold-start',
      mode: 'diagnostic',
    });
  });

  test('normalizes invalid numeric and enum arguments to defaults', () => {
    const config = parseDashboardConfig({
      argv: [
        'node',
        'dashboard/server.ts',
        '--port',
        'invalid',
        '--count',
        'nan',
        '--max-iterations',
        'unknown',
        '--posture',
        'experimental',
        '--mode',
        'unknown',
      ],
      serverDir: '/workspace/repo/dashboard',
    });

    expect(config.port).toBe(3100);
    expect(config.speedrun.count).toBe(50);
    expect(config.speedrun.maxIterations).toBe(5);
    expect(config.speedrun.posture).toBe('warm-start');
    expect(config.speedrun.mode).toBe('playwright');
  });

  test('generates stable run id format', () => {
    expect(generateRunId(new Date('2026-04-05T10:09:08.777Z'))).toBe('run-2026-04-05T10-09-08');
  });
});
