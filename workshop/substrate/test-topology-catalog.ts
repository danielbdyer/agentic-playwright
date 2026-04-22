/**
 * Default TestTopology catalog — structural test patterns the
 * substrate ships.
 *
 * Each topology is named for the structural pattern it exercises,
 * not a business domain. Callers reference them by id via
 * `world.preset: "<id>"`. Additional topologies land as fixtures
 * need new structural patterns — not as business screens.
 */

import type { TestTopology } from './test-topology';
import { testTopologyRegistry, type TestTopologyRegistry } from './test-topology';

/** login-form — form landmark containing two textboxes + submit button.
 *  Exercises: form landmark, textbox query, button query, ARIA
 *  nesting through `form → {textbox, textbox, button}`. */
const loginForm: TestTopology = {
  id: 'login-form',
  surfaces: [
    {
      role: 'form',
      name: 'Login',
      children: [
        { role: 'textbox', name: 'Identifier' },
        { role: 'textbox', name: 'Passphrase' },
        { role: 'button', name: 'Submit' },
      ],
    },
  ],
};

/** tabbed-interface — tablist with 3 tabs + 3 tabpanels. */
const tabbedInterface: TestTopology = {
  id: 'tabbed-interface',
  surfaces: [
    {
      role: 'main',
      name: 'Sections',
      children: [
        {
          role: 'tablist',
          name: 'Section tabs',
          children: [
            { role: 'tab', name: 'Alpha' },
            { role: 'tab', name: 'Beta' },
            { role: 'tab', name: 'Gamma' },
          ],
        },
        { role: 'tabpanel', name: 'Alpha' },
        { role: 'tabpanel', name: 'Beta' },
        { role: 'tabpanel', name: 'Gamma' },
      ],
    },
  ],
};

/** paginated-grid — grid with rowheaders + 3 rows + pagination links. */
const paginatedGrid: TestTopology = {
  id: 'paginated-grid',
  surfaces: [
    {
      role: 'main',
      name: 'Records',
      children: [
        {
          role: 'grid',
          name: 'Records',
          children: [
            {
              role: 'row',
              children: [
                { role: 'rowheader', name: 'Name' },
                { role: 'rowheader', name: 'Created' },
              ],
            },
            {
              role: 'row',
              children: [
                { role: 'gridcell', name: 'Row 1, col 1' },
                { role: 'gridcell', name: 'Row 1, col 2' },
              ],
            },
            {
              role: 'row',
              children: [
                { role: 'gridcell', name: 'Row 2, col 1' },
                { role: 'gridcell', name: 'Row 2, col 2' },
              ],
            },
          ],
        },
        {
          role: 'navigation',
          name: 'Pagination',
          children: [
            { role: 'link', name: 'Previous' },
            { role: 'link', name: 'Page 1' },
            { role: 'link', name: 'Page 2' },
            { role: 'link', name: 'Next' },
          ],
        },
      ],
    },
  ],
};

/** landmark-page — all five ARIA landmarks on one page (banner,
 *  navigation, main, complementary, contentinfo). Useful for
 *  landmark-query probes. */
const landmarkPage: TestTopology = {
  id: 'landmark-page',
  surfaces: [
    { role: 'banner', name: 'Page header' },
    {
      role: 'navigation',
      name: 'Primary',
      children: [
        { role: 'link', name: 'Home' },
        { role: 'link', name: 'Archive' },
      ],
    },
    {
      role: 'main',
      name: 'Content',
      children: [
        { role: 'heading', name: 'Article title' },
      ],
    },
    { role: 'complementary', name: 'Related' },
    { role: 'contentinfo', name: 'Page footer' },
  ],
};

export function createDefaultTopologyRegistry(): TestTopologyRegistry {
  return testTopologyRegistry([
    loginForm,
    tabbedInterface,
    paginatedGrid,
    landmarkPage,
  ]);
}
