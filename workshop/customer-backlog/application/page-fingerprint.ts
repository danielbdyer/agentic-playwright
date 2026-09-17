/**
 * Page fingerprint — the structural self-description a public-AUT
 * cohort receipt carries so a held-out `not-found` can be told apart
 * from site drift (docs/v2-substrate-reality-study.md §6, closing the
 * cycle-9 instrumentation gap).
 *
 * The receipt used to record only step outcomes; a reviewer reading
 * a `not-found` could not tell whether the classifier missed a
 * control that was there, or the site had changed under the case.
 * The fingerprint answers that with the same axes the reality study
 * measures — landmarks (F4), roleless interactives (F3),
 * placeholder-named inputs (F2), `data-block` density and the
 * OutSystems runtime global (F1) — plus the page title and final URL.
 *
 * In-page evaluator discipline (docs/coding-notes.md "In-page
 * evaluators"): the function passed to `page.evaluate` is self-
 * contained; nothing from module scope is referenced inside it.
 */

import type { Page } from 'playwright';

export interface PageFingerprint {
  readonly title: string;
  readonly finalUrl: string;
  readonly landmarks: readonly string[];
  readonly roleCounts: Readonly<Record<string, number>>;
  readonly interactiveCount: number;
  readonly rolelessInteractiveCount: number;
  readonly placeholderOnlyInputCount: number;
  readonly dataBlockCount: number;
  readonly outSystemsRuntime: boolean;
  readonly nodeCount: number;
}

export async function capturePageFingerprint(page: Page): Promise<PageFingerprint> {
  const inPage = await page.evaluate(() => {
    const IMPLICIT = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'option']);
    const LANDMARKS = new Set(['banner', 'navigation', 'main', 'search', 'region', 'complementary', 'contentinfo', 'form']);
    const IMPLICIT_LANDMARK_TAGS: Record<string, string> = { header: 'banner', nav: 'navigation', main: 'main', footer: 'contentinfo', form: 'form' };
    const all = Array.from(document.body ? document.body.querySelectorAll('*') : []);
    const roleCounts: Record<string, number> = {};
    const landmarks = new Set<string>();
    let interactive = 0;
    let roleless = 0;
    let placeholderOnly = 0;
    let dataBlocks = 0;
    for (const el of all) {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') ?? IMPLICIT_LANDMARK_TAGS[tag] ?? null;
      if (role !== null) {
        roleCounts[role] = (roleCounts[role] ?? 0) + 1;
        if (LANDMARKS.has(role)) landmarks.add(role);
      }
      if (el.hasAttribute('data-block')) dataBlocks += 1;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      if (!visible) continue;
      const tabindex = el.getAttribute('tabindex');
      const isInteractive =
        tag === 'a' || tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea' ||
        role === 'button' || el.hasAttribute('onclick') ||
        (tabindex !== null && parseInt(tabindex, 10) >= 0) || style.cursor === 'pointer';
      if (isInteractive) {
        interactive += 1;
        const roleBearing = el.getAttribute('role') !== null || (IMPLICIT.has(tag) && !(tag === 'a' && !el.hasAttribute('href')));
        if (!roleBearing) roleless += 1;
      }
      if ((tag === 'input' || tag === 'textarea') && (el as HTMLInputElement).type !== 'hidden') {
        const hasLabel = el.getAttribute('aria-label') !== null || el.getAttribute('aria-labelledby') !== null ||
          ((el as HTMLInputElement).labels?.length ?? 0) > 0;
        if (!hasLabel && (el.getAttribute('placeholder') ?? '').trim().length > 0) placeholderOnly += 1;
      }
    }
    const w = window as unknown as Record<string, unknown>;
    return {
      title: document.title,
      landmarks: Array.from(landmarks).sort(),
      roleCounts,
      interactiveCount: interactive,
      rolelessInteractiveCount: roleless,
      placeholderOnlyInputCount: placeholderOnly,
      dataBlockCount: dataBlocks,
      outSystemsRuntime: typeof w['OutSystems'] !== 'undefined' || typeof w['OSFramework'] !== 'undefined',
      nodeCount: all.length,
    };
  });
  return { ...inPage, finalUrl: page.url() };
}
