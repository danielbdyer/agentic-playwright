/**
 * Cold-Start Accelerator — pure domain logic (N2.3)
 *
 * Provides seed packs (pre-built knowledge bundles) and a discovery strategy
 * that prioritizes breadth over depth during early iterations to reduce
 * time-to-useful-baseline for new suites.
 */

import type {
  ColdStartConfig,
  ColdStartProgress,
  SeedPack,
  SeedPackKind,
  SeedPattern,
  SeedRoute,
  SeedWidget,
} from './types/cold-start';

// ---------------------------------------------------------------------------
// Built-in seed packs
// ---------------------------------------------------------------------------

export const COMMON_WEB_SEED: SeedPack = {
  kind: 'common-web',
  version: 1,
  name: 'Common Web Patterns',
  description: 'Baseline patterns for standard web applications',
  patterns: [
    { name: 'nav-link', selector: 'a[href]', role: 'link', action: 'click', confidence: 0.7 },
    { name: 'submit-button', selector: 'button[type="submit"]', role: 'button', action: 'click', confidence: 0.8 },
    { name: 'text-input', selector: 'input[type="text"]', role: 'textbox', action: 'fill', confidence: 0.8 },
    { name: 'search-input', selector: 'input[type="search"]', role: 'searchbox', action: 'fill', confidence: 0.8 },
    { name: 'checkbox', selector: 'input[type="checkbox"]', role: 'checkbox', action: 'check', confidence: 0.9 },
  ],
  widgets: [
    { componentType: 'button', selectors: ['button', '[role="button"]'], actions: ['click'] },
    { componentType: 'text-field', selectors: ['input[type="text"]', 'textarea'], actions: ['fill', 'clear'] },
    { componentType: 'dropdown', selectors: ['select', '[role="listbox"]'], actions: ['selectOption'] },
  ],
  routes: [],
};

export const FORM_HEAVY_SEED: SeedPack = {
  kind: 'form-heavy',
  version: 1,
  name: 'Form-Heavy Patterns',
  description: 'Patterns for applications with complex form workflows',
  patterns: [
    { name: 'text-input', selector: 'input[type="text"]', role: 'textbox', action: 'fill', confidence: 0.85 },
    { name: 'email-input', selector: 'input[type="email"]', role: 'textbox', action: 'fill', confidence: 0.85 },
    { name: 'password-input', selector: 'input[type="password"]', role: null, action: 'fill', confidence: 0.85 },
    { name: 'textarea', selector: 'textarea', role: 'textbox', action: 'fill', confidence: 0.85 },
    { name: 'radio-button', selector: 'input[type="radio"]', role: 'radio', action: 'check', confidence: 0.9 },
    { name: 'checkbox', selector: 'input[type="checkbox"]', role: 'checkbox', action: 'check', confidence: 0.9 },
    { name: 'select-dropdown', selector: 'select', role: 'combobox', action: 'selectOption', confidence: 0.85 },
    { name: 'submit-button', selector: 'button[type="submit"]', role: 'button', action: 'click', confidence: 0.8 },
    { name: 'reset-button', selector: 'button[type="reset"]', role: 'button', action: 'click', confidence: 0.7 },
    { name: 'date-input', selector: 'input[type="date"]', role: null, action: 'fill', confidence: 0.8 },
  ],
  widgets: [
    { componentType: 'text-field', selectors: ['input[type="text"]', 'textarea'], actions: ['fill', 'clear'] },
    { componentType: 'email-field', selectors: ['input[type="email"]'], actions: ['fill', 'clear'] },
    { componentType: 'password-field', selectors: ['input[type="password"]'], actions: ['fill', 'clear'] },
    { componentType: 'dropdown', selectors: ['select', '[role="listbox"]'], actions: ['selectOption'] },
    { componentType: 'radio-group', selectors: ['[role="radiogroup"]', 'fieldset'], actions: ['check'] },
    { componentType: 'checkbox', selectors: ['input[type="checkbox"]'], actions: ['check', 'uncheck'] },
    { componentType: 'date-picker', selectors: ['input[type="date"]', '[role="dialog"]'], actions: ['fill'] },
  ],
  routes: [
    { pattern: '/register', description: 'User registration form' },
    { pattern: '/login', description: 'Login form' },
    { pattern: '/settings', description: 'Settings form' },
  ],
};

export const DASHBOARD_SEED: SeedPack = {
  kind: 'dashboard',
  version: 1,
  name: 'Dashboard Patterns',
  description: 'Patterns for dashboard and data-display applications',
  patterns: [
    { name: 'nav-link', selector: 'a[href]', role: 'link', action: 'click', confidence: 0.7 },
    { name: 'tab', selector: '[role="tab"]', role: 'tab', action: 'click', confidence: 0.85 },
    { name: 'menu-item', selector: '[role="menuitem"]', role: 'menuitem', action: 'click', confidence: 0.8 },
    { name: 'table-header', selector: 'th[aria-sort]', role: 'columnheader', action: 'click', confidence: 0.75 },
    { name: 'filter-input', selector: 'input[type="search"]', role: 'searchbox', action: 'fill', confidence: 0.8 },
  ],
  widgets: [
    { componentType: 'tab-bar', selectors: ['[role="tablist"]'], actions: ['click'] },
    { componentType: 'data-table', selectors: ['table', '[role="grid"]'], actions: ['click'] },
    { componentType: 'chart', selectors: ['canvas', 'svg'], actions: ['click', 'hover'] },
    { componentType: 'sidebar-nav', selectors: ['nav', '[role="navigation"]'], actions: ['click'] },
  ],
  routes: [
    { pattern: '/dashboard', description: 'Main dashboard view' },
    { pattern: '/reports', description: 'Reports view' },
  ],
};

