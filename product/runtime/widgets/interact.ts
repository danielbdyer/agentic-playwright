import type { Locator } from '@playwright/test';
import { missingActionHandlerError, widgetPreconditionError } from '../../domain/kernel/errors';
import type { WidgetInteractionContext, WidgetPrecondition } from '../../domain/knowledge/widget-types';
import {
  affordancesForRole,
  roleForWidget,
  roleSupportsAction,
  type RoleAffordance,
} from '../../domain/widgets/role-affordances';
import { widgetCapabilityContracts } from '../../domain/widgets/contracts';
import { widgetActionHandlers } from './index';
import type { RuntimeResult} from '../result';
import { runtimeErr, runtimeOk } from '../result';

/**
 * Four-family error classification for action dispatch per v2-direction
 * §3.2. Every interact failure carries a `family` in its error context
 * so the workshop's metric visitors can stratify failure modes without
 * parsing error messages.
 *
 * - `not-visible`: precondition 'visible' failed before dispatch.
 * - `not-enabled`: precondition 'enabled' or 'editable' failed before
 *   dispatch.
 * - `timeout`: the Playwright locator method threw a TimeoutError
 *   (target never resolved within the step timeout).
 * - `assertion-like`: Playwright's action failed an internal assertion
 *   (e.g. "Element is not an <input>" from fill() on a non-input node).
 * - `unclassified`: anything else — reserve for genuinely unknown
 *   failures so 'unclassified' growth is itself a workshop signal
 *   (more unclassified = need another named family).
 */
export type InteractErrorFamily =
  | 'not-visible'
  | 'not-enabled'
  | 'timeout'
  | 'assertion-like'
  | 'unclassified';

/** Classify the precondition family from its name. Called on precondition
 *  failure to tag the error context before it leaves the runtime. */
function preconditionFamily(precondition: WidgetPrecondition): InteractErrorFamily {
  switch (precondition) {
    case 'visible':
      return 'not-visible';
    case 'enabled':
    case 'editable':
      return 'not-enabled';
  }
}

/** Classify a thrown error from Playwright. Inspects the error's name
 *  and message for Playwright's conventional shapes. */
function classifyThrownError(error: unknown): InteractErrorFamily {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || /timeout/i.test(error.message)) {
      return 'timeout';
    }
    // Playwright's internal assertions surface with phrasing like
    // "Element is not an <input>" or "Element is not attached to the DOM"
    // or "expect(...).toBeVisible()".
    if (/element is not|expect\(|strict mode violation/i.test(error.message)) {
      return 'assertion-like';
    }
  }
  return 'unclassified';
}

async function assertPrecondition(locator: Locator, precondition: WidgetPrecondition): Promise<RuntimeResult<void>> {
  switch (precondition) {
    case 'visible':
      if (!(await locator.isVisible())) {
        const error = widgetPreconditionError(precondition);
        return runtimeErr(
          'runtime-widget-precondition-failed',
          error.message,
          { ...error.context, family: preconditionFamily(precondition) },
          error,
        );
      }
      return runtimeOk(undefined);
    case 'enabled':
      if (!(await locator.isEnabled())) {
        const error = widgetPreconditionError(precondition);
        return runtimeErr(
          'runtime-widget-precondition-failed',
          error.message,
          { ...error.context, family: preconditionFamily(precondition) },
          error,
        );
      }
      return runtimeOk(undefined);
    case 'editable':
      if (!(await locator.isEditable())) {
        const error = widgetPreconditionError(precondition);
        return runtimeErr(
          'runtime-widget-precondition-failed',
          error.message,
          { ...error.context, family: preconditionFamily(precondition) },
          error,
        );
      }
      return runtimeOk(undefined);
  }
}

// ---------------------------------------------------------------------------
// Role-based dispatcher — executes an affordance via Playwright
// ---------------------------------------------------------------------------

async function executeAffordance(
  locator: Locator,
  affordance: RoleAffordance,
  value?: string,
): Promise<void> {
  const loc = locator as unknown as Record<string, ((...args: unknown[]) => Promise<unknown>) | undefined>;
  const method = loc[affordance.method];
  if (!method) throw new Error(`Locator does not support method '${affordance.method}'`);
  if (affordance.args === 'value') {
    await method(value ?? '');
  } else {
    await method();
  }
}

async function interactByRole(
  locator: Locator,
  role: string,
  action: string,
  value?: string,
): Promise<RuntimeResult<void>> {
  const affordances = affordancesForRole(role);
  const affordance = affordances.find((a) => a.action === action);
  if (!affordance) {
    const error = missingActionHandlerError(role, action);
    return runtimeErr(
      'runtime-missing-action-handler',
      error.message,
      { ...error.context, family: 'unclassified' satisfies InteractErrorFamily },
      error,
    );
  }

  for (const precondition of affordance.preconditions) {
    const preconditionResult = await assertPrecondition(locator, precondition);
    if (!preconditionResult.ok) {
      return preconditionResult;
    }
  }

  try {
    await executeAffordance(locator, affordance, value);
    return runtimeOk(undefined);
  } catch (error) {
    const family = classifyThrownError(error);
    const message = error instanceof Error ? error.message : String(error);
    return runtimeErr(
      'runtime-execution-failed',
      message,
      { role, action, family },
      error,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API — backward-compatible with role-based fallback
// ---------------------------------------------------------------------------

export async function interact(
  locator: Locator,
  widget: string,
  action: string,
  value?: string,
  context?: WidgetInteractionContext,
): Promise<RuntimeResult<void>> {
  // Path 1: Role-based dispatch via the canonical affordance table.
  const bridgedRole = roleForWidget(widget);
  const directRole = affordancesForRole(widget).length > 0 ? widget : null;
  const resolvedRole = directRole ?? bridgedRole;
  if (resolvedRole && roleSupportsAction(resolvedRole, action as never)) {
    return interactByRole(locator, resolvedRole, action, value);
  }

  // Path 2: Legacy hand-authored handler (compatibility only).
  const contract = widgetCapabilityContracts[widget];
  const handlers = widgetActionHandlers[widget];
  const handler = handlers?.[action];
  if (contract && handler && contract.supportedActions.includes(action as never)) {
    for (const precondition of contract.requiredPreconditions) {
      const preconditionResult = await assertPrecondition(locator, precondition);
      if (!preconditionResult.ok) {
        return preconditionResult;
      }
    }
    try {
      await handler(locator, value, context);
      return runtimeOk(undefined);
    } catch (error) {
      const family = classifyThrownError(error);
      const message = error instanceof Error ? error.message : String(error);
      return runtimeErr(
        'runtime-execution-failed',
        message,
        { widget, action, family },
        error,
      );
    }
  }

  const error = missingActionHandlerError(resolvedRole ?? widget, action);
  return runtimeErr(
    'runtime-missing-action-handler',
    error.message,
    { ...error.context, family: 'unclassified' satisfies InteractErrorFamily },
    error,
  );
}
