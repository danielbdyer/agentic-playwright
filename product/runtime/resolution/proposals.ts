import { knowledgePaths } from '../../domain/kernel/ids';
import type { ProposalCategory, ProposalEnrichment, ProposalEpistemicStatus } from '../../domain/execution/types';
import type { IntentDecomposition } from '../../domain/knowledge/inference';
import type { InterfaceResolutionContext, StepTaskElementCandidate, StepTaskScreenCandidate } from '../../domain/knowledge/types';
import type { GroundedStep, ResolutionProposalDraft } from '../../domain/resolution/types';
import { primaryAffordanceForRole, roleForWidget } from '../../domain/widgets/role-affordances';
import type { IntentInterpretation, InterpretationSource } from './types';

function roleForElement(element: StepTaskElementCandidate): string | null {
  return element.role || (typeof element.widget === 'string' ? roleForWidget(element.widget) : null);
}

function enrichmentForElement(
  element: StepTaskElementCandidate,
  input: {
    readonly source: string | null;
    readonly epistemicStatus: ProposalEpistemicStatus;
  },
): ProposalEnrichment {
  const role = roleForElement(element);
  const affordance = role ? primaryAffordanceForRole(role) : null;
  return {
    ...(role ? { role } : {}),
    ...(affordance ? { affordance } : {}),
    ...(element.locator.length > 0 ? { locatorLadder: element.locator } : {}),
    ...(input.source ? { source: input.source } : {}),
    epistemicStatus: input.epistemicStatus,
    activationPolicy: element.locator.length > 0 ? 'merge-locator-ladder' : 'set-if-absent',
  };
}

function proposalStatusForSource(source: InterpretationSource): ProposalEpistemicStatus {
  // InterpretationSource is a 3-variant union (lib/runtime/resolution/types.ts:85).
  // Exhaustive switch — no default. Adding a new source variant
  // breaks the build here until it's handled, which is what we want.
  // Previously this function accepted `string` and had 8 cases plus a
  // `default: 'discovered'` fallback. Five of those cases were dead
  // code (unreachable under the actual domain type) and the default
  // was hiding a silent-misclassification risk. All call sites pass
  // `interpretation.source` which is already typed, so tightening the
  // parameter type was zero-impact at the call sites.
  switch (source) {
    case 'dom-exploration':
      return 'observed';
    case 'knowledge-translation':
      return 'interpreted';
    case 'knowledge-heuristic':
      return 'stabilized';
  }
}

function enrichedPatch(screen: string, element: StepTaskElementCandidate, alias: string): Record<string, unknown> {
  return {
    screen,
    element: element.element,
    alias,
  };
}

function aliasProposal(input: {
  readonly category: ProposalCategory;
  readonly task: GroundedStep;
  readonly screen: StepTaskScreenCandidate;
  readonly element: StepTaskElementCandidate;
  readonly alias: string;
  readonly title: string;
  readonly rationale: string;
  readonly source: string | null;
  readonly epistemicStatus: ProposalEpistemicStatus;
}): ResolutionProposalDraft {
  return {
    artifactType: 'hints',
    category: input.category,
    targetPath: knowledgePaths.hints(input.screen.screen),
    title: input.title,
    patch: enrichedPatch(input.screen.screen, input.element, input.alias),
    enrichment: enrichmentForElement(input.element, {
      source: input.source,
      epistemicStatus: input.epistemicStatus,
    }),
    rationale: input.rationale,
  };
}

function screenAliasProposal(input: {
  readonly category: ProposalCategory;
  readonly task: GroundedStep;
  readonly screen: StepTaskScreenCandidate;
  readonly alias: string;
  readonly title: string;
  readonly rationale: string;
  readonly source: string | null;
  readonly epistemicStatus: ProposalEpistemicStatus;
}): ResolutionProposalDraft {
  return {
    artifactType: 'hints',
    category: input.category,
    targetPath: knowledgePaths.hints(input.screen.screen),
    title: input.title,
    patch: {
      screen: input.screen.screen,
      screenAlias: input.alias,
    },
    enrichment: {
      ...(input.source ? { source: input.source } : {}),
      epistemicStatus: input.epistemicStatus,
      activationPolicy: 'append-aliases',
    },
    rationale: input.rationale,
  };
}

