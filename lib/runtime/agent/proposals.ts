import { knowledgePaths } from '../../domain/ids';
import type { InterfaceResolutionContext, ResolutionProposalDraft, GroundedStep, StepTaskElementCandidate, StepTaskScreenCandidate } from '../../domain/types';
import type { IntentInterpretation, InterpretationSource } from './types';

export function proposalForSupplementGap(task: GroundedStep, screen: StepTaskScreenCandidate, element: StepTaskElementCandidate): ResolutionProposalDraft[] {
  return [{
    artifactType: 'hints',
    targetPath: knowledgePaths.hints(screen.screen),
    title: `Capture phrasing for step ${task.index}`,
    patch: {
      screen: screen.screen,
      element: element.element,
      alias: task.actionText,
    },
    rationale: 'Runtime resolved the step through live DOM after approved knowledge exhausted its deterministic priors.',
  }];
}

// ─── WP4: Interpretation-Based Proposal Generation ───

const RATIONALE_BY_SOURCE: Record<InterpretationSource, string> = {
  'knowledge-heuristic': 'Runtime heuristic matched step intent to knowledge — proposing hint alias to stabilize future resolution.',
  'knowledge-translation': 'LLM translation matched step intent to knowledge — proposing hint alias to make future resolution deterministic.',
  'dom-exploration': 'Live DOM exploration discovered element — proposing hint alias to avoid DOM exploration in future runs.',
};

/**
 * Generate knowledge proposals from a successful runtime interpretation.
 *
 * When the runtime interpreter resolves a step through translation or DOM,
 * it proposes hint additions that would make future runs resolve deterministically
 * at the heuristic level (cheaper, faster, no LLM tokens needed).
 */
export function proposalsFromInterpretation(
  task: GroundedStep,
  interpretation: IntentInterpretation,
  resolutionContext: InterfaceResolutionContext,
): readonly ResolutionProposalDraft[] {
  // Only propose when interpretation found a screen
  if (!interpretation.interpretedScreen) {
    return [];
  }

  const screen = resolutionContext.screens.find(
    (entry) => entry.screen === interpretation.interpretedScreen,
  );
  if (!screen) {
    return [];
  }

  const rationale = RATIONALE_BY_SOURCE[interpretation.source];

  // Propose hint alias when element was interpreted
  const elementProposal: ResolutionProposalDraft[] = (() => {
    if (!interpretation.interpretedElement) return [];
    const element = screen.elements.find(
      (entry) => entry.element === interpretation.interpretedElement,
    );
    if (element && !element.aliases.includes(task.actionText)) {
      return [{
        artifactType: 'hints' as const,
        targetPath: knowledgePaths.hints(screen.screen),
        title: `Add alias from ${interpretation.source} interpretation (step ${task.index})`,
        patch: {
          screen: screen.screen,
          element: element.element,
          alias: task.actionText,
          source: interpretation.source,
        },
        rationale,
      }];
    }
    return [];
  })();

  // Propose screen alias when screen was interpreted but not via approved knowledge
  const screenAliasProposal: ResolutionProposalDraft[] = (() => {
    if (interpretation.source === 'knowledge-heuristic') return [];
    const screenAliasCandidate = task.actionText.toLowerCase().trim();
    const existingScreenAliases = [screen.screen, ...screen.screenAliases].map(
      (alias) => alias.toLowerCase(),
    );
    if (!existingScreenAliases.includes(screenAliasCandidate)) {
      return [{
        artifactType: 'hints' as const,
        targetPath: knowledgePaths.hints(screen.screen),
        title: `Add screen alias from ${interpretation.source} interpretation (step ${task.index})`,
        patch: {
          screen: screen.screen,
          screenAlias: task.actionText,
          source: interpretation.source,
        },
        rationale,
      }];
    }
    return [];
  })();

  const proposals: ResolutionProposalDraft[] = [...elementProposal, ...screenAliasProposal];

  return proposals;
}

