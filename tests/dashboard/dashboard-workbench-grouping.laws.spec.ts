import { expect, test } from '@playwright/test';
import { groupWorkItemsByScreen } from '../../dashboard/src/projections/workbench/group-work-items-by-screen';

interface WorkItemFixture {
  readonly id: string;
  readonly priority: number;
  readonly context: {
    readonly screen?: string;
  };
}

test('groupWorkItemsByScreen groups items by screen and orders screens by top priority', () => {
  const items: readonly WorkItemFixture[] = [
    { id: 'item-a', priority: 0.22, context: { screen: 'claims' } },
    { id: 'item-b', priority: 0.91, context: { screen: 'policy-search' } },
    { id: 'item-c', priority: 0.67, context: { screen: 'claims' } },
    { id: 'item-d', priority: 0.51, context: { screen: 'billing' } },
  ];

  const grouped = groupWorkItemsByScreen(items);

  expect(grouped.map((group) => group.screen)).toEqual([
    'policy-search',
    'claims',
    'billing',
  ]);
  expect(grouped.map((group) => group.count)).toEqual([1, 2, 1]);
  expect(grouped[1]?.items.map((item) => item.id)).toEqual(['item-c', 'item-a']);
});

test('groupWorkItemsByScreen falls back to unknown when the screen is absent', () => {
  const grouped = groupWorkItemsByScreen([
    { id: 'item-a', priority: 0.4, context: {} },
    { id: 'item-b', priority: 0.8, context: { screen: 'claims' } },
  ]);

  expect(grouped.map((group) => group.screen)).toEqual(['claims', 'unknown']);
  expect(grouped[1]?.items[0]?.id).toBe('item-a');
});
