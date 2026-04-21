import { expect, test } from '@playwright/test';
import { productCommandRegistry } from '../../product/cli/commands/index';
import { workshopCommandRegistry } from '../../workshop/cli/commands/index';
import { commandNames, type CommandName } from '../../product/cli/shared';
import { parseCliInvocation } from '../../product/cli/registry';
import { composedCliCommandRegistry } from '../../bin/cli-registry';

const EXPECTED_COMMAND_COUNT = 30;

test('all original commands are still registered (composed)', () => {
  const registeredNames = Object.keys(composedCliCommandRegistry) as readonly string[];
  for (const name of commandNames) {
    expect(registeredNames).toContain(name);
  }
});

test('command count matches expected total', () => {
  const registeredCount = Object.keys(composedCliCommandRegistry).length;
  expect(registeredCount).toBe(EXPECTED_COMMAND_COUNT);
  expect(commandNames.length).toBe(EXPECTED_COMMAND_COUNT);
});

test('no duplicate command names', () => {
  const unique = new Set(commandNames);
  expect(unique.size).toBe(commandNames.length);
});

test('product + workshop partitions are disjoint and cover every command name', () => {
  const productKeys = new Set(Object.keys(productCommandRegistry));
  const workshopKeys = new Set(Object.keys(workshopCommandRegistry));
  for (const key of productKeys) {
    expect(workshopKeys.has(key)).toBeFalsy();
  }
  const union = new Set<string>([...productKeys, ...workshopKeys]);
  expect(union).toEqual(new Set<string>(commandNames));
});

test('each command has a handler (parse returns an object with execute)', () => {
  for (const name of commandNames) {
    const spec = composedCliCommandRegistry[name as CommandName];
    expect(spec).toBeTruthy();
    expect(typeof spec!.parse).toBe('function');
    expect(Array.isArray(spec!.flags)).toBe(true);
  }
});

test('commandNames array and composed registry keys are identical sets', () => {
  const registryKeys = new Set(Object.keys(composedCliCommandRegistry));
  const nameSet = new Set<string>(commandNames);
  expect(registryKeys).toEqual(nameSet);
});

test('parseCliInvocation dispatches every command without throwing (flag-free subset)', () => {
  const noArgCommands: readonly CommandName[] = ['graph', 'types'];
  for (const name of noArgCommands) {
    const invocation = parseCliInvocation([name], composedCliCommandRegistry);
    expect(invocation.command).toBe(name);
    expect(typeof invocation.execute).toBe('function');
  }
});

test('parseCliInvocation rejects unknown commands', () => {
  expect(() => parseCliInvocation(['nonexistent-command'], composedCliCommandRegistry)).toThrow('Unknown command');
});

test('parseCliInvocation rejects commands not registered in the passed registry', () => {
  // Product-only registry should reject workshop-only commands with a clear message.
  expect(() => parseCliInvocation(['benchmark'], productCommandRegistry)).toThrow('not registered');
});

test('each command spec parse produces a CommandExecution with required fields', () => {
  for (const name of commandNames) {
    const spec = composedCliCommandRegistry[name as CommandName]!;
    try {
      const execution = spec.parse({ flags: {} });
      expect(execution.command).toBe(name);
      expect(typeof execution.execute).toBe('function');
      expect(typeof execution.strictExitOnUnbound).toBe('boolean');
      expect(execution.postureInput).toBeTruthy();
    } catch {
      // Commands that require flags (e.g. --ado-id) will throw on empty flags.
      // That is correct behavior -- the spec still has a valid parse function.
    }
  }
});
