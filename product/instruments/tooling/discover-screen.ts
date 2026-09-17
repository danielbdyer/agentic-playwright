import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';
import YAML from 'yaml';
import { relativeProjectPath, type ProjectPaths } from '../../application/paths';
import { buildDiscoveryArtifacts, deriveScreenIdFromUrl, type RawDiscoveredElement, type RawDiscoveredSurface } from '../../domain/knowledge/discovery';
import { graphIds } from '../../domain/kernel/ids';
import {
  createCanonicalTargetRef,
  createElementId,
  createRouteId,
  createRouteVariantId,
  createScreenId,
  createSectionId,
  createSelectorRef,
  createSurfaceId,
} from '../../domain/kernel/identity';
import { tryAsync } from '../../application/effect';
import { captureAriaYaml } from '../observation/aria';
import { resolvePlaywrightHeadless, resolvePreferredPlaywrightChannel } from './browser-options';
import type { Browser } from '@playwright/test';
import type { LocatorStrategy } from '../../domain/governance/workflow-types';
import type { DiscoveryRun } from '../../domain/target/interface-graph';
import { mintApproved } from '../../domain/governance/workflow-types';

interface BrowserDiscoveryPayload {
  title: string;
  surfaces: RawDiscoveredSurface[];
  elements: RawDiscoveredElement[];
}

function locatorSelectorValue(strategy: LocatorStrategy): string {
  if ('value' in strategy) {
    return strategy.value;
  }
  return `${strategy.role}:${strategy.name ?? ''}`;
}

function selectorRefForCandidate(input: {
  targetRef: string;
  strategy: LocatorStrategy;
  rung: number;
}) {
  return createSelectorRef(`selector:${input.targetRef}:${input.strategy.kind}:${input.rung}:${locatorSelectorValue(input.strategy)}`);
}

function sectionIdForSurface(surfaceId: string): string {
  return `${surfaceId}Section`;
}

