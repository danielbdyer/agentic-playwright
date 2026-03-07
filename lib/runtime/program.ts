import path from 'path';
import { readFileSync } from 'fs';
import { Page } from '@playwright/test';
import { createPostureId, ScreenId, SnapshotTemplateId } from '../domain/identity';
import { StepInstruction, StepProgram } from '../domain/types';
import { resolveDataValue } from './data';
import { engage } from './engage';
import { loadScreenRegistry, ScreenRegistry } from './load';
import { locate } from './locate';
import { expectAriaSnapshot } from './aria';

function requireScreen(screens: ScreenRegistry, screenId: ScreenId) {
  const screen = screens[screenId];
  if (!screen) {
    throw new Error(`Unknown screen ${screenId}`);
  }
  return screen;
}

function snapshotTemplatePath(snapshotTemplate: SnapshotTemplateId): string {
  return path.join(process.cwd(), 'knowledge', snapshotTemplate);
}

async function runInstruction(
  page: Page,
  screens: ScreenRegistry,
  fixtures: Record<string, unknown>,
  instruction: StepInstruction,
): Promise<void> {
  switch (instruction.kind) {
    case 'navigate': {
      const screen = requireScreen(screens, instruction.screen);
      await page.goto(screen.screen.url);
      return;
    }
    case 'enter': {
      const screen = requireScreen(screens, instruction.screen);
      await engage(
        page,
        screen.elements,
        screen.postures,
        screen.surfaces,
        instruction.element,
        instruction.posture ?? createPostureId('valid'),
        resolveDataValue(fixtures, instruction.value),
      );
      return;
    }
    case 'invoke': {
      const screen = requireScreen(screens, instruction.screen);
      await locate(page, screen.elements[instruction.element]).click();
      return;
    }
    case 'observe-structure': {
      const screen = requireScreen(screens, instruction.screen);
      await expectAriaSnapshot(
        locate(page, screen.elements[instruction.element]),
        readFileSync(snapshotTemplatePath(instruction.snapshotTemplate), 'utf8'),
      );
      return;
    }
    case 'custom-escape-hatch':
      throw new Error(`Cannot execute step program escape hatch: ${instruction.reason}`);
  }
}

export async function runStepProgram(
  page: Page,
  screens: ScreenRegistry,
  fixtures: Record<string, unknown>,
  program: StepProgram,
): Promise<void> {
  for (const instruction of program.instructions) {
    await runInstruction(page, screens, fixtures, instruction);
  }
}

export { loadScreenRegistry };


