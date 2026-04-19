import { expect, test } from '@playwright/test';
import {
  resolvePlaywrightHeadless,
  resolvePreferredPlaywrightChannel,
} from '../../product/instruments/tooling/browser-options';

test('playwright browser options honor explicit headed and CI-safe modes', () => {
  expect(resolvePlaywrightHeadless({} as NodeJS.ProcessEnv)).toBe(true);
  expect(resolvePlaywrightHeadless({ TESSERACT_HEADLESS: '0' } as NodeJS.ProcessEnv)).toBe(false);
  expect(resolvePlaywrightHeadless({ TESSERACT_HEADLESS: 'false' } as NodeJS.ProcessEnv)).toBe(false);
  expect(resolvePlaywrightHeadless({ PWDEBUG: '1' } as NodeJS.ProcessEnv)).toBe(false);
  expect(resolvePlaywrightHeadless({ TESSERACT_HEADLESS: '1', PWDEBUG: '1' } as NodeJS.ProcessEnv)).toBe(true);

  expect(resolvePreferredPlaywrightChannel({ TESSERACT_CHANNEL: 'msedge' } as NodeJS.ProcessEnv)).toBe('msedge');
  expect(resolvePreferredPlaywrightChannel({ TESSERACT_CHANNEL: 'chromium' } as NodeJS.ProcessEnv)).toBeUndefined();
  expect(resolvePreferredPlaywrightChannel({ TESSERACT_CHANNEL: 'default' } as NodeJS.ProcessEnv)).toBeUndefined();
  expect(resolvePreferredPlaywrightChannel({ TESSERACT_CHECK: '1' } as NodeJS.ProcessEnv)).toBeUndefined();
  expect(resolvePreferredPlaywrightChannel({ CI: 'true' } as NodeJS.ProcessEnv)).toBeUndefined();
});
