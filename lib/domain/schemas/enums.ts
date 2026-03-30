import { Schema } from 'effect';

// ─── Workflow vocabulary ───

export const scenarioStatuses = ['stub', 'draft', 'active', 'needs-repair', 'blocked', 'deprecated'] as const;
export const ScenarioStatusSchema = Schema.Literal(...scenarioStatuses);

export const stepActions = ['navigate', 'input', 'click', 'assert-snapshot', 'custom'] as const;
export const StepActionSchema = Schema.Literal(...stepActions);

export const confidences = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only', 'unbound'] as const;
export const ConfidenceSchema = Schema.Literal(...confidences);

export const executionProfiles = ['interactive', 'ci-batch', 'dogfood'] as const;
export const ExecutionProfileSchema = Schema.Literal(...executionProfiles);

export const participantKinds = ['agent', 'operator', 'system', 'benchmark-runner', 'reviewer', 'optimizer'] as const;
export const ParticipantKindSchema = Schema.Literal(...participantKinds);

export const participantCapabilities = [
  'orient-workspace',
  'inspect-artifacts',
  'discover-surfaces',
  'record-observations',
  'propose-fragments',
  'approve-proposals',
  'reject-proposals',
  'request-reruns',
  'review-execution',
  'run-benchmarks',
  'replay-runs',
  'optimize-pipeline',
] as const;
export const ParticipantCapabilitySchema = Schema.Literal(...participantCapabilities);

export const resolutionModes = ['deterministic', 'translation', 'agentic'] as const;
export const ResolutionModeSchema = Schema.Literal(...resolutionModes);

export const interventionKinds = [
  'orientation',
  'artifact-inspection',
  'discovery-request',
  'observation-recorded',
  'spec-fragment-proposed',
  'proposal-approved',
  'proposal-rejected',
  'rerun-requested',
  'execution-reviewed',
  'benchmark-action',
  'replay-action',
  'operator-action',
  'self-improvement-action',
] as const;
export const InterventionKindSchema = Schema.Literal(...interventionKinds);

export const interventionCommandActionKinds = ['approve-proposal', 'promote-pattern', 'rerun-scope', 'suppress-hotspot'] as const;
export const InterventionCommandActionKindSchema = Schema.Literal(...interventionCommandActionKinds);

export const interventionStatuses = ['planned', 'completed', 'blocked', 'skipped'] as const;
export const InterventionStatusSchema = Schema.Literal(...interventionStatuses);

export const interventionTargetKinds = [
  'workspace',
  'suite',
  'scenario',
  'run',
  'step',
  'artifact',
  'graph-node',
  'selector',
  'proposal',
  'knowledge',
  'session',
  'benchmark',
  'codebase',
] as const;
export const InterventionTargetKindSchema = Schema.Literal(...interventionTargetKinds);

export const interventionEffectKinds = [
  'artifact-inspected',
  'artifact-written',
  'proposal-generated',
  'proposal-reviewed',
  'proposal-applied',
  'rerun-requested',
  'benchmark-scored',
  'replay-recorded',
  'learning-read',
  'execution-reviewed',
  'signal-emitted',
  'no-op',
] as const;
export const InterventionEffectKindSchema = Schema.Literal(...interventionEffectKinds);

export const valueRefKinds = ['literal', 'fixture-path', 'posture-sample', 'parameter-row', 'generated-token'] as const;
export const ValueRefKindSchema = Schema.Literal(...valueRefKinds);

export const stepInstructionKinds = ['navigate', 'enter', 'invoke', 'observe-structure', 'custom-escape-hatch'] as const;
export const StepInstructionKindSchema = Schema.Literal(...stepInstructionKinds);

export const surfaceKinds = ['screen-root', 'form', 'action-cluster', 'validation-region', 'result-set', 'details-pane', 'modal', 'section-root'] as const;
export const SurfaceKindSchema = Schema.Literal(...surfaceKinds);

export const assertionKinds = ['state', 'structure'] as const;
export const AssertionKindSchema = Schema.Literal(...assertionKinds);

export const effectTargetKinds = ['self', 'element', 'surface'] as const;
export const EffectTargetKindSchema = Schema.Literal(...effectTargetKinds);

export const governanceStates = ['approved', 'review-required', 'blocked'] as const;
export const GovernanceSchema = Schema.Literal(...governanceStates);

export const certificationStates = ['uncertified', 'certified'] as const;
export const CertificationStatusSchema = Schema.Literal(...certificationStates);

export const locatorStrategyKinds = ['test-id', 'role-name', 'css'] as const;
export const LocatorStrategyKindSchema = Schema.Literal(...locatorStrategyKinds);

export const effectStates = ['validation-error', 'required-error', 'disabled', 'enabled', 'visible', 'hidden'] as const;
export const EffectStateSchema = Schema.Literal(...effectStates);

export const widgetActions = ['click', 'fill', 'clear', 'get-value'] as const;
export const WidgetActionSchema = Schema.Literal(...widgetActions);

export const widgetPreconditions = ['visible', 'enabled', 'editable'] as const;
export const WidgetPreconditionSchema = Schema.Literal(...widgetPreconditions);

export const widgetEffectCategories = ['mutation', 'observation', 'focus', 'navigation'] as const;
export const WidgetEffectCategorySchema = Schema.Literal(...widgetEffectCategories);