/**
 * Generate proposals when a step falls to needs-human.
 *
 * Describes the knowledge gap that prevented deterministic resolution:
 * - If screen was matched but element wasn't → propose element alias on first element
 * - If screen wasn't matched → propose screen alias
 * - Always propose the action-text-to-element mapping when both are known
 *
 * Proposals must use the standard patch format: `{ screen, element, alias }` for hints,
 * so that `applyHintsPatch` can apply them correctly during activation.
 */
export function proposalsForNeedsHuman(
  task: GroundedStep,
  screen: StepTaskScreenCandidate | null,
  element: StepTaskElementCandidate | null,
  resolutionContext: InterfaceResolutionContext,
): ResolutionProposalDraft[] {
  const proposals: ResolutionProposalDraft[] = [];

  if (screen && !element && screen.elements.length > 0) {
    // Screen matched but element didn't — propose alias on the first element as a candidate.
    // The activation pipeline can apply this; the operator reviews which element is correct.
    const candidateElement = screen.elements[0];
    proposals.push({
      artifactType: 'hints',
      targetPath: knowledgePaths.hints(screen.screen),
      title: `Add element alias for unresolved step ${task.index}`,
      patch: {
        screen: screen.screen,
        element: candidateElement.element,
        alias: task.actionText,
      },
      rationale: `Screen "${screen.screen}" was matched but no element alias matched the action text "${task.actionText}". Proposing alias on candidate element "${candidateElement.element}".`,
    });
  } else if (!screen && resolutionContext.screens.length > 0) {
    // No screen matched — propose element alias on the first screen's first element.
    // This creates an activatable proposal that the operator can review.
    const candidateScreen = resolutionContext.screens[0];
    if (candidateScreen.elements.length > 0) {
      const candidateElement = candidateScreen.elements[0];
      proposals.push({
        artifactType: 'hints',
        targetPath: knowledgePaths.hints(candidateScreen.screen),
        title: `Add alias for unresolved step ${task.index} (no screen matched)`,
        patch: {
          screen: candidateScreen.screen,
          element: candidateElement.element,
          alias: task.actionText,
        },
        rationale: `No screen alias matched the action text "${task.actionText}". Proposing alias on screen "${candidateScreen.screen}" element "${candidateElement.element}" as a starting point.`,
      });
    }
  }

  if (screen && element) {
    // Both matched but something else failed (e.g., snapshot) — propose alias for traceability
    proposals.push({
      artifactType: 'hints',
      targetPath: knowledgePaths.hints(screen.screen),
      title: `Capture phrasing gap for step ${task.index}`,
      patch: {
        screen: screen.screen,
        element: element.element,
        alias: task.actionText,
      },
      rationale: `Screen and element matched but resolution was incomplete. Action text: "${task.actionText}".`,
    });
  }

  return proposals;
}

export function applyProposalDraftsToRuntimeContext(
  resolutionContext: InterfaceResolutionContext,
  proposalDrafts: readonly ResolutionProposalDraft[],
): void {
  for (const proposal of proposalDrafts) {
    if (proposal.artifactType !== 'hints') {
      continue;
    }
    const screenId = typeof proposal.patch.screen === 'string' ? proposal.patch.screen : null;
    const elementId = typeof proposal.patch.element === 'string' ? proposal.patch.element : null;
    const alias = typeof proposal.patch.alias === 'string' ? proposal.patch.alias : null;
    if (!screenId || !elementId || !alias) {
      continue;
    }

    const screen = resolutionContext.screens.find((entry) => entry.screen === screenId) ?? null;
    const element = screen?.elements.find((entry) => entry.element === elementId) ?? null;
    if (!element) {
      continue;
    }
    if (!element.aliases.includes(alias)) {
      (element as { aliases: readonly string[] }).aliases = [...element.aliases, alias].sort((left, right) => left.localeCompare(right));
    }
  }
}
