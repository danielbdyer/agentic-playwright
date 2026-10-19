/**
 * Emission: plain Playwright specs, page objects and flows from ADO test
 * cases, resolved steps and the facet catalog — regenerated without ever
 * discarding a human's kept code. Used by the test.emit and flow.record
 * handlers; nothing here touches a browser or memory.
 *
 *   renderSpec / renderPageObject / renderFlow  pure renderers → { path, text, … }
 *   mergeWithExisting / mergeTexts               keep regions, orphans, hand-edit detection
 *   unifiedDiff                                  what regeneration changes
 *   emitFiles / emitTest                         read, merge, write atomically
 */
export type {
  EmitLayout,
  EmitRoute,
  FlowParam,
  FlowRecording,
  FlowRecordingStep,
  FlowUse,
  FlowValue,
  RenderedFile,
  RenderedFlow,
  RenderedPageObject,
  RenderedSpec,
  ScreenCatalog,
  SpecInput,
  StepFacets,
} from './types.js';
export { DEFAULT_LAYOUT } from './types.js';
export { renderSpec } from './spec.js';
export { renderPageObject, renderOverridesScaffold, overriddenMembers, overridesClassName, routeUrl } from './page-object.js';
export type { PageObjectOptions } from './page-object.js';
export { navigationPath, renderFlow } from './flow.js';
export type { FlowOptions } from './flow.js';
export {
  checkGenerated,
  generatedHash,
  mergeTexts,
  mergeWithExisting,
  parseAdoSteps,
  sameGeneratedContent,
  stampHash,
} from './keep.js';
export type { GeneratedCheck, MergeOptions, MergeResult } from './keep.js';
export { unifiedDiff } from './diff.js';
export { emitFiles, emitTest, layoutOf, loadOverrides, locateSpec } from './files.js';
export type { EmitFilesInput, EmitFilesOptions, EmitFilesResult, EmitTestInput, EmitTestResult, EmittedFile } from './files.js';
export {
  flowFilePath,
  flowFunctionName,
  flowParamIdentifiers,
  memberTable,
  overridesPath,
  pageClassName,
  pageObjectPath,
  paramEnvName,
  sanitizeTag,
  specPath,
} from './naming.js';
export type { MemberInfo } from './naming.js';
