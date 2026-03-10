import type { Locator } from '@playwright/test';
import type { WidgetInteractionContext } from '../../domain/types';
import { osButtonHandlers } from './os-button';
import { osInputHandlers } from './os-input';
import { osTableHandlers } from './os-table';
import { osSelectHandlers } from './os-select';
import { osToggleHandlers } from './os-toggle';

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
  'os-select': osSelectHandlers,
  'os-toggle': osToggleHandlers,
};
