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

/** login-form — form landmark with two required textboxes + submit.
 *  submitReveal: success-on-required-filled. Rendered as a real
 *  <form> whose submit handler checks required fields and reveals
 *  either a role=status success message or a role=alert error
 *  message. Exercises the production form pattern end to end:
 *  required-field validation, submit semantics, success/error
 *  reveal. */
const loginForm: TestTopology = {
  id: 'login-form',
  surfaces: [
    {
      role: 'form',
      name: 'Login',
      submitReveal: 'success-on-required-filled',
      successMessage: 'Signed in',
      errorMessage: 'Please complete required fields',
      children: [
        {
          role: 'textbox',
          name: 'Identifier',
          required: true,
          describedBy: 'identifier-help',
        },
        {
          role: 'status',
          name: 'Identifier help',
          surfaceId: 'identifier-help',
        },
        {
          role: 'textbox',
          name: 'Passphrase',
          required: true,
          describedBy: 'passphrase-help',
        },
        {
          role: 'status',
          name: 'Passphrase help',
          surfaceId: 'passphrase-help',
        },
        { role: 'button', name: 'Submit' },
      ],
    },
  ],
};

/** validation-error-form — form whose required field is pre-marked
 *  invalid. Exercises aria-invalid observation and the error-reveal
 *  path when submitted empty. */
const validationErrorForm: TestTopology = {
  id: 'validation-error-form',
  surfaces: [
    {
      role: 'form',
      name: 'Profile',
      submitReveal: 'success-on-required-filled',
      errorMessage: 'Profile has errors',
      children: [
        {
          role: 'textbox',
          name: 'Display name',
          required: true,
          invalid: true,
          describedBy: 'display-name-error',
        },
        {
          role: 'alert',
          name: 'Display name error',
          surfaceId: 'display-name-error',
        },
        { role: 'button', name: 'Save' },
      ],
    },
  ],
};

/** prefilled-form — form with required fields already populated via
 *  initialValue. Submit should reveal success via the required-
 *  filled path. */
const prefilledForm: TestTopology = {
  id: 'prefilled-form',
  surfaces: [
    {
      role: 'form',
      name: 'Quick-save',
      submitReveal: 'success-on-required-filled',
      successMessage: 'Changes saved',
      children: [
        {
          role: 'textbox',
          name: 'Title',
          required: true,
          initialValue: 'Untitled',
        },
        {
          role: 'textbox',
          name: 'Body',
          required: true,
          initialValue: 'Draft body',
          inputBacking: 'native-textarea',
        },
        { role: 'button', name: 'Save' },
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

/** reactive-record-list — the central-tendency shape of a real
 *  OutSystems Reactive list screen (docs/v2-substrate-reality-study.md
 *  §§1.1, 2). Four things the older topologies never posed, in one
 *  composition:
 *
 *    - a `search` landmark whose textbox is named by placeholder
 *      ALONE (F2: 5/7 study routes);
 *    - a roleless, content-named click affordance — the "Filter"
 *      toggle that is a `<div style="cursor:pointer">` on the real
 *      catalog page (F3: ~24% of interactive controls);
 *    - `banner` + `navigation` + `main` landmarks (F4: 100%
 *      reliable), with content-named links inside `navigation`;
 *    - a list nested 3–5 levels deep in `data-block` chrome (F5),
 *      each item carrying a content-named link — the compiled
 *      block-in-list nesting whose ids are structural paths.
 *
 *  The default entropy selects the `reactive-block` chrome
 *  vocabulary at real depths so the axis-invariance gate runs
 *  against the wrapper shape a customer's DOM actually has. */
const reactiveRecordList: TestTopology = {
  id: 'reactive-record-list',
  surfaces: [
    { role: 'banner', name: 'App header' },
    {
      role: 'navigation',
      name: 'Main menu',
      children: [
        { role: 'link', name: 'Products' },
        { role: 'link', name: 'Requests' },
        { role: 'link', name: 'Employees' },
      ],
    },
    {
      role: 'main',
      name: 'Product catalog',
      children: [
        {
          role: 'search',
          name: 'Search',
          children: [
            { role: 'textbox', naming: 'none', placeholder: 'Search products', surfaceId: 'catalog-search' },
            { role: 'generic', name: 'Filter', clickable: true, surfaceId: 'catalog-filter' },
          ],
        },
        {
          role: 'list',
          children: [
            { role: 'listitem', children: [{ role: 'link', name: 'Aurora headset' }] },
            { role: 'listitem', children: [{ role: 'link', name: 'Borealis keyboard' }] },
            { role: 'listitem', children: [{ role: 'link', name: 'Cascade monitor' }] },
          ],
        },
        { role: 'generic', name: 'Back to Overview', clickable: true, surfaceId: 'catalog-back' },
      ],
    },
  ],
  entropy: {
    seed: 'reactive-record-list',
    chromeVocabulary: 'reactive-block',
    wrapperDepth: [3, 5],
    siblingJitter: [0, 2],
  },
};

/** reactive-entry-form — the shape of the one genuine data-entry
 *  form in the study corpus (Productform): inputs named by
 *  `<label for=id>` (6 of 7), one by a wrapping `<label>`, and a
 *  content-named submit button. Exercises the label-for and
 *  label-wrap naming realizations end to end. */
const reactiveEntryForm: TestTopology = {
  id: 'reactive-entry-form',
  surfaces: [
    {
      role: 'form',
      name: 'Product',
      submitReveal: 'success-on-required-filled',
      successMessage: 'Product saved',
      errorMessage: 'Product has errors',
      children: [
        { role: 'textbox', name: 'Product name', naming: 'label-for', required: true },
        { role: 'textbox', name: 'SKU', naming: 'label-for' },
        { role: 'textbox', name: 'Description', naming: 'label-wrap', inputBacking: 'native-textarea' },
        { role: 'combobox', name: 'Category', naming: 'label-for' },
        { role: 'checkbox', name: 'Featured', naming: 'label-wrap' },
        { role: 'button', name: 'Save' },
      ],
    },
  ],
  entropy: {
    seed: 'reactive-entry-form',
    chromeVocabulary: 'reactive-block',
    wrapperDepth: [2, 4],
  },
};

export function createDefaultTopologyRegistry(): TestTopologyRegistry {
  return testTopologyRegistry([
    loginForm,
    tabbedInterface,
    paginatedGrid,
    landmarkPage,
    validationErrorForm,
    prefilledForm,
    reactiveRecordList,
    reactiveEntryForm,
  ]);
}