export function discoverScreenScaffold(options: {
  screen?: string;
  url: string;
  rootSelector?: string;
  paths: ProjectPaths;
  sharedBrowser?: Browser;
}) {
  return tryAsync(async () => {
    const ownsBrowser = !options.sharedBrowser;
    const environment = process.env;
    const channel = resolvePreferredPlaywrightChannel(environment);
    const browser = options.sharedBrowser ?? await chromium.launch({
      headless: resolvePlaywrightHeadless(environment),
      ...(channel ? { channel } : {}),
    });

    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(2_000);
      await page.goto(options.url, { waitUntil: 'load' });

      const rootSelector = options.rootSelector ?? 'body';
      const root = page.locator(rootSelector).first();
      if (await root.count() === 0) {
        throw new Error(`Root selector ${rootSelector} did not resolve on ${options.url}`);
      }

      const snapshotResult = await captureAriaYaml(root);
      if (!snapshotResult.ok) {
        throw snapshotResult.error;
      }

      const payload = await page.evaluate<BrowserDiscoveryPayload, {
        rootSelector: string;
      }>(({ rootSelector }) => {
        function normalizeText(value: string | null | undefined): string | null {
          if (!value) {
            return null;
          }
          const normalized = value.replace(/\s+/g, ' ').trim();
          return normalized.length > 0 ? normalized : null;
        }

        function escapeAttribute(value: string): string {
          return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        }

        function hasVisibleBox(element: Element): boolean {
          const html = element as HTMLElement;
          const style = window.getComputedStyle(html);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
          }
          const rect = html.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }

        function inferImplicitRole(element: Element): string | null {
          const html = element as HTMLElement;
          const tagName = html.tagName.toLowerCase();
          if (tagName === 'main') return 'main';
          if (tagName === 'form') return 'form';
          if (tagName === 'button') return 'button';
          if (tagName === 'table') return 'table';
          if (tagName === 'textarea') return 'textbox';
          if (tagName === 'a' && html.hasAttribute('href')) return 'link';
          if (tagName === 'section' || tagName === 'article' || tagName === 'aside') {
            return html.getAttribute('aria-label') ? 'region' : null;
          }
          if (tagName === 'input') {
            const input = html as HTMLInputElement;
            const type = input.type.toLowerCase();
            if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
            if (type === 'checkbox') return 'checkbox';
            if (type === 'radio') return 'radio';
            if (type === 'search') return 'searchbox';
            if (type !== 'hidden') return 'textbox';
          }
          return null;
        }

        function readAccessibleName(element: Element): string | null {
          const html = element as HTMLElement;
          const ariaLabel = normalizeText(html.getAttribute('aria-label'));
          if (ariaLabel) {
            return ariaLabel;
          }

          const labelledBy = normalizeText(html.getAttribute('aria-labelledby'));
          if (labelledBy) {
            const value = labelledBy
              .split(/\s+/)
              .map((id) => normalizeText(document.getElementById(id)?.textContent))
              .filter((entry): entry is string => Boolean(entry))
              .join(' ');
            if (value) {
              return value;
            }
          }

          if ('labels' in html) {
            const labels = Array.from((html as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).labels ?? [])
              .map((label) => normalizeText(label.textContent))
              .filter((entry): entry is string => Boolean(entry))
              .join(' ');
            if (labels) {
              return labels;
            }
          }

          const placeholder = normalizeText(html.getAttribute('placeholder'));
          if (placeholder) {
            return placeholder;
          }

          const title = normalizeText(html.getAttribute('title'));
          if (title) {
            return title;
          }

          const heading = html.querySelector('h1, h2, h3, h4, h5, h6');
          const headingText = normalizeText(heading?.textContent);
          if (headingText) {
            return headingText;
          }

          return normalizeText(html.innerText || html.textContent);
        }

        function readTestId(element: Element): string | null {
          const html = element as HTMLElement;
          return normalizeText(
            html.getAttribute('data-testid')
            ?? html.getAttribute('data-test-id')
            ?? html.getAttribute('data-test')
            ?? html.getAttribute('data-qa')
            ?? html.getAttribute('data-cy'),
          );
        }

        function selectorFor(element: Element): string {
          if (element === root) {
            return rootSelector;
          }
          const html = element as HTMLElement;
          const testId = readTestId(html);
          if (testId) {
            return `[data-testid='${escapeAttribute(testId)}']`;
          }
          if (html.id) {
            return `#${CSS.escape(html.id)}`;
          }

          const segments: string[] = [];
          let current: Element | null = html;
          while (current && current.tagName.toLowerCase() !== 'html') {
            const tagName = current.tagName.toLowerCase();
            const siblings = current.parentElement
              ? Array.from(current.parentElement.children).filter((entry) => entry.tagName === current?.tagName)
              : [];
            const index = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
            segments.unshift(`${tagName}${index}`);
            current = current.parentElement;
          }
          return segments.join(' > ');
        }

        const root = document.querySelector(rootSelector);
        if (!root) {
          throw new Error(`Root selector ${rootSelector} did not resolve`);
        }

        const surfaceRoles = new Set(['main', 'form', 'search', 'region', 'alert', 'status', 'table', 'grid', 'dialog']);
        const elementRoles = new Set(['button', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'link', 'alert', 'status', 'region', 'table', 'grid']);
        const candidates = [root, ...Array.from(root.querySelectorAll('*'))];
        const surfaceElements = new Set<Element>();
        const surfaces: RawDiscoveredSurface[] = [];

        for (const element of candidates) {
          if (!hasVisibleBox(element)) {
            continue;
          }
          const role = normalizeText((element as HTMLElement).getAttribute('role')) ?? inferImplicitRole(element);
          const tagName = element.tagName.toLowerCase();
          if (!surfaceRoles.has(role ?? '') && tagName !== 'main' && tagName !== 'form' && tagName !== 'table') {
            continue;
          }
          surfaceElements.add(element);
          surfaces.push({
            selector: selectorFor(element),
            parentSelector: null,
            role,
            name: readAccessibleName(element),
            testId: readTestId(element),
            idAttribute: normalizeText((element as HTMLElement).id),
            contract: normalizeText((element as HTMLElement).getAttribute('data-contract')),
            tagName,
          });
        }

        const parentSelectorByElement = new Map<Element, string | null>();
        for (const element of surfaceElements) {
          let current = element.parentElement;
          let parentSelector: string | null = null;
          while (current && current !== root.parentElement) {
            if (surfaceElements.has(current)) {
              parentSelector = selectorFor(current);
              break;
            }
            current = current.parentElement;
          }
          parentSelectorByElement.set(element, parentSelector);
        }

        // Reality-study F3: a quarter of real OutSystems Reactive
        // controls are `div`/`span` with a click affordance and no
        // role at all (filter toggles, "Back to Overview", pagination,
        // expandable headers). A roleless element is admitted as an
        // element when it is visible, carries a click affordance
        // (cursor:pointer, an onclick handler, or a non-negative
        // tabindex), has short visible text of its own, and contains
        // no role-bearing control (so wrappers around real buttons
        // are not double-counted). It is reported with ARIA's
        // implicit role `generic`; discovery emits a text locator.
        //
        // Handoff §3.2 / N1 / N8: the affordance is handler OWNERSHIP,
        // never an inherited cursor. `cursor: pointer` inherits to
        // every descendant of a clickable ancestor and over-counted
        // roleless controls ~10× on the 2026-09-17 pass; the control
        // is the element that owns the click handler (React 16
        // `__reactEventHandlers$…onClick`, React 17+
        // `__reactProps$…onClick`, an onclick attribute), or that
        // carries tabindex ≥ 0 or a platform widget attribute. It is
        // named by its descendant text.
        const ROLELESS_TEXT_MAX = 80;
        function ownsClickHandler(html: HTMLElement): boolean {
          if (html.hasAttribute('onclick')) return true;
          const record = html as unknown as Record<string, unknown>;
          return Object.keys(record).some((key) => {
            if (!key.startsWith('__reactEventHandlers$') && !key.startsWith('__reactProps$')) return false;
            const props = record[key] as Record<string, unknown> | null;
            return props !== null && typeof props === 'object' && typeof props['onClick'] === 'function';
          });
        }
        function isRolelessClickable(element: Element): boolean {
          const html = element as HTMLElement;
          const tagName = html.tagName.toLowerCase();
          if (tagName === 'script' || tagName === 'style' || tagName === 'svg' || tagName === 'path') return false;
          const tabindex = html.getAttribute('tabindex');
          const affordance =
            ownsClickHandler(html)
            || (tabindex !== null && Number.parseInt(tabindex, 10) >= 0)
            || html.hasAttribute('data-link')
            || html.hasAttribute('data-button');
          if (!affordance) return false;
          const text = normalizeText(html.innerText || html.textContent);
          if (!text || text.length > ROLELESS_TEXT_MAX) return false;
          const nested = html.querySelector('[role], a[href], button, input, select, textarea');
          return nested === null;
        }

        const elements: RawDiscoveredElement[] = [];
        for (const element of candidates) {
          if (!hasVisibleBox(element)) {
            continue;
          }
          const explicitOrImplicitRole = normalizeText((element as HTMLElement).getAttribute('role')) ?? inferImplicitRole(element);
          const tagName = element.tagName.toLowerCase();
          const inputType = tagName === 'input' ? normalizeText((element as HTMLInputElement).type) : null;
          const isRoleQualified = elementRoles.has(explicitOrImplicitRole ?? '') || tagName === 'input' || tagName === 'textarea' || tagName === 'select' || tagName === 'button';
          const rolelessClickable = !isRoleQualified && explicitOrImplicitRole === null && isRolelessClickable(element);
          if (!isRoleQualified && !rolelessClickable) {
            continue;
          }
          const role = rolelessClickable ? 'generic' : explicitOrImplicitRole;
          let current = element.parentElement;
          let surfaceSelector: string | null = null;
          while (current && current !== root.parentElement) {
            if (surfaceElements.has(current)) {
              surfaceSelector = selectorFor(current);
              break;
            }
            current = current.parentElement;
          }
          elements.push({
            selector: selectorFor(element),
            surfaceSelector,
            role,
            name: readAccessibleName(element),
            testId: readTestId(element),
            idAttribute: normalizeText((element as HTMLElement).id),
            contract: normalizeText((element as HTMLElement).getAttribute('data-contract')),
            tagName,
            inputType,
            required: Boolean((element as HTMLInputElement).required),
          });
        }

        return {
          title: document.title,
          surfaces: surfaces.map((surface) => ({
            ...surface,
            parentSelector: parentSelectorByElement.get(
              Array.from(surfaceElements).find((candidate) => selectorFor(candidate) === surface.selector) ?? root,
            ) ?? null,
          })),
          elements,
        };
      }, { rootSelector });

      const screen = options.screen ?? deriveScreenIdFromUrl(options.url);
      const artifacts = buildDiscoveryArtifacts({
        screen,
        url: options.url,
        title: payload.title,
        rootSelector,
        rootSnapshot: snapshotResult.value,
        surfaces: payload.surfaces,
        elements: payload.elements,
      });

      const screenDir = path.join(options.paths.discoveryDir, screen);
      const sectionsDir = path.join(screenDir, 'sections');
      mkdirSync(screenDir, { recursive: true });
      mkdirSync(sectionsDir, { recursive: true });

      const snapshotPath = path.join(screenDir, 'root.snapshot.yaml');
      const hashPath = path.join(screenDir, 'root.snapshot.hash');
      const reportPath = path.join(screenDir, 'report.json');
      const surfaceScaffoldPath = path.join(screenDir, `${screen}.surface.scaffold.yaml`);
      const elementsScaffoldPath = path.join(screenDir, `${screen}.elements.scaffold.yaml`);
      const sectionsIndexPath = path.join(sectionsDir, 'index.json');
      const crawlPath = path.join(screenDir, 'crawl.json');

      writeFileSync(snapshotPath, `${artifacts.snapshot}\n`, 'utf8');
      writeFileSync(hashPath, `${artifacts.snapshotHash}\n`, 'utf8');
      writeFileSync(reportPath, `${JSON.stringify(artifacts.report, null, 2)}\n`, 'utf8');
      writeFileSync(surfaceScaffoldPath, YAML.stringify(artifacts.surfaceScaffold, { indent: 2 }), 'utf8');
      writeFileSync(elementsScaffoldPath, YAML.stringify(artifacts.elementsScaffold, { indent: 2 }), 'utf8');

      const sectionEntries = Object.values(artifacts.sectionArtifacts)
        .sort((left, right) => {
          const depthOrder = left.depth - right.depth;
          if (depthOrder !== 0) {
            return depthOrder;
          }
          return left.id.localeCompare(right.id);
        })
        .map((section) => {
          const sectionDir = path.join(sectionsDir, section.id);
          mkdirSync(sectionDir, { recursive: true });
          const sectionSurfacePath = path.join(sectionDir, 'surface.scaffold.yaml');
          const sectionElementsPath = path.join(sectionDir, 'elements.scaffold.yaml');
          const sectionReportPath = path.join(sectionDir, 'report.json');

          writeFileSync(sectionSurfacePath, YAML.stringify(section.surfaceScaffold, { indent: 2 }), 'utf8');
          writeFileSync(sectionElementsPath, YAML.stringify(section.elementsScaffold, { indent: 2 }), 'utf8');
          writeFileSync(sectionReportPath, `${JSON.stringify({
            id: section.id,
            selector: section.selector,
            depth: section.depth,
            surfaceIds: section.surfaceIds,
            elementIds: section.elementIds,
          }, null, 2)}\n`, 'utf8');

          return {
            id: section.id,
            selector: section.selector,
            depth: section.depth,
            surfaceIds: section.surfaceIds,
            elementIds: section.elementIds,
            surfaceScaffoldPath: sectionSurfacePath,
            elementsScaffoldPath: sectionElementsPath,
            reportPath: sectionReportPath,
          };
        });

      writeFileSync(sectionsIndexPath, `${JSON.stringify({
        version: 1,
        screen,
        url: options.url,
        rootSelector,
        sections: sectionEntries,
      }, null, 2)}\n`, 'utf8');

      const screenId = createScreenId(screen);
      const routeId = createRouteId(screen);
      const variantId = createRouteVariantId('discover');
      const variantRef = `route-variant:discover:${routeId}:${variantId}`;
      const selectorProbes = artifacts.report.elements.flatMap((element) => {
        const elementId = createElementId(element.id);
        const targetRef = createCanonicalTargetRef(`target:element:${screenId}:${elementId}`);
        const graphNodeId = graphIds.target(targetRef);
        return element.locatorCandidates.map((strategy, rung) => ({
          id: `${targetRef}:probe:${strategy.kind}:${rung}`,
          selectorRef: selectorRefForCandidate({ targetRef, strategy, rung }),
          targetRef,
          graphNodeId,
          screen: screenId,
          section: createSectionId(sectionIdForSurface(element.surfaceId)),
          element: elementId,
          strategy,
          source: 'discovery' as const,
          variantRef,
          validWhenStateRefs: [],
          invalidWhenStateRefs: [],
        }));
      });
      const targets: DiscoveryRun['targets'] = [
        ...artifacts.report.surfaces.map((surface) => {
          const surfaceId = createSurfaceId(surface.id);
          const targetRef = createCanonicalTargetRef(`target:surface:${screenId}:${surfaceId}`);
          return {
            targetRef,
            graphNodeId: graphIds.target(targetRef),
            kind: 'surface' as const,
            screen: screenId,
            section: createSectionId(sectionIdForSurface(surface.id)),
            surface: surfaceId,
          };
        }),
        ...artifacts.report.elements.map((element) => {
          const elementId = createElementId(element.id);
          const targetRef = createCanonicalTargetRef(`target:element:${screenId}:${elementId}`);
          return {
            targetRef,
            graphNodeId: graphIds.target(targetRef),
            kind: 'element' as const,
            screen: screenId,
            section: createSectionId(sectionIdForSurface(element.surfaceId)),
            surface: createSurfaceId(element.surfaceId),
            element: elementId,
          };
        }),
      ];

      const discoveryRun: DiscoveryRun = {
        kind: 'discovery-run',
        version: 2,
        stage: 'preparation',
        scope: 'workspace',
        governance: mintApproved(),
        app: 'discover',
        routeId,
        variantId,
        routeVariantRef: variantRef,
        runId: artifacts.snapshotHash,
        screen: screenId,
        url: options.url,
        title: payload.title,
        discoveredAt: new Date().toISOString(),
        artifactPath: relativeProjectPath(options.paths, crawlPath),
        rootSelector,
        snapshotHash: artifacts.snapshotHash,
        sections: sectionEntries.map((section) => ({
          id: createSectionId(sectionIdForSurface(section.id)),
          depth: section.depth,
          selector: section.selector,
          surfaceIds: section.surfaceIds.map((surfaceId) => createSurfaceId(surfaceId)),
          elementIds: section.elementIds.map((elementId) => createElementId(elementId)),
        })),
        surfaces: artifacts.report.surfaces.map((surface) => ({
          id: createSurfaceId(surface.id),
          targetRef: createCanonicalTargetRef(`target:surface:${screenId}:${createSurfaceId(surface.id)}`),
          section: createSectionId(sectionIdForSurface(surface.id)),
          selector: surface.selector,
          role: surface.role,
          name: surface.name,
          kind: surface.kindSuggestion,
          assertions: surface.assertions,
          testId: surface.testId,
        })),
        elements: artifacts.report.elements.map((element) => ({
          id: createElementId(element.id),
          targetRef: createCanonicalTargetRef(`target:element:${screenId}:${createElementId(element.id)}`),
          surface: createSurfaceId(element.surfaceId),
          selector: element.selector,
          role: element.role,
          name: element.name,
          testId: element.testId,
          widget: element.widgetSuggestion,
          required: element.required,
          locatorHint: element.locatorHint,
          locatorCandidates: element.locatorCandidates,
        })),
        snapshotAnchors: [],
        targets,
        reviewNotes: artifacts.report.reviewNotes,
        selectorProbes,
        stateObservations: [],
        eventCandidates: [],
        transitionObservations: [],
        observationDiffs: [],
        graphDeltas: {
          nodeIds: targets.map((target) => target.graphNodeId),
          edgeIds: [],
        },
      };

      writeFileSync(crawlPath, `${JSON.stringify(discoveryRun, null, 2)}\n`, 'utf8');

      return {
        screen,
        url: options.url,
        rootSelector,
        snapshotPath,
        hashPath,
        reportPath,
        surfaceScaffoldPath,
        elementsScaffoldPath,
        sectionsIndexPath,
        crawlPath,
        snapshotHash: artifacts.snapshotHash,
        reviewNotes: artifacts.report.reviewNotes,
      };
    } finally {
      if (ownsBrowser) {
        await browser.close();
      }
    }
  }, 'discover-command-failed', `Unable to discover scaffolds for ${options.url}`);
}
