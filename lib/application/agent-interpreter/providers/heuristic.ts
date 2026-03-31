import { Effect } from 'effect';
import type { ResolutionTarget, ResolutionProposalDraft, StepAction } from '../../../domain/types';
import type { ElementId, PostureId, ScreenId, SnapshotTemplateId } from '../../../domain/identity';
import { bestAliasMatch, humanizeIdentifier, normalizeIntentText } from '../../../domain/inference';
import type { AgentInterpretationRequest, AgentInterpreterProvider } from '../contract';

function scoreScreen(normalized: string, screen: AgentInterpretationRequest['screens'][number]): number {
  const aliases = [screen.screen, ...screen.screenAliases, humanizeIdentifier(screen.screen)];
  return bestAliasMatch(normalized, aliases)?.score ?? 0;
}

function scoreElement(normalized: string, element: AgentInterpretationRequest['screens'][number]['elements'][number]): number {
  const aliases = [element.element, element.name ?? '', ...element.aliases, humanizeIdentifier(element.element)];
  return bestAliasMatch(normalized, aliases)?.score ?? 0;
}

function inferAction(actionText: string): StepAction {
  const lower = actionText.toLowerCase();
  if (/\b(navigate|go to|open|load|access|visit|browse)\b/.test(lower)) return 'navigate';
  if (/\b(enter|type|input|fill|set|provide|key in|write|populate)\b/.test(lower)) return 'input';
  if (/\b(click|press|tap|hit|activate|submit|trigger)\b/.test(lower)) return 'click';
  if (/\b(select|choose|pick)\b/.test(lower)) return 'click';
  if (/\b(verify|check|confirm|assert|ensure|see|observe|validate|expect)\b/.test(lower)) return 'assert-snapshot';
  return 'click';
}

export function createHeuristicProvider(): AgentInterpreterProvider {
  return {
    id: 'agent-interpreter-heuristic',
    kind: 'heuristic',
    interpret: (request) => {
      const normalized = normalizeIntentText(`${request.actionText} ${request.expectedText}`);
      const allowedActions = request.grounding?.allowedActions;
      const action = request.inferredAction
        ?? (allowedActions && allowedActions.length === 1 ? allowedActions[0]! : null)
        ?? inferAction(request.actionText);
      const priorScreen = request.observedState?.currentScreen ?? request.priorTarget?.screen ?? null;

      const topScreen = request.screens.reduce<{ screen: typeof request.screens[number]; score: number } | null>(
        (best, screen) => {
          const score = scoreScreen(normalized, screen) + (screen.screen === priorScreen ? 2 : 0);
          return score > 0 && (!best || score > best.score) ? { screen, score } : best;
        },
        null,
      );

      if (!topScreen) {
        return Effect.succeed({ interpreted: false, target: null, confidence: 0, rationale: 'No screen matched the step text with sufficient confidence.', proposalDrafts: [], provider: 'heuristic' });
      }

      const topElement = topScreen.screen.elements.reduce<{ element: typeof topScreen.screen.elements[number]; score: number } | null>(
        (best, element) => {
          const score = scoreElement(normalized, element);
          return score > 0 && (!best || score > best.score) ? { element, score } : best;
        },
        null,
      );

      if (action !== 'navigate' && !topElement) {
        return Effect.succeed({
          interpreted: false,
          target: null,
          confidence: 0,
          rationale: `Screen "${topScreen.screen.screen}" matched but no element matched for action "${action}".`,
          proposalDrafts: [],
          provider: 'heuristic',
        });
      }

      const confidence = Math.min(1, (topScreen.score + (topElement?.score ?? 0)) / 10);
      const target: ResolutionTarget = {
        action,
        screen: topScreen.screen.screen as ScreenId,
        element: (topElement?.element.element ?? null) as ElementId | null,
        posture: null as PostureId | null,
        override: null,
        snapshot_template: null as SnapshotTemplateId | null,
      };

      const normalizedScreenId = normalizeIntentText(topScreen.screen.screen);
      const normalizedElementId = normalizeIntentText(topElement?.element.element ?? '');
      const matchedAliases = new Set([...(topScreen.screen.screenAliases), ...(topElement?.element.aliases ?? [])].map(normalizeIntentText));
      const novelTerms = normalizeIntentText(request.actionText).split(/\s+/).flatMap((token) =>
        token.length > 3 && !matchedAliases.has(token) && (normalizedScreenId.includes(token) || normalizedElementId.includes(token))
          ? [token]
          : [],
      );

      const proposalDrafts: ResolutionProposalDraft[] = novelTerms.length > 0 && topElement
        ? [{
            targetPath: `knowledge/screens/${topScreen.screen.screen}.hints.yaml`,
            title: `Add alias "${novelTerms[0]}" for ${topElement.element.element}`,
            patch: { op: 'add', path: `/elements/${topElement.element.element}/aliases/-`, value: novelTerms[0]! },
            artifactType: 'hints',
            rationale: `Heuristic matched "${novelTerms[0]}" to ${topElement.element.element} via context-aware scoring.`,
          }]
        : [];

      return Effect.succeed({
        interpreted: true,
        target,
        confidence,
        rationale: `Heuristic resolved: screen=${topScreen.screen.screen}(score=${topScreen.score.toFixed(1)})${topElement ? ` element=${topElement.element.element}(score=${topElement.score.toFixed(1)})` : ''} action=${action}`,
        proposalDrafts,
        provider: 'heuristic',
        observation: {
          source: 'agent-interpreted',
          summary: 'Context-aware heuristic interpretation.',
          detail: {
            screen: topScreen.screen.screen,
            element: topElement?.element.element ?? '',
            action,
            confidence: String(confidence),
          },
        },
      });
    },
  };
}
