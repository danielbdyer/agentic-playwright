import type { Locator } from '@playwright/test';
import type { WidgetInteractionContext } from '../../domain/knowledge/widget-types';
import { osButtonHandlers } from './os-button';
import { osInputHandlers } from './os-input';
import { osTableHandlers } from './os-table';

export type WidgetActionHandler = (
  locator: Locator,
  value?: string,
  context?: WidgetInteractionContext,
) => Promise<unknown>;

export type WidgetHandlerRegistry = Record<string, Record<string, WidgetActionHandler>>;

export const widgetActionHandlers: WidgetHandlerRegistry = {
  'os-button': osButtonHandlers,
  'os-input': osInputHandlers,
  'os-table': osTableHandlers,
};