export function proposalForSupplementGap(task: GroundedStep, screen: StepTaskScreenCandidate, element: StepTaskElementCandidate): ResolutionProposalDraft[] {
  return [aliasProposal({
    category: 'interpretation-enrichment',
    task,
    screen,
    element,
    alias: task.actionText,
    title: `Capture phrasing for step ${task.index}`,
    rationale: 'Runtime resolved the step through live DOM after approved knowledge exhausted its deterministic priors.',
    source: 'live-dom',
    epistemicStatus: 'observed',
  })];
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
      return [aliasProposal({
        category: 'interpretation-enrichment',
        task,
        screen,
        element,
        alias: task.actionText,
        title: `Add alias from ${interpretation.source} interpretation (step ${task.index})`,
        rationale,
        source: interpretation.source,
        epistemicStatus: proposalStatusForSource(interpretation.source),
      })];
    }
    return [];
  })();

  // Propose screen alias when screen was interpreted but not via approved knowledge
  const screenAliasProposals: ResolutionProposalDraft[] = (() => {
    if (interpretation.source === 'knowledge-heuristic') return [];
    const screenAliasCandidate = task.actionText.toLowerCase().trim();
    const existingScreenAliases = [screen.screen, ...screen.screenAliases].map(
      (alias) => alias.toLowerCase(),
    );
    if (!existingScreenAliases.includes(screenAliasCandidate)) {
      return [screenAliasProposal({
        category: 'interpretation-enrichment',
        task,
        screen,
        alias: task.actionText,
        title: `Add screen alias from ${interpretation.source} interpretation (step ${task.index})`,
        rationale,
        source: interpretation.source,
        epistemicStatus: proposalStatusForSource(interpretation.source),
      })];
    }
    return [];
  })();

  // LLM decomposition proposals — when the translation provider returned
  // suggested aliases, convert them into proposals. This is the agentic
  // handshake: the LLM does comprehension, we do activation.
  const decompositionProposals: ResolutionProposalDraft[] = (() => {
    if (!interpretation.decomposition?.suggestedAliases?.length) return [];
    if (!interpretation.interpretedElement) return [];
    const element = screen.elements.find(
      (entry) => entry.element === interpretation.interpretedElement,
    );
    if (!element) return [];
    return proposalsFromDecomposition(task, screen, element, interpretation.decomposition, {
      category: 'interpretation-enrichment',
      source: interpretation.source,
      epistemicStatus: proposalStatusForSource(interpretation.source),
    });
  })();

  const proposals: ResolutionProposalDraft[] = [...elementProposal, ...screenAliasProposals, ...decompositionProposals];

  return proposals;
}

/**
 * Generate proposals when a step falls to needs-human.
 *
 * Describes the knowledge gap that prevented deterministic resolution:
 * - If screen was matched but element wasn't → propose element alias on first element
 * - If screen wasn't matched → use LLM interpretation to route, or propose on best candidate
 * - Always propose the action-text-to-element mapping when both are known
 *
 * When an interpretation is provided (from LLM translation), it guides proposal
 * routing — the LLM's comprehension determines which screen/element an alias
 * belongs to, not blind first-match. This is the agentic handshake: the LLM
 * does comprehension, the pipeline does activation.
 */
