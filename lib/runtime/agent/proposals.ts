import { knowledgePaths } from '../../domain/kernel/ids';
import { decomposeIntent } from '../../domain/knowledge/inference';
import { ACTION_SYNONYMS } from '../../domain/widgets/role-affordances';
import type { InterfaceResolutionContext, ResolutionProposalDraft, GroundedStep, StepTaskElementCandidate, StepTaskScreenCandidate } from '../../domain/types';
import type { IntentInterpretation, InterpretationSource } from './types';

function enrichedPatch(screen: string, element: StepTaskElementCandidate, alias: string): Record<string, unknown> {
  return {
    screen,
    element: element.element,
    alias,
    ...(element.role ? { role: element.role } : {}),
    ...(element.widget ? { widget: String(element.widget) } : {}),
    ...(element.locator && element.locator.length > 0 ? { locator: element.locator } : {}),
  };
}

export function proposalForSupplementGap(task: GroundedStep, screen: StepTaskScreenCandidate, element: StepTaskElementCandidate): ResolutionProposalDraft[] {
  return [{
    artifactType: 'hints',
    targetPath: knowledgePaths.hints(screen.screen),
    title: `Capture phrasing for step ${task.index}`,
    patch: enrichedPatch(screen.screen, element, task.actionText),
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

  // E2: Synonym-expanded proposals — when we learn "enter search field" → element,
  // also propose "type search field", "input search field", etc.
  const synonymProposals: ResolutionProposalDraft[] = elementProposal.length > 0 && screen
    ? proposalsForSynonymExpansion(task, screen, screen.elements.find(
        (e) => e.element === interpretation.interpretedElement,
      )!, task.actionText)
    : [];

  const proposals: ResolutionProposalDraft[] = [...elementProposal, ...screenAliasProposal, ...synonymProposals];

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
  // Cold-start fallback: when no screens exist in knowledge, emit a discovery
  // proposal so the learning loop has something to activate in subsequent iterations.
  if (!screen && resolutionContext.screens.length === 0) {
    return proposalsForColdStartDiscovery(task);
  }

  const screenNoElement: readonly ResolutionProposalDraft[] =
    screen && !element && screen.elements.length > 0
      ? [{
          artifactType: 'hints' as const,
          targetPath: knowledgePaths.hints(screen.screen),
          title: `Add element alias for unresolved step ${task.index}`,
          patch: enrichedPatch(screen.screen, screen.elements[0]!, task.actionText),
          rationale: `Screen "${screen.screen}" was matched but no element alias matched the action text "${task.actionText}". Proposing alias on candidate element "${screen.elements[0]!.element}".`,
        }]
      : !screen && resolutionContext.screens.length > 0 && resolutionContext.screens[0]!.elements.length > 0
        ? [{
            artifactType: 'hints' as const,
            targetPath: knowledgePaths.hints(resolutionContext.screens[0]!.screen),
            title: `Add alias for unresolved step ${task.index} (no screen matched)`,
            patch: enrichedPatch(resolutionContext.screens[0]!.screen, resolutionContext.screens[0]!.elements[0]!, task.actionText),
            rationale: `No screen alias matched the action text "${task.actionText}". Proposing alias on screen "${resolutionContext.screens[0]!.screen}" element "${resolutionContext.screens[0]!.elements[0]!.element}" as a starting point.`,
          }]
        : [];

  const bothMatched: readonly ResolutionProposalDraft[] =
    screen && element
      ? [{
          artifactType: 'hints' as const,
          targetPath: knowledgePaths.hints(screen.screen),
          title: `Capture phrasing gap for step ${task.index}`,
          patch: enrichedPatch(screen.screen, element, task.actionText),
          rationale: `Screen and element matched but resolution was incomplete. Action text: "${task.actionText}".`,
        }]
      : [];

  return [...screenNoElement, ...bothMatched];
}

/**
 * Generate alias-stabilization proposals when a step resolves deterministically
 * through Rungs 3-6 (approved knowledge, semantic dictionary, overlay, translation).
 *
 * If the step's action text is not already an alias on the resolved element,
 * propose adding it. This ensures future phrasing variations also resolve
 * deterministically without falling through to expensive interpretation rungs.
 */
export function proposalsForDeterministicResolution(
  task: GroundedStep,
  screen: StepTaskScreenCandidate | null,
  element: StepTaskElementCandidate | null,
  winningSource: string,
): ResolutionProposalDraft[] {
  if (!screen || !element) return [];
  const alias = task.actionText?.trim();
  if (!alias) return [];
  // Don't propose if the alias is already known
  if (element.aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) return [];
  return [{
    artifactType: 'hints',
    targetPath: knowledgePaths.hints(screen.screen),
    title: `Stabilize alias from ${winningSource} resolution (step ${task.index})`,
    patch: {
      screen: screen.screen,
      element: element.element,
      alias,
      source: winningSource,
    },
    rationale: `Step resolved deterministically via ${winningSource} but the action text "${alias}" is not yet a known alias. Adding it prevents future phrasing drift from falling through to more expensive resolution rungs.`,
  }];
}

/**
 * Generate supplementary proposals for partially-resolved steps.
 *
 * When a screen matches and multiple elements are candidates but none
 * matched confidently, propose aliases for the top candidates. This increases
 * the learning loop's yield: future runs can resolve these steps deterministically.
 */
export function proposalsForPartialResolution(
  task: GroundedStep,
  screen: StepTaskScreenCandidate | null,
  topCandidates: readonly StepTaskElementCandidate[],
): ResolutionProposalDraft[] {
  if (!screen || topCandidates.length === 0) return [];
  const alias = task.actionText?.trim();
  if (!alias) return [];

  // Only propose for the top candidate (most likely match)
  const best = topCandidates[0]!;
  if (best.aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) return [];

  return [{
    artifactType: 'hints',
    targetPath: knowledgePaths.hints(screen.screen),
    title: `Supplementary alias for ambiguous step ${task.index}`,
    patch: enrichedPatch(screen.screen, best, alias),
    rationale: `Screen "${screen.screen}" matched but element resolution was ambiguous among ${topCandidates.length} candidates. Proposing alias on best candidate "${best.element}" to accelerate convergence.`,
  }];
}

/**
 * Generate discovery proposals when resolution fails with no context (cold-start).
 *
 * When no screens exist in the resolution context, propose a placeholder screen
 * discovery hint so the learning loop has something to activate in subsequent
 * iterations. Without this, cold-start iteration 1 produces zero proposals
 * and the convergence FSM prematurely terminates.
 */
export function proposalsForColdStartDiscovery(
  task: GroundedStep,
): ResolutionProposalDraft[] {
  const alias = task.actionText?.trim();
  if (!alias) return [];
  return [{
    artifactType: 'hints',
    targetPath: 'knowledge/screens/discovered.hints.yaml',
    title: `Cold-start discovery for step ${task.index}`,
    patch: {
      screen: 'discovered',
      element: 'unknown',
      alias,
    },
    rationale: `Cold-start resolution had no knowledge context. Recording action text "${alias}" as a discovery signal for future iterations.`,
  }];
}

/**
 * E2: Generate synonym-expanded alias proposals from a primary alias.
 *
 * When the system learns that "enter policy number" maps to an element,
 * this function also proposes "type policy number", "input policy number", etc.
 * by replacing the verb with synonyms from ACTION_SYNONYMS.
 *
 * This is the agentic suggestion layer: given one confirmed mapping,
 * deterministically expand it into several small turnkey additions.
 */
export function proposalsForSynonymExpansion(
  task: GroundedStep,
  screen: StepTaskScreenCandidate,
  element: StepTaskElementCandidate,
  primaryAlias: string,
): ResolutionProposalDraft[] {
  const decomposed = decomposeIntent(primaryAlias.toLowerCase());
  if (!decomposed.verb || !decomposed.target) return [];

  // Get all verb forms for the canonical verb
  const allVerbForms = [decomposed.verb, ...(ACTION_SYNONYMS[decomposed.verb] ?? [])];
  const existingAliases = new Set(element.aliases.map((a) => a.toLowerCase()));

  return allVerbForms
    .map((verbForm) => `${verbForm} ${decomposed.target}`)
    .filter((expanded) => !existingAliases.has(expanded) && expanded !== primaryAlias.toLowerCase())
    .slice(0, 3) // Cap at 3 synonyms to avoid alias bloat
    .map((expanded): ResolutionProposalDraft => ({
      artifactType: 'hints',
      targetPath: knowledgePaths.hints(screen.screen),
      title: `Synonym expansion for step ${task.index}: "${expanded}"`,
      patch: enrichedPatch(screen.screen, element, expanded),
      rationale: `Verb-synonym expansion from confirmed alias "${primaryAlias}". Adding "${expanded}" to prevent future phrasing variations from falling to expensive resolution rungs.`,
    }));
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
