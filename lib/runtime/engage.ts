import { Locator, Page, expect } from '@playwright/test';
import { ElementId, PostureId } from '../domain/identity';
import { unknownEffectTargetError } from '../domain/errors';
import { ElementSig, Posture, SurfaceDefinition } from '../domain/types';
import { interact } from './interact';
import { locate } from './locate';
import { RuntimeResult, runtimeErr, runtimeOk } from './result';

function coerceMessagePattern(value: string | null | undefined): RegExp | string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^\/(.*)\/([a-z]*)$/i);
  if (!match) {
    return value;
  }

  return new RegExp(match[1], match[2]);
}

function validationMessage(target: Locator, targetKind: 'element' | 'surface'): Locator {
  return targetKind === 'element'
    ? target.locator('xpath=..').locator('.ValidationMessage, [class*="ValidationMessage"], [role="alert"]')
    : target.locator('.ValidationMessage, [class*="ValidationMessage"], [role="alert"]');
}

function requiredMessage(target: Locator, targetKind: 'element' | 'surface'): Locator {
  return targetKind === 'element'
    ? target.locator('xpath=..').locator('.Required, [class*="Required"]')
    : target.locator('.Required, [class*="Required"]');
}

function resolveTargetLocator(
  page: Page,
  elementLocator: Locator,
  effect: { target: 'self' | string; targetKind?: 'self' | 'element' | 'surface' },
  elements: Record<string, ElementSig>,
  surfaces: Record<string, SurfaceDefinition>,
): RuntimeResult<{ locator: Locator; targetKind: 'element' | 'surface' }> {
  if (effect.target === 'self' || effect.targetKind === 'self') {
    return runtimeOk({ locator: elementLocator, targetKind: 'element' });
  }

  const inferredTargetKind = effect.targetKind ?? (surfaces[effect.target] ? 'surface' : 'element');
  if (inferredTargetKind === 'surface') {
    const surface = surfaces[effect.target];
    if (!surface) {
      const error = unknownEffectTargetError(effect.target, 'surface');
      return runtimeErr('runtime-unknown-effect-target', error.message, error.context, error);
    }
    return runtimeOk({ locator: page.locator(surface.selector), targetKind: 'surface' });
  }

  const element = elements[effect.target];
  if (!element) {
    const error = unknownEffectTargetError(effect.target, 'element');
    return runtimeErr('runtime-unknown-effect-target', error.message, error.context, error);
  }

  return runtimeOk({ locator: locate(page, element), targetKind: 'element' });
}

export async function engage(
  page: Page,
  elements: Record<string, ElementSig>,
  postures: Record<string, Record<string, Posture>>,
  surfaces: Record<string, SurfaceDefinition>,
  elementId: ElementId,
  postureId: PostureId = 'valid' as PostureId,
  override?: string,
): Promise<RuntimeResult<void>> {
  const element = elements[elementId];
  if (!element) {
    const error = unknownEffectTargetError(elementId, 'element');
    return runtimeErr('runtime-unknown-effect-target', error.message, error.context, error);
  }

  const posture = postures[elementId]?.[postureId];
  const value = override ?? posture?.values?.[0];
  const locator = locate(page, element);

  if (value !== undefined) {
    const fill = await interact(locator, element.widget, 'fill', value);
    if (!fill.ok) {
      return fill;
    }
  }

  for (const effect of posture?.effects ?? []) {
    const target = resolveTargetLocator(page, locator, effect, elements, surfaces);
    if (!target.ok) {
      return target;
    }

    const pattern = coerceMessagePattern(effect.message);

    switch (effect.state) {
      case 'validation-error':
        await expect(validationMessage(target.value.locator, target.value.targetKind)).toBeVisible();
        if (pattern) {
          await expect(validationMessage(target.value.locator, target.value.targetKind)).toHaveText(pattern);
        }
        break;
      case 'required-error':
        await expect(requiredMessage(target.value.locator, target.value.targetKind)).toBeVisible();
        break;
      case 'disabled':
        await expect(target.value.locator).toBeDisabled();
        break;
      case 'enabled':
        await expect(target.value.locator).toBeEnabled();
        break;
      case 'visible':
        await expect(target.value.locator).toBeVisible();
        if (pattern) {
          await expect(target.value.locator).toHaveText(pattern);
        }
        break;
      case 'hidden':
        await expect(target.value.locator).toBeHidden();
        break;
    }
  }

  return runtimeOk(undefined);
}