export function proposalsForNeedsHuman(
  task: GroundedStep,
  screen: StepTaskScreenCandidate | null,
  element: StepTaskElementCandidate | null,
  resolutionContext: InterfaceResolutionContext,
  interpretation?: IntentInterpretation | null | undefined,
): ResolutionProposalDraft[] {
  // When lattice didn't match a screen but the LLM interpretation did,
  // use the LLM's screen match. This prevents proposals from going to
  // the catch-all when the LLM already knows the answer.
  const resolvedScreen = screen
    ?? (interpretation?.interpretedScreen
      ? resolutionContext.screens.find((s) => s.screen === interpretation.interpretedScreen) ?? null
      : null);

  const resolvedElement = element
    ?? (resolvedScreen && interpretation?.interpretedElement
      ? resolvedScreen.elements.find((e) => e.element === interpretation.interpretedElement) ?? null
      : null);

  // Cold-start fallback: when no screens exist in knowledge AND the LLM
  // couldn't identify one, emit a discovery proposal.
  if (!resolvedScreen && resolutionContext.screens.length === 0) {
    return proposalsForColdStartDiscovery(task, interpretation?.decomposition ?? null);
  }

  const screenNoElement: readonly ResolutionProposalDraft[] =
    resolvedScreen && !resolvedElement && resolvedScreen.elements.length > 0
      ? [aliasProposal({
          category: 'needs-human',
          task,
          screen: resolvedScreen,
          element: resolvedScreen.elements[0]!,
          alias: task.actionText,
          title: `Add element alias for unresolved step ${task.index}`,
          rationale: `Screen "${resolvedScreen.screen}" was ${screen ? 'matched by lattice' : 'identified by LLM interpretation'} but no element alias matched "${task.actionText}". Proposing alias on candidate element "${resolvedScreen.elements[0]!.element}".`,
          source: interpretation?.source ?? 'needs-human',
          epistemicStatus: interpretation ? proposalStatusForSource(interpretation.source) : 'discovered',
        })]
      : !resolvedScreen && resolutionContext.screens.length > 0 && resolutionContext.screens[0]!.elements.length > 0
        ? [aliasProposal({
            category: 'needs-human',
            task,
            screen: resolutionContext.screens[0]!,
            element: resolutionContext.screens[0]!.elements[0]!,
            alias: task.actionText,
            title: `Add alias for unresolved step ${task.index} (no screen matched)`,
            rationale: `No screen alias matched the action text "${task.actionText}". Proposing alias on screen "${resolutionContext.screens[0]!.screen}" element "${resolutionContext.screens[0]!.elements[0]!.element}" as a starting point.`,
            source: interpretation?.source ?? 'needs-human',
            epistemicStatus: interpretation ? proposalStatusForSource(interpretation.source) : 'discovered',
          })]
        : [];

  // LLM decomposition proposals — if the LLM suggested aliases, include them
  const decompositionProposals: ResolutionProposalDraft[] = (() => {
    if (!interpretation?.decomposition?.suggestedAliases?.length) return [];
    if (!resolvedScreen || !resolvedElement) return [];
    return proposalsFromDecomposition(task, resolvedScreen, resolvedElement, interpretation.decomposition, {
      category: 'needs-human',
      source: interpretation.source,
      epistemicStatus: proposalStatusForSource(interpretation.source),
    });
  })();

  const bothMatched: readonly ResolutionProposalDraft[] =
    resolvedScreen && resolvedElement
      ? [aliasProposal({
          category: 'needs-human',
          task,
          screen: resolvedScreen,
          element: resolvedElement,
          alias: task.actionText,
          title: `Capture phrasing gap for step ${task.index}`,
          rationale: `Screen and element matched but resolution was incomplete. Action text: "${task.actionText}".`,
          source: interpretation?.source ?? 'needs-human',
          epistemicStatus: interpretation ? proposalStatusForSource(interpretation.source) : 'discovered',
        })]
      : [];

  return [...screenNoElement, ...bothMatched, ...decompositionProposals];
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
  return [aliasProposal({
    category: 'deterministic-alias-stabilization',
    task,
    screen,
    element,
    alias,
    title: `Stabilize alias from ${winningSource} resolution (step ${task.index})`,
    rationale: `Step resolved deterministically via ${winningSource} but the action text "${alias}" is not yet a known alias. Adding it prevents future phrasing drift from falling through to more expensive resolution rungs.`,
    source: winningSource,
    epistemicStatus: 'stabilized',
  })];
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

  return [aliasProposal({
    category: 'partial-resolution-stabilization',
    task,
    screen,
    element: best,
    alias,
    title: `Supplementary alias for ambiguous step ${task.index}`,
    rationale: `Screen "${screen.screen}" matched but element resolution was ambiguous among ${topCandidates.length} candidates. Proposing alias on best candidate "${best.element}" to accelerate convergence.`,
    source: 'partial-resolution',
    epistemicStatus: 'interpreted',
  })];
}

/**
 * Generate discovery proposals when resolution fails with no context (cold-start).
 *
 * When no screens exist in the resolution context, propose a placeholder screen
 * discovery hint so the learning loop has something to activate in subsequent
 * iterations. Without this, cold-start iteration 1 produces zero proposals
 * and the convergence FSM prematurely terminates.
 *
 * When an LLM decomposition is available, it provides the target noun phrase
 * and suggested aliases — these are included in the proposal so the activation
 * pipeline can create richer initial knowledge than a bare action text string.
 */
