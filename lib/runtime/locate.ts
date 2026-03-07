import { Page, Locator } from '@playwright/test';
import { ElementSig } from '../domain/types';

export function locate(page: Page, element: ElementSig): Locator {
  if (element.testId) {
    return page
      .getByTestId(element.testId)
      .or(page.getByRole(element.role as never, element.name ? { name: element.name } : undefined));
  }

  if (element.name) {
    return page.getByRole(element.role as never, { name: element.name });
  }

  if (element.cssFallback) {
    return page.locator(element.cssFallback);
  }

  return page.getByRole(element.role as never);
}