export const ECOMMERCE_SEED: SeedPack = {
  kind: 'e-commerce',
  version: 1,
  name: 'E-Commerce Patterns',
  description: 'Patterns for e-commerce and shopping applications',
  patterns: [
    { name: 'add-to-cart', selector: '[data-action="add-to-cart"], button.add-to-cart', role: 'button', action: 'click', confidence: 0.75 },
    { name: 'product-link', selector: 'a[href*="product"]', role: 'link', action: 'click', confidence: 0.7 },
    { name: 'quantity-input', selector: 'input[type="number"]', role: 'spinbutton', action: 'fill', confidence: 0.8 },
    { name: 'search-input', selector: 'input[type="search"]', role: 'searchbox', action: 'fill', confidence: 0.8 },
    { name: 'checkout-button', selector: 'button.checkout, a[href*="checkout"]', role: 'button', action: 'click', confidence: 0.75 },
  ],
  widgets: [
    { componentType: 'product-card', selectors: ['[data-product]', '.product-card'], actions: ['click'] },
    { componentType: 'cart', selectors: ['[data-cart]', '.cart'], actions: ['click'] },
    { componentType: 'quantity-selector', selectors: ['input[type="number"]'], actions: ['fill', 'increment', 'decrement'] },
  ],
  routes: [
    { pattern: '/products', description: 'Product listing page' },
    { pattern: '/cart', description: 'Shopping cart' },
    { pattern: '/checkout', description: 'Checkout flow' },
  ],
};

const EMPTY_SEED: SeedPack = {
  kind: 'custom',
  version: 1,
  name: 'Custom (Empty)',
  description: 'Empty seed pack for custom configurations',
  patterns: [],
  widgets: [],
  routes: [],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const SEED_REGISTRY: ReadonlyMap<SeedPackKind, SeedPack> = new Map<SeedPackKind, SeedPack>([
  ['common-web', COMMON_WEB_SEED],
  ['form-heavy', FORM_HEAVY_SEED],
  ['dashboard', DASHBOARD_SEED],
  ['e-commerce', ECOMMERCE_SEED],
  ['custom', EMPTY_SEED],
]);

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Return the matching built-in seed packs for each requested kind.
 * Unknown kinds yield the empty (custom) pack.
 */
export function selectSeedPacks(kinds: readonly SeedPackKind[]): readonly SeedPack[] {
  return kinds.map((k) => SEED_REGISTRY.get(k) ?? EMPTY_SEED);
}

/**
 * Deduplicate items by a key extractor, keeping the first occurrence.
 */
function dedupBy<T>(items: readonly T[], keyFn: (item: T) => string): readonly T[] {
  return items.reduce<readonly T[]>(
    (acc, item) => (acc.some((existing) => keyFn(existing) === keyFn(item)) ? acc : [...acc, item]),
    [],
  );
}

/**
 * Merge multiple seed packs into one, deduplicating patterns by name,
 * widgets by componentType, and routes by pattern.
 */
export function mergeSeedPacks(packs: readonly SeedPack[]): SeedPack {
  const allPatterns: readonly SeedPattern[] = packs.flatMap((p) => p.patterns);
  const allWidgets: readonly SeedWidget[] = packs.flatMap((p) => p.widgets);
  const allRoutes: readonly SeedRoute[] = packs.flatMap((p) => p.routes);

  return {
    kind: 'custom',
    version: 1,
    name: packs.length === 0 ? 'Empty Merged Pack' : `Merged: ${packs.map((p) => p.name).join(' + ')}`,
    description: 'Merged seed pack combining multiple sources',
    patterns: dedupBy(allPatterns, (p) => p.name),
    widgets: dedupBy(allWidgets, (w) => w.componentType),
    routes: dedupBy(allRoutes, (r) => r.pattern),
  };
}

/**
 * Compute cold-start progress given current discovery state.
 */
export function evaluateColdStartProgress(
  config: ColdStartConfig,
  discoveredScreens: number,
  coveredScreens: number,
  iteration: number,
): ColdStartProgress {
  const coverageRate = discoveredScreens === 0 ? 0 : coveredScreens / discoveredScreens;
  const remainingBudget = config.discoveryBudget - iteration;
  const graduated =
    coverageRate >= config.minCoverageForGraduation || remainingBudget <= 0;

  return {
    kind: 'cold-start-progress',
    iteration,
    discoveredScreens,
    coveredScreens,
    coverageRate,
    graduated,
    remainingBudget,
  };
}

/**
 * Determine whether the cold-start phase should graduate to normal operation.
 * Graduation occurs when coverage meets the threshold or the budget is exhausted.
 */
export function shouldGraduate(progress: ColdStartProgress, config: ColdStartConfig): boolean {
  return progress.coverageRate >= config.minCoverageForGraduation || progress.remainingBudget <= 0;
}