export const graphNodeKinds = ['snapshot', 'screen', 'screen-hints', 'pattern', 'confidence-overlay', 'dataset', 'resolution-control', 'runbook', 'section', 'surface', 'element', 'posture', 'capability', 'scenario', 'step', 'generated-spec', 'generated-trace', 'generated-review', 'evidence', 'policy-decision', 'participant', 'intervention', 'improvement-run', 'acceptance-decision'] as const;
export const GraphNodeKindSchema = Schema.Literal(...graphNodeKinds);

export const graphEdgeKinds = ['derived-from', 'contains', 'references', 'uses', 'learns-from', 'affects', 'asserts', 'emits', 'observed-by', 'proposed-change-for', 'governs', 'drifts-to'] as const;
export const GraphEdgeKindSchema = Schema.Literal(...graphEdgeKinds);

export const diagnosticSeverities = ['info', 'warn', 'error'] as const;
export const DiagnosticSeveritySchema = Schema.Literal(...diagnosticSeverities);

export const diagnosticConfidences = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only', 'unbound', 'mixed'] as const;
export const DiagnosticConfidenceSchema = Schema.Literal(...diagnosticConfidences);

export const workflowStages = ['preparation', 'resolution', 'execution', 'evidence', 'proposal', 'projection'] as const;
export const WorkflowStageSchema = Schema.Literal(...workflowStages);

export const workflowScopes = ['scenario', 'step', 'run', 'suite', 'workspace', 'control'] as const;
export const WorkflowScopeSchema = Schema.Literal(...workflowScopes);

export const workflowLanes = ['intent', 'knowledge', 'control', 'resolution', 'execution', 'governance', 'projection'] as const;
export const WorkflowLaneSchema = Schema.Literal(...workflowLanes);

export const stepWinningSources = ['scenario-explicit', 'resolution-control', 'runbook-dataset', 'default-dataset', 'knowledge-hint', 'posture-sample', 'generated-token', 'approved-knowledge', 'approved-equivalent', 'prior-evidence', 'structured-translation', 'live-dom', 'none'] as const;
export const StepWinningSourceSchema = Schema.Literal(...stepWinningSources);

export const statePredicateSemantics = ['visible', 'hidden', 'enabled', 'disabled', 'valid', 'invalid', 'open', 'closed', 'expanded', 'collapsed', 'populated', 'cleared', 'active-route', 'active-modal'] as const;
export const StatePredicateSemanticSchema = Schema.Literal(...statePredicateSemantics);

export const transitionEffectKinds = ['reveal', 'hide', 'enable', 'disable', 'validate', 'invalidate', 'open', 'close', 'navigate', 'return', 'expand', 'collapse', 'populate', 'clear'] as const;
export const TransitionEffectKindSchema = Schema.Literal(...transitionEffectKinds);

export const patternActionNames = ['navigate', 'input', 'click', 'assert-snapshot'] as const;
export const PatternActionNameSchema = Schema.Literal(...patternActionNames);

export const stepBindingKinds = ['bound', 'deferred', 'unbound'] as const;
export const StepBindingKindSchema = Schema.Literal(...stepBindingKinds);

export const runtimeInterpreterModes = ['playwright', 'dry-run', 'diagnostic'] as const;
export const RuntimeInterpreterModeSchema = Schema.Literal(...runtimeInterpreterModes);

export const writeModes = ['persist', 'no-write'] as const;
export const WriteModeSchema = Schema.Literal(...writeModes);

export const knowledgePostures = ['cold-start', 'warm-start', 'production'] as const;
export const KnowledgePostureSchema = Schema.Literal(...knowledgePostures);

export const trustPolicyArtifactTypes = ['elements', 'postures', 'surface', 'snapshot', 'hints', 'patterns', 'routes'] as const;
export const TrustPolicyArtifactTypeSchema = Schema.Literal(...trustPolicyArtifactTypes);

export const trustPolicyDecisions = ['allow', 'review', 'deny'] as const;
export const TrustPolicyDecisionSchema = Schema.Literal(...trustPolicyDecisions);

export const scenarioLifecycles = ['normal', 'fixme', 'skip', 'fail'] as const;
export const ScenarioLifecycleSchema = Schema.Literal(...scenarioLifecycles);

export const capabilityNames = ['navigate', 'enter', 'invoke', 'observe-structure', 'observe-state', 'custom-escape-hatch'] as const;
export const CapabilityNameSchema = Schema.Literal(...capabilityNames);

export const stepProvenanceKinds = ['explicit', 'approved-knowledge', 'live-exploration', 'unresolved'] as const;
export const StepProvenanceKindSchema = Schema.Literal(...stepProvenanceKinds);

// Recovery strategies
export const recoveryStrategyIds = ['verify-prerequisites', 'execute-prerequisite-actions', 'force-alternate-locator-rungs', 'snapshot-guided-reresolution', 'bounded-retry-with-backoff', 'refresh-runtime'] as const;
export const RecoveryStrategyIdSchema = Schema.Literal(...recoveryStrategyIds);

export const failureFamilies = ['precondition-failure', 'locator-degradation-failure', 'environment-runtime-failure'] as const;
export const FailureFamilySchema = Schema.Literal(...failureFamilies);

// Operator inbox
export const operatorInboxItemKinds = ['proposal', 'degraded-locator', 'needs-human', 'blocked-policy', 'approved-equivalent', 'recovery'] as const;
export const OperatorInboxItemKindSchema = Schema.Literal(...operatorInboxItemKinds);
