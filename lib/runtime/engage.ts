import { Locator, Page, expect } from '@playwright/test';
import { ElementId, PostureId } from '../domain/identity';
import { ElementSig, Posture, SurfaceDefinition } from '../domain/types';
import { interact } from './interact';
import { locate } from './locate';

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
): { locator: Locator; targetKind: 'element' | 'surface' } {
  if (effect.target === 'self' || effect.targetKind === 'self') {
    return { locator: elementLocator, targetKind: 'element' };
  }

  const inferredTargetKind = effect.targetKind ?? (surfaces[effect.target] ? 'surface' : 'element');
  if (inferredTargetKind === 'surface') {
    const surface = surfaces[effect.target];
    if (!surface) {
      throw new Error(`Unknown surface target ${effect.target}`);
    }
    return { locator: page.locator(surface.selector), targetKind: 'surface' };
  }

  return { locator: locate(page, elements[effect.target]), targetKind: 'element' };
}

export async function engage(
  page: Page,
  elements: Record<string, ElementSig>,
  postures: Record<string, Record<string, Posture>>,
  surfaces: Record<string, SurfaceDefinition>,
  elementId: ElementId,
  postureId: PostureId = 'valid' as PostureId,
  override?: string,
): Promise<void> {
  const element = elements[elementId];
  const posture = postures[elementId]?.[postureId];
  const value = override ?? posture?.values?.[0];
  const locator = locate(page, element);

  if (value !== undefined) {
    await interact(locator, element.widget, 'fill', value);
  }

  for (const effect of posture?.effects ?? []) {
    const { locator: target, targetKind } = resolveTargetLocator(page, locator, effect, elements, surfaces);
    const pattern = coerceMessagePattern(effect.message);

    switch (effect.state) {
      case 'validation-error':
        await expect(validationMessage(target, targetKind)).toBeVisible();
        if (pattern) {
          await expect(validationMessage(target, targetKind)).toHaveText(pattern);
        }
        break;
      case 'required-error':
        await expect(requiredMessage(target, targetKind)).toBeVisible();
        break;
      case 'disabled':
        await expect(target).toBeDisabled();
        break;
      case 'enabled':
        await expect(target).toBeEnabled();
        break;
      case 'visible':
        await expect(target).toBeVisible();
        if (pattern) {
          await expect(target).toHaveText(pattern);
        }
        break;
      case 'hidden':
        await expect(target).toBeHidden();
        break;
    }
  }
}

