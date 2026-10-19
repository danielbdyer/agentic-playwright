/**
 * Synthetic snapshot candidates shaped like the vision's Appendix C: a
 * Reactive "Policy Search" screen with a header navigation, a search
 * landmark holding a placeholder-named textbox, a Search button and a
 * roleless "Filter" handler-owner, a results table whose rows carry
 * POL-001 / POL-002, a feedback message, and a footer.
 */
import type { Candidate } from '../../../src/contract/schemas.js';

const defaults = {
  namingSource: 'content',
  affordance: 'native',
  interactive: true,
  tag: 'button',
  visible: true,
  enabled: true,
  inViewport: true,
} as const;

export const candidate = (fields: Partial<Candidate> & Pick<Candidate, 'ref' | 'role' | 'name'>): Candidate =>
  ({ ...defaults, ...fields }) as Candidate;

/** A landmark node: not interactive, named or not. */
export const landmark = (ref: string, role: string, name = '', fields: Partial<Candidate> = {}): Candidate =>
  candidate({ ref, role, name, interactive: false, affordance: 'none', namingSource: name.length > 0 ? 'aria-label' : 'none', tag: 'div', ...fields });

export const policySearchPage = (): Candidate[] => [
  landmark('c1', 'banner', '', { tag: 'header' }),
  landmark('c2', 'navigation', 'Main menu', { tag: 'nav', landmark: 'banner' }),
  candidate({ ref: 'c3', role: 'link', name: 'Home', tag: 'a', landmark: 'navigation', landmarkName: 'Main menu' }),
  candidate({ ref: 'c4', role: 'link', name: 'Policy Search', tag: 'a', landmark: 'navigation', landmarkName: 'Main menu' }),
  candidate({ ref: 'c5', role: 'link', name: 'Claims', tag: 'a', landmark: 'navigation', landmarkName: 'Main menu' }),
  landmark('c6', 'main', '', { tag: 'main' }),
  candidate({ ref: 'c7', role: 'heading', name: 'Policy Search', interactive: false, affordance: 'none', tag: 'h1', landmark: 'main', level: 1 }),
  landmark('c8', 'search', '', { landmark: 'main', dataBlock: 'SearchBlock' }),
  candidate({
    ref: 'c9', role: 'textbox', name: 'Search Policy', namingSource: 'placeholder', placeholder: 'Search Policy', tag: 'input',
    landmark: 'search', dataBlock: 'SearchBlock', id: 'b3-Input_Search', idKind: 'structural', inputType: 'text',
  }),
  candidate({ ref: 'c10', role: 'button', name: 'Search', landmark: 'search', dataBlock: 'SearchBlock' }),
  candidate({ ref: 'c11', role: 'generic', name: 'Filter', affordance: 'handler-owner', tag: 'div', landmark: 'search', dataBlock: 'SearchBlock' }),
  candidate({ ref: 'c12', role: 'row', name: 'POL-001 John Smith Active', interactive: false, affordance: 'none', tag: 'tr', landmark: 'main' }),
  candidate({ ref: 'c13', role: 'link', name: 'View', tag: 'a', landmark: 'main', rowText: 'POL-001 John Smith Active' }),
  candidate({ ref: 'c14', role: 'checkbox', name: '', namingSource: 'none', tag: 'input', landmark: 'main', rowText: 'POL-001 John Smith Active', checked: false }),
  candidate({ ref: 'c15', role: 'row', name: 'POL-002 Jane Doe Lapsed', interactive: false, affordance: 'none', tag: 'tr', landmark: 'main' }),
  candidate({ ref: 'c16', role: 'link', name: 'View', tag: 'a', landmark: 'main', rowText: 'POL-002 Jane Doe Lapsed' }),
  candidate({ ref: 'c17', role: 'checkbox', name: '', namingSource: 'none', tag: 'input', landmark: 'main', rowText: 'POL-002 Jane Doe Lapsed', checked: false }),
  candidate({ ref: 'c18', role: 'generic', name: 'Policy saved successfully', interactive: false, affordance: 'none', tag: 'div', landmark: 'main' }),
  landmark('c19', 'contentinfo', '', { tag: 'footer' }),
  candidate({ ref: 'c20', role: 'link', name: 'Privacy', tag: 'a', landmark: 'contentinfo' }),
];
