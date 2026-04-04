import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { makeLocalAdoSource } from '../lib/infrastructure/ado/local-ado-source';
import { makeLiveAdoSource, readLiveAdoSourceConfigFromEnv } from '../lib/infrastructure/ado/live-ado-source';
import { parseSnapshotToScenario } from '../lib/application/intent/parse';
import { createAdoId } from '../lib/domain/kernel/identity';
import { validateAdoSnapshot } from '../lib/domain/validation';

import path from 'path';

const rootDir = process.cwd();
const suiteRoot = path.join(rootDir, 'dogfood');

function mockResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

function mockedAdoFetch(input: string): Promise<Response> {
  if (input.includes('/_apis/wit/wiql')) {
    return mockResponse({ workItems: [{ id: 10001 }] });
  }

  if (input.includes('/_apis/wit/workitems/10001')) {
    return mockResponse({
      id: 10001,
      rev: 1,
      fields: {
        'System.Title': 'Verify policy search returns matching policy',
        'System.Tags': 'smoke; billing; P1',
        'System.AreaPath': 'demo',
        'System.IterationPath': 'demo/sprint-1',
        'Microsoft.VSTS.Common.Priority': 1,
        'Microsoft.VSTS.TCM.Steps': [
          '<steps id="0" last="4">',
          '<step id="2" type="ActionStep"><parameterizedString isformatted="true"><![CDATA[<p>Navigate to Policy Search screen</p>]]></parameterizedString><parameterizedString isformatted="true"><![CDATA[<p>Policy Search screen loads</p>]]></parameterizedString></step>',
          '<step id="3" type="ActionStep"><parameterizedString isformatted="true"><![CDATA[<p>Enter policy number in search field</p>]]></parameterizedString><parameterizedString isformatted="true"><![CDATA[<p>Policy Number accepts a valid policy</p>]]></parameterizedString></step>',
          '<step id="4" type="ActionStep"><parameterizedString isformatted="true"><![CDATA[<p>Click Search button</p>]]></parameterizedString><parameterizedString isformatted="true"><![CDATA[<p>Search runs</p>]]></parameterizedString></step>',
          '<step id="5" type="ValidateStep"><parameterizedString isformatted="true"><![CDATA[<p>Verify search results show policy</p>]]></parameterizedString><parameterizedString isformatted="true"><![CDATA[<p>Matching policy appears in Search Results</p>]]></parameterizedString></step>',
          '</steps>',
        ].join(''),
        'Microsoft.VSTS.TCM.Parameters': '<parameters><param name="policyNumber" bind="default" /></parameters>',
        'Microsoft.VSTS.TCM.LocalDataSource': '<NewDataSet><Table1><policyNumber>POL-001</policyNumber></Table1></NewDataSet>',
      },
    });
  }

  return mockResponse({ message: 'not found' }, 404);
}

test('live ADO adapter produces deterministic snapshot parity with fixture flow', async () => {
  const fixtureSource = makeLocalAdoSource(suiteRoot);
  const liveSource = makeLiveAdoSource(
    {
      organizationUrl: 'https://dev.azure.com/acme',
      project: 'demo',
      token: 'token',
      suitePath: 'demo/policy-search',
      areaPath: 'demo',
      iterationPath: 'demo/sprint-1',
      tag: 'smoke',
    },
    {
      fetchImpl: mockedAdoFetch,
      now: () => new Date('2026-03-07T00:00:00.000Z'),
    },
  );

  const fixtureSnapshot = validateAdoSnapshot(await Effect.runPromise(fixtureSource.loadSnapshot(createAdoId('10001'))));
  const liveSnapshot = validateAdoSnapshot(await Effect.runPromise(liveSource.loadSnapshot(createAdoId('10001'))));

  expect(await Effect.runPromise(liveSource.listSnapshotIds())).toEqual(['10001']);
  expect(liveSnapshot.contentHash).toBe(fixtureSnapshot.contentHash);
  expect(liveSnapshot.suitePath).toBe('demo/policy-search');
  expect(liveSnapshot.areaPath).toBe('demo');
  expect(liveSnapshot.iterationPath).toBe('demo/sprint-1');
  expect(liveSnapshot.tags).toEqual(['smoke', 'billing', 'P1']);
  expect(parseSnapshotToScenario(liveSnapshot)).toEqual(parseSnapshotToScenario(fixtureSnapshot));
});

test('live adapter config reader requires minimal env and keeps optional selectors', () => {
  expect(readLiveAdoSourceConfigFromEnv({})).toBeNull();

  expect(
    readLiveAdoSourceConfigFromEnv({
      TESSERACT_ADO_ORG_URL: 'https://dev.azure.com/acme',
      TESSERACT_ADO_PROJECT: 'demo',
      TESSERACT_ADO_PAT: 'token',
      TESSERACT_ADO_SUITE_PATH: 'demo/policy-search',
      TESSERACT_ADO_AREA_PATH: 'demo',
      TESSERACT_ADO_ITERATION_PATH: 'demo/sprint-1',
      TESSERACT_ADO_TAG: 'smoke',
    }),
  ).toEqual({
    organizationUrl: 'https://dev.azure.com/acme',
    project: 'demo',
    token: 'token',
    suitePath: 'demo/policy-search',
    areaPath: 'demo',
    iterationPath: 'demo/sprint-1',
    tag: 'smoke',
    apiVersion: undefined,
  });
});
