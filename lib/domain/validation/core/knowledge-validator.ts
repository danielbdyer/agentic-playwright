/**
 * Knowledge context validators: WidgetCapabilityContract, ScreenElements, ScreenHints,
 * PatternDocument, SharedPatterns, ScreenPostures, ScreenBehavior,
 * BehaviorPatternDocument, Manifest.
 */
import * as schemaDecode from '../../schemas/decode';
import * as schemas from '../../schemas';
import type { Manifest } from '../../governance/workflow-types';
import type {
  BehaviorPatternDocument,
  EventSignature,
  PatternDocument,
  ScreenBehavior,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SharedPatterns,
  StateNode,
  StateTransition,
} from '../../knowledge/types';
import type { WidgetCapabilityContract } from '../../knowledge/widget-types';
import { validatePatternDocument as validatePatternDocumentRecord } from '../../knowledge/patterns';
import { normalizeScreenPostures } from '../../governance/posture-contract';
import { SchemaError } from '../../kernel/errors';
import { uniqueSorted } from '../../kernel/collections';
import { ensureSafeRelativePathLike } from '../../kernel/identity';
import { validateElement } from './shared';

export function validateWidgetCapabilityContractArtifact(value: unknown, path = 'widget-contract'): WidgetCapabilityContract {
  const decoded = schemaDecode.decoderFor<WidgetCapabilityContract>(schemas.WidgetCapabilityContractSchema)(value);
  for (const action of Object.keys(decoded.sideEffects)) {
    if (!decoded.supportedActions.includes(action as typeof decoded.supportedActions[number])) {
      throw new SchemaError(`sideEffects references unsupported action ${action}`, `${path}.sideEffects.${action}`);
    }
  }
  for (const action of decoded.supportedActions) {
    if (!decoded.sideEffects[action]) {
      throw new SchemaError(`missing side-effect semantics for action ${action}`, `${path}.sideEffects`);
    }
  }
  return decoded;
}

export function validateScreenElementsArtifact(value: unknown): ScreenElements {
  const decoded = schemaDecode.decoderFor<ScreenElements>(schemas.ScreenElementsSchema)(value);
  return {
    ...decoded,
    elements: Object.fromEntries(
      Object.entries(decoded.elements).map(([elementId, element]) => [
        elementId,
        validateElement(element, `elements.${elementId}`),
      ]),
    ),
  };
}

export function validateScreenHintsArtifact(value: unknown): ScreenHints {
  const decoded = schemaDecode.decoderFor<ScreenHints>(schemas.ScreenHintsSchema)(value);
  return {
    ...decoded,
    screenAliases: uniqueSorted(decoded.screenAliases),
    elements: Object.fromEntries(
      Object.entries(decoded.elements).map(([elementId, hint]) => [
        elementId,
        {
          ...hint,
          aliases: uniqueSorted(hint.aliases),
          snapshotAliases: hint.snapshotAliases
            ? Object.fromEntries(
                Object.entries(hint.snapshotAliases).map(([snapshotId, aliases]) => [
                  ensureSafeRelativePathLike(snapshotId, `screen-hints.elements.${elementId}.snapshotAliases.${snapshotId}`),
                  uniqueSorted(aliases),
                ]),
              )
            : undefined,
        },
      ]),
    ),
  };
}

export function validatePatternDocumentArtifact(value: unknown): PatternDocument {
  return validatePatternDocumentRecord(value);
}

export function validateSharedPatternsArtifact(value: unknown): SharedPatterns {
  const decoded = schemaDecode.decoderFor<SharedPatterns>(schemas.MergedPatternsSchema)(value);
  const requiredActions = ['navigate', 'input', 'click', 'assert-snapshot'] as const;
  for (const action of requiredActions) {
    if (!decoded.actions[action]) {
      throw new SchemaError(`missing required action ${action}`, 'shared-patterns.actions');
    }
  }
  return decoded;
}

export function validateScreenPosturesArtifact(value: unknown): ScreenPostures {
  const decoded = schemaDecode.decoderFor<ScreenPostures>(schemas.ScreenPosturesSchema)(value);
  return normalizeScreenPostures(decoded);
}