export function proposalsForColdStartDiscovery(
  task: GroundedStep,
  decomposition?: import('../../domain/knowledge/inference').IntentDecomposition | null,
): ResolutionProposalDraft[] {
  const alias = task.actionText?.trim();
  if (!alias) return [];

  // Base proposal: the action text itself
  const proposals: ResolutionProposalDraft[] = [{
    artifactType: 'hints',
    category: 'cold-start-discovery',
    targetPath: 'knowledge/screens/discovered.hints.yaml',
    title: `Cold-start discovery for step ${task.index}`,
    patch: {
      screen: 'discovered',
      element: 'unknown',
      alias,
      // Thread LLM decomposition into the patch so activation can use it
      ...(decomposition?.verb ? { verb: decomposition.verb } : {}),
      ...(decomposition?.target ? { target: decomposition.target } : {}),
      ...(decomposition?.data ? { data: decomposition.data } : {}),
    },
    enrichment: {
      source: 'cold-start-discovery',
      epistemicStatus: 'discovered',
      activationPolicy: 'append-aliases',
    },
    rationale: decomposition
      ? `Cold-start discovery with LLM decomposition: verb="${decomposition.verb}", target="${decomposition.target}". The LLM's comprehension will help route this alias to the correct screen once screens are discovered.`
      : `Cold-start resolution had no knowledge context. Recording action text "${alias}" as a discovery signal for future iterations.`,
  }];

  // If the LLM suggested aliases, add those too so the knowledge model
  // starts with multiple phrasings instead of just one
  if (decomposition?.suggestedAliases?.length) {
    for (const suggested of decomposition.suggestedAliases.slice(0, 3)) {
      const trimmed = suggested.trim().toLowerCase();
      if (trimmed && trimmed !== alias.toLowerCase()) {
        proposals.push({
          artifactType: 'hints',
          category: 'cold-start-discovery',
          targetPath: 'knowledge/screens/discovered.hints.yaml',
          title: `LLM-suggested variant for step ${task.index}: "${trimmed}"`,
          patch: { screen: 'discovered', element: 'unknown', alias: trimmed },
          enrichment: {
            source: 'cold-start-discovery',
            epistemicStatus: 'discovered',
            activationPolicy: 'append-aliases',
          },
          rationale: `LLM suggested "${trimmed}" as an equivalent phrasing during cold-start discovery.`,
        });
      }
    }
  }

  return proposals;
}

/**
 * Generate alias proposals from an LLM-produced intent decomposition.
 *
 * When the LLM decomposes "Enter test data in search field" and suggests
 * aliases like ["type in search field", "input search field"], this function
 * converts those suggestions into structured proposals that the activation
 * pipeline can persist as deterministic knowledge.
 *
 * This is the agentic handshake: the LLM does comprehension, the pipeline
 * does activation and governance. Each suggested alias becomes a small,
 * turnkey, deterministic addition to the knowledge model.
 */
export function proposalsFromDecomposition(
  task: GroundedStep,
  screen: StepTaskScreenCandidate,
  element: StepTaskElementCandidate,
  decomposition: IntentDecomposition,
  options: {
    readonly category: ProposalCategory;
    readonly source: string;
    readonly epistemicStatus: ProposalEpistemicStatus;
  } = {
    category: 'interpretation-enrichment',
    source: 'knowledge-translation',
    epistemicStatus: 'interpreted',
  },
): ResolutionProposalDraft[] {
  if (decomposition.suggestedAliases.length === 0) return [];

  const existingAliases = new Set(element.aliases.map((a) => a.toLowerCase()));

  return decomposition.suggestedAliases
    .map((alias) => alias.toLowerCase().trim())
    .filter((alias) => alias.length > 0 && !existingAliases.has(alias))
    .slice(0, 5) // Cap to prevent alias bloat
    .map((alias): ResolutionProposalDraft => aliasProposal({
      category: options.category,
      task,
      screen,
      element,
      alias,
      title: `LLM-suggested alias for step ${task.index}: "${alias}"`,
      rationale: `LLM decomposition suggested "${alias}" as an equivalent phrasing for "${task.actionText}" (confidence: ${decomposition.confidence}). Adding to make future resolution deterministic.`,
      source: options.source,
      epistemicStatus: options.epistemicStatus,
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
