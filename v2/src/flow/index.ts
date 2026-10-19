/**
 * flow/: recorded flows. The recorder turns a path walked once (by a QA in
 * a headed browser, or by an agent's app.act calls) into candidate facets
 * and a deterministic recording; the runner replays a recording with no
 * model in the loop; persistFlow writes the recording and renders
 * flows/<name>.ts with the page objects it uses.
 */
export {
  startRecording,
  recordFlow,
  recorderReady,
  waitForRecording,
  isRecording,
  displayNameOf,
  candidateFromDescriptor,
  screenFor,
  DEFAULT_RECORD_TIMEOUT_MS,
  NAVIGATION_GRACE_MS,
  URL_CHANGE_GRACE_MS,
} from './recorder.js';
export type { RecordOptions, RecordedFlow, RecordingSession, StopOn, StopReason } from './recorder.js';

export { runFlow, resolveFlowParams, requireBaseUrl, DEFAULT_STEP_TIMEOUT_MS } from './runner.js';
export type { RunFlowOptions, FlowRunResult, FlowStepResult } from './runner.js';

export { persistFlow, emitRouteOf, emitCatalogs, screensOf } from './render.js';
export type { PersistedFlow, PersistOptions } from './render.js';

export {
  FLOW_NAME,
  assertFlowName,
  recordingFile,
  recordingPathOf,
  loadRecording,
  saveRecording,
  appendStep,
  displayValue,
  relativeToBase,
  routeUrlOf,
  absoluteUrl,
  pathOf,
  samePath,
  relativeUrls,
  isAbsoluteUrl,
  isWebUrl,
  EMPTY_DRAFT,
} from './recording.js';
export type { RecordingDraft, StepInput, Appended } from './recording.js';

export { RECORDER_SCRIPT, RECORDER_GLOBAL, RECORDER_BINDING, IGNORE_ATTRIBUTE, FILL_IDLE_MS, recorderCall } from './in-page.js';
export { RecorderMessageSchema, ActionEventSchema, DescriptorSchema, LocateResultSchema } from './events.js';
export type { ActionEvent, Descriptor, RecorderConfig, LocateResult, RecordedAction } from './events.js';
