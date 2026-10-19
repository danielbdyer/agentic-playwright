/**
 * Input and output shapes of the emission library. Facets, routes, test cases,
 * resolved steps and handoffs are the contract's own types; the shapes here
 * only group them the way the renderers need them.
 */
import type { Facet, Handoff, ResolvedStep, ScreenRoute, TestCase } from '../contract/schemas.js';

/** Where emitted files live, relative to the workspace root (POSIX). */
export interface EmitLayout {
  readonly testsDir: string;
  readonly pagesDir: string;
  readonly flowsDir: string;
}

export const DEFAULT_LAYOUT: EmitLayout = { testsDir: 'tests', pagesDir: 'pages', flowsDir: 'flows' };

/**
 * A screen's route. `landmarks` (from the page fingerprint the route was
 * observed with) is optional; when it lists "main", `goto()` waits for the
 * main landmark. The contract's ScreenRoute does not carry it yet.
 */
export type EmitRoute = ScreenRoute & { readonly landmarks?: readonly string[] };

/** One screen's slice of memory, as emission needs it. */
export interface ScreenCatalog {
  readonly screen: string;
  readonly route: EmitRoute | null;
  /** Every facet of the screen in catalog order (retired ones are skipped by emission). */
  readonly facets: readonly Facet[];
}

/** A recorded flow parameter. Secret parameters are never written to disk; specs read them from TESSERACT_PARAM_<NAME>. */
export interface FlowParam {
  readonly name: string;
  readonly secret: boolean;
  readonly default?: string;
}

export type FlowValue = { readonly literal: string } | { readonly param: string; readonly secret?: boolean };

export interface FlowRecordingStep {
  readonly index: number;
  /** navigate | click | fill | select | check | uncheck | press | hover */
  readonly action: string;
  readonly facetId?: string;
  readonly screen: string;
  readonly value?: FlowValue;
  readonly url: string;
}

/** The recording flow.record writes to .tesseract/flows/<name>.json, as a plain object. */
export interface FlowRecording {
  readonly name: string;
  readonly steps: readonly FlowRecordingStep[];
  readonly params: readonly FlowParam[];
}

/** A flow a spec runs in test.beforeEach, with the literal values for its non-secret parameters. */
export interface FlowUse {
  readonly recording: FlowRecording;
  readonly params?: Readonly<Record<string, string>>;
}

export interface SpecInput {
  readonly testCase: TestCase;
  /** One per ADO step (unresolved steps carry a handoffId). Targets must be facet refs: mint raw locators first. */
  readonly steps: readonly ResolvedStep[];
  /** Catalogs of every screen the steps touch (and of screens their flows touch, for emitTest). */
  readonly catalogs: readonly ScreenCatalog[];
  /** The Handoff records for steps with a handoffId; used to write the fixme reason. */
  readonly handoffs?: readonly Handoff[];
  readonly flows?: readonly FlowUse[];
  /** Subfolder under the tests directory; defaults to the first screen the steps use. */
  readonly area?: string;
  /** Extra tags, merged with the ADO tags. */
  readonly tags?: readonly string[];
  /** Workspace-relative path to write to instead of the derived one (the sticky path of an existing spec). */
  readonly path?: string;
  readonly layout?: EmitLayout;
}

export interface RenderedFile {
  /** Workspace-relative POSIX path. */
  readonly path: string;
  readonly text: string;
}

export interface StepFacets {
  readonly index: number;
  readonly stepIdentifier: string;
  readonly title: string;
  readonly facets: readonly string[];
}

export interface RenderedSpec extends RenderedFile {
  readonly adoId: string;
  /** Facet ids the spec uses, in first-use order. */
  readonly facetsUsed: readonly string[];
  /** Screens whose page objects the spec imports, in first-use order. */
  readonly screens: readonly string[];
  /** Per test.step: the ADO step it renders and the facets it uses (for test.run's step → facet mapping). */
  readonly stepFacets: readonly StepFacets[];
  /** Names of the flows the spec calls in beforeEach. */
  readonly flows: readonly string[];
}

export interface RenderedPageObject extends RenderedFile {
  readonly screen: string;
  readonly className: string;
  /** facet id → member name, for every facet rendered as (or overridden as) a member. */
  readonly members: Readonly<Record<string, string>>;
}

export interface RenderedFlow extends RenderedFile {
  readonly name: string;
  readonly functionName: string;
  readonly screens: readonly string[];
  readonly facetsUsed: readonly string[];
}
