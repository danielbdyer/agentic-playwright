import { expect, test } from '@playwright/test';
import { mergePatternDocuments } from '../product/domain/knowledge/patterns';
import { validatePatternDocument } from '../product/domain/validation';

test('mergePatternDocuments produces a deterministic merged registry in sorted path order', () => {
  const first = {
    artifactPath: 'knowledge/patterns/z-actions.yaml',
    artifact: validatePatternDocument({
      version: 1,
      actions: {
        input: { id: 'core.input', aliases: ['enter value'] },
        navigate: { id: 'core.navigate', aliases: ['go to'] },
      },
    }),
  };
  const second = {
    artifactPath: 'knowledge/patterns/a-observe.yaml',
    artifact: validatePatternDocument({
      version: 1,
      actions: {
        click: { id: 'core.click', aliases: ['select'] },
        'assert-snapshot': { id: 'core.assert-snapshot', aliases: ['see results'] },
      },
      postures: {
        empty: { id: 'posture.empty', aliases: ['leave blank'] },
      },
    }),
  };

  const merged = mergePatternDocuments([first, second]);

  expect(merged.documents).toEqual([
    'knowledge/patterns/a-observe.yaml',
    'knowledge/patterns/z-actions.yaml',
  ]);
  expect(merged.sources.actions.click).toBe('knowledge/patterns/a-observe.yaml');
  expect(merged.sources.actions.navigate).toBe('knowledge/patterns/z-actions.yaml');
  expect(merged.sources.postures.empty).toBe('knowledge/patterns/a-observe.yaml');
});

test('mergePatternDocuments fails fast on duplicate action keys across files', () => {
  expect(() =>
    mergePatternDocuments([
      {
        artifactPath: 'knowledge/patterns/a.yaml',
        artifact: validatePatternDocument({
          version: 1,
          actions: {
            input: { id: 'core.input', aliases: ['enter value'] },
            navigate: { id: 'core.navigate', aliases: ['go to'] },
          },
        }),
      },
      {
        artifactPath: 'knowledge/patterns/b.yaml',
        artifact: validatePatternDocument({
          version: 1,
          actions: {
            input: { id: 'custom.input', aliases: ['fill in'] },
            click: { id: 'core.click', aliases: ['press'] },
            'assert-snapshot': { id: 'core.assert-snapshot', aliases: ['verify layout'] },
          },
        }),
      },
    ]),
  ).toThrow(/duplicate pattern action "input"/i);
});

test('mergePatternDocuments fails fast on duplicate posture ids across files', () => {
  expect(() =>
    mergePatternDocuments([
      {
        artifactPath: 'knowledge/patterns/a.yaml',
        artifact: validatePatternDocument({
          version: 1,
          actions: {
            input: { id: 'core.input', aliases: ['enter value'] },
            navigate: { id: 'core.navigate', aliases: ['go to'] },
            click: { id: 'core.click', aliases: ['press'] },
            'assert-snapshot': { id: 'core.assert-snapshot', aliases: ['verify layout'] },
          },
          postures: {
            empty: { id: 'posture.empty', aliases: ['leave blank'] },
          },
        }),
      },
      {
        artifactPath: 'knowledge/patterns/b.yaml',
        artifact: validatePatternDocument({
          version: 1,
          postures: {
            empty: { id: 'posture.empty-alias', aliases: ['clear field'] },
          },
        }),
      },
    ]),
  ).toThrow(/duplicate pattern posture "empty"/i);
});
