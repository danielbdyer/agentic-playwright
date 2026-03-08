import { existsSync } from 'fs';
import { chromium, expect, test } from '@playwright/test';

const chromiumExecutablePath = chromium.executablePath();

test.skip(
  !existsSync(chromiumExecutablePath),
  `Chromium executable not installed at ${chromiumExecutablePath}`,
);

for (const seed of ['atlas-seed', 'ember-seed']) {
  test(`policy journey contracts survive seeded fuzz (${seed})`, async ({ page }) => {
    await page.goto(`/policy-journey.html?seed=${seed}`);

    const policyNumberInput = page.getByTestId('journey-policy-number-input');
    await expect(policyNumberInput).toBeVisible();
    await expect(page.getByTestId('eligibility-validation')).toBeHidden();

    await policyNumberInput.fill('POL-001');
    await page.getByTestId('continue-to-coverage-button').click();
    await expect(page.getByTestId('coverage-step')).toBeVisible();

    await page.getByTestId('coverage-tier-input').fill('Premium');
    await page.getByTestId('effective-date-input').fill('2026-04-01');
    await page.getByTestId('continue-to-review-button').click();

    await expect(page.getByTestId('review-summary')).toContainText('POL-001 / Harbor Mutual');
    await expect(page.getByTestId('review-summary')).toContainText('Premium');

    await page.getByTestId('back-to-coverage-button').click();
    await expect(page.getByTestId('coverage-state-card')).toContainText('Premium');
    await expect(page.getByTestId('coverage-state-card')).toContainText('2026-04-01');
    await expect(page.getByTestId('coverage-state-card')).toContainText('Returned from review without losing the selected coverage.');
  });
}
