interface ScreenScopedItem {
  readonly priority: number;
  readonly context: {
    readonly screen?: string | undefined;
  };
}

export interface ScreenWorkItemGroup<TItem extends ScreenScopedItem> {
  readonly screen: string;
  readonly items: readonly TItem[];
  readonly count: number;
  readonly topPriority: number;
}

const comparePriorityDesc = <TItem extends ScreenScopedItem>(
  left: TItem,
  right: TItem,
): number => right.priority - left.priority;

export const groupWorkItemsByScreen = <TItem extends ScreenScopedItem>(
  items: readonly TItem[],
): readonly ScreenWorkItemGroup<TItem>[] => {
  const grouped = items.reduce<Readonly<Record<string, readonly TItem[]>>>(
    (acc, item) => {
      const screen = item.context.screen ?? 'unknown';
      return {
        ...acc,
        [screen]: [...(acc[screen] ?? []), item].sort(comparePriorityDesc),
      };
    },
    {},
  );

  return Object.entries(grouped)
    .map(([screen, groupedItems]) => ({
      screen,
      items: groupedItems,
      count: groupedItems.length,
      topPriority: groupedItems[0]?.priority ?? 0,
    }))
    .sort((left, right) =>
      right.topPriority - left.topPriority || left.screen.localeCompare(right.screen),
    );
};
