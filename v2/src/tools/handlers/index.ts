/**
 * The complete handler map. ToolHandlers is a mapped type over every
 * declared tool name, so a declaration without a handler (or a handler
 * without a declaration) is a compile error, not a runtime surprise.
 */
import type { ToolHandlers } from '../types.js';
import { appHandlers } from './app.js';
import { memoryHandlers } from './memory.js';
import { testHandlers } from './test.js';
import { adoHandlers } from './ado.js';
import { handoffHandlers } from './handoff.js';
import { reviewHandlers } from './review.js';
import { flowHandlers } from './flow.js';

export const createHandlers = (): ToolHandlers => ({
  ...appHandlers,
  ...memoryHandlers,
  ...testHandlers,
  ...adoHandlers,
  ...handoffHandlers,
  ...reviewHandlers,
  ...flowHandlers,
});