function assertBehaviorTopology(input: {
  stateNodes: readonly StateNode[];
  eventSignatures: readonly EventSignature[];
  transitions: readonly StateTransition[];
  path: string;
}): void {
  const stateRefs = new Set(input.stateNodes.map((state) => state.ref));
  const eventRefs = new Set(input.eventSignatures.map((event) => event.ref));
  const transitionByRef = new Map(input.transitions.map((transition) => [transition.ref, transition] as const));

  for (const [index, state] of input.stateNodes.entries()) {
    if (state.predicates.length === 0) {
      throw new SchemaError('expected at least one observation predicate', `${input.path}.stateNodes[${index}].predicates`);
    }
  }

  for (const [index, event] of input.eventSignatures.entries()) {
    if (event.effects.transitionRefs.length === 0) {
      throw new SchemaError('expected at least one transition ref', `${input.path}.eventSignatures[${index}].effects.transitionRefs`);
    }
    if (event.effects.resultStateRefs.length === 0) {
      throw new SchemaError('expected at least one result state ref', `${input.path}.eventSignatures[${index}].effects.resultStateRefs`);
    }
    if (event.effects.assertions.length === 0) {
      throw new SchemaError('expected at least one assertion', `${input.path}.eventSignatures[${index}].effects.assertions`);
    }
    if (event.observationPlan.observeStateRefs.length === 0) {
      throw new SchemaError('expected at least one observed state ref', `${input.path}.eventSignatures[${index}].observationPlan.observeStateRefs`);
    }
    for (const [transitionIndex, transitionRef] of event.effects.transitionRefs.entries()) {
      if (!transitionByRef.has(transitionRef)) {
        throw new SchemaError('references unknown transition', `${input.path}.eventSignatures[${index}].effects.transitionRefs[${transitionIndex}]`);
      }
    }
    for (const [stateIndex, stateRef] of [...event.requiredStateRefs, ...event.forbiddenStateRefs, ...event.effects.resultStateRefs, ...event.observationPlan.observeStateRefs].entries()) {
      if (!stateRefs.has(stateRef)) {
        throw new SchemaError('references unknown state', `${input.path}.eventSignatures[${index}].stateRefs[${stateIndex}]`);
      }
    }

    const expectedResultStateRefs = uniqueSorted(event.effects.transitionRefs.flatMap((transitionRef) => transitionByRef.get(transitionRef)?.targetStateRefs ?? []));
    if (expectedResultStateRefs.join('|') !== uniqueSorted(event.effects.resultStateRefs).join('|')) {
      throw new SchemaError('effect resultStateRefs must equal the union of referenced transition target states', `${input.path}.eventSignatures[${index}].effects.resultStateRefs`);
    }
  }

  for (const [index, transition] of input.transitions.entries()) {
    if (!eventRefs.has(transition.eventSignatureRef)) {
      throw new SchemaError('references unknown event signature', `${input.path}.transitions[${index}].eventSignatureRef`);
    }
    if (transition.targetStateRefs.length === 0) {
      throw new SchemaError('expected at least one target state ref', `${input.path}.transitions[${index}].targetStateRefs`);
    }
    for (const [stateIndex, stateRef] of [...transition.sourceStateRefs, ...transition.targetStateRefs].entries()) {
      if (!stateRefs.has(stateRef)) {
        throw new SchemaError('references unknown state', `${input.path}.transitions[${index}].stateRefs[${stateIndex}]`);
      }
    }
  }
}

export function validateScreenBehaviorArtifact(value: unknown): ScreenBehavior {
  const validated = schemaDecode.decoderFor<ScreenBehavior>(schemas.ScreenBehaviorSchema)(value);
  assertBehaviorTopology({ ...validated, path: 'screen-behavior' });
  return validated;
}

export function validateBehaviorPatternDocumentArtifact(value: unknown): BehaviorPatternDocument {
  const validated = schemaDecode.decoderFor<BehaviorPatternDocument>(schemas.BehaviorPatternDocumentSchema)(value);
  assertBehaviorTopology({ ...validated, path: 'behavior-pattern' });
  return validated;
}

export const validateManifestArtifact: (value: unknown) => Manifest =
  schemaDecode.decoderFor<Manifest>(schemas.ManifestSchema);
