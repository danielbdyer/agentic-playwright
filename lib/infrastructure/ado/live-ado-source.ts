import type { AdoSourcePort } from '../../application/ports';
import { tryAsync } from '../../application/effect';
import { computeAdoContentHash, normalizeHtmlText } from '../../domain/hash';
import { createAdoId } from '../../domain/identity';

export interface LiveAdoSourceConfig {
  organizationUrl: string;
  project: string;
  token: string;
  suitePath: string;
  areaPath?: string | undefined;
  iterationPath?: string | undefined;
  tag?: string | undefined;
  apiVersion?: string | undefined;
}

interface WorkItemReference {
  id: number;
}

interface WorkItemResponse {
  id: number;
  rev: number;
  fields: Record<string, unknown>;
}

interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

function splitTags(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }
  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function extractStepBodies(stepsXml: string): string[] {
  return [...stepsXml.matchAll(/<step\b[^>]*>([\s\S]*?)<\/step>/gi)].map((match) => match[1] ?? '');
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractParameterizedStrings(stepBody: string): string[] {
  return [...stepBody.matchAll(/<parameterizedString\b[^>]*>([\s\S]*?)<\/parameterizedString>/gi)]
    .map((match) => normalizeHtmlText(decodeXmlText(match[1] ?? '')));
}

function parseSteps(stepsXml: unknown): { index: number; action: string; expected: string }[] {
  if (typeof stepsXml !== 'string' || stepsXml.trim().length === 0) {
    return [];
  }

  return extractStepBodies(stepsXml).map((body, index) => {
    const [action = '', expected = ''] = extractParameterizedStrings(body);
    return {
      index: index + 1,
      action,
      expected,
    };
  });
}

function parseParameters(parametersXml: unknown): { name: string; values: string[] }[] {
  if (typeof parametersXml !== 'string' || parametersXml.trim().length === 0) {
    return [];
  }
  return [...parametersXml.matchAll(/<param\b[^>]*name="([^"]+)"[^>]*>/gi)]
    .map((match) => match[1]?.trim() ?? '')
    .filter((name) => name.length > 0)
    .map((name) => ({ name, values: [] }));
}

function parseDataRows(dataSourceXml: unknown): Record<string, string>[] {
  if (typeof dataSourceXml !== 'string' || dataSourceXml.trim().length === 0) {
    return [];
  }
  const rows = [...dataSourceXml.matchAll(/<Table1>([\s\S]*?)<\/Table1>/gi)].map((match) => match[1] ?? '');
  return rows.map((row) => {
    const cells = [...row.matchAll(/<([A-Za-z0-9_:-]+)>([\s\S]*?)<\/\1>/g)];
    return Object.fromEntries(
      cells.map((cell) => {
        const key = cell[1] ?? '';
        const value = normalizeHtmlText(decodeXmlText(cell[2] ?? ''));
        return [key, value];
      }),
    );
  });
}

function encodeBasicAuth(token: string): string {
  return Buffer.from(`:${token}`, 'utf8').toString('base64');
}

function buildWiql(config: LiveAdoSourceConfig): string {
  const filters = [
    `[System.TeamProject] = '${config.project.replaceAll("'", "''")}'`,
    "[System.WorkItemType] = 'Test Case'",
  ];

  if (config.areaPath) {
    filters.push(`[System.AreaPath] UNDER '${config.areaPath.replaceAll("'", "''")}'`);
  }
  if (config.iterationPath) {
    filters.push(`[System.IterationPath] UNDER '${config.iterationPath.replaceAll("'", "''")}'`);
  }
  if (config.tag) {
    filters.push(`[System.Tags] CONTAINS '${config.tag.replaceAll("'", "''")}'`);
  }

  return `SELECT [System.Id] FROM WorkItems WHERE ${filters.join(' AND ')}`;
}

async function fetchJson(fetchImpl: FetchLike, url: string, token: string, method = 'GET', body?: unknown): Promise<unknown> {
  const request: RequestInit = {
    method,
    headers: {
      Authorization: `Basic ${encodeBasicAuth(token)}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) {
    request.body = JSON.stringify(body);
  }
  const response = await fetchImpl(url, {
    ...request,
  });
  if (!response.ok) {
    throw new Error(`ADO request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function buildSnapshot(config: LiveAdoSourceConfig, workItem: WorkItemResponse, syncedAt: string) {
  const fields = workItem.fields;
  const tags = splitTags(fields['System.Tags']);
  const parameters = parseParameters(fields['Microsoft.VSTS.TCM.Parameters']);
  const dataRows = parseDataRows(fields['Microsoft.VSTS.TCM.LocalDataSource']);
  const parameterValues = parameters.map((parameter) => ({
    ...parameter,
    values: dataRows.map((row) => row[parameter.name] ?? '').filter((entry) => entry.length > 0),
  }));
  const steps = parseSteps(fields['Microsoft.VSTS.TCM.Steps']);

  return {
    id: createAdoId(String(workItem.id)),
    revision: workItem.rev,
    title: asString(fields['System.Title'], `ADO ${workItem.id}`),
    suitePath: config.suitePath,
    areaPath: asString(fields['System.AreaPath'], config.areaPath ?? ''),
    iterationPath: asString(fields['System.IterationPath'], config.iterationPath ?? ''),
    tags,
    priority: asNumber(fields['Microsoft.VSTS.Common.Priority'], 0),
    steps,
    parameters: parameterValues,
    dataRows,
    contentHash: computeAdoContentHash({ steps, parameters: parameterValues }),
    syncedAt,
  };
}

export function makeLiveAdoSource(config: LiveAdoSourceConfig, dependencies?: { fetchImpl?: FetchLike; now?: () => Date }): AdoSourcePort {
  const fetchImpl = dependencies?.fetchImpl ?? fetch;
  const apiVersion = config.apiVersion ?? '7.1';
  const baseUrl = `${config.organizationUrl.replace(/\/$/, '')}/${encodeURIComponent(config.project)}`;

  return {
    listSnapshotIds() {
      return tryAsync(async () => {
        const wiqlUrl = `${baseUrl}/_apis/wit/wiql?api-version=${encodeURIComponent(apiVersion)}`;
        const wiqlResponse = await fetchJson(fetchImpl, wiqlUrl, config.token, 'POST', { query: buildWiql(config) }) as {
          workItems?: WorkItemReference[];
        };
        return (wiqlResponse.workItems ?? [])
          .map((entry) => createAdoId(String(entry.id)))
          .sort((left, right) => left.localeCompare(right));
      }, 'ado-live-list-failed', 'Unable to list ADO work items from live source');
    },

    loadSnapshot(adoId) {
      return tryAsync(async () => {
        const workItemUrl = `${baseUrl}/_apis/wit/workitems/${adoId}?$expand=fields&api-version=${encodeURIComponent(apiVersion)}`;
        const workItem = await fetchJson(fetchImpl, workItemUrl, config.token) as WorkItemResponse;
        const syncedAt = (dependencies?.now ?? (() => new Date()))().toISOString();
        return buildSnapshot(config, workItem, syncedAt);
      }, 'ado-live-read-failed', `Unable to load ADO snapshot ${adoId} from live source`);
    },
  };
}

export function readLiveAdoSourceConfigFromEnv(environment: NodeJS.ProcessEnv): LiveAdoSourceConfig | null {
  const organizationUrl = environment.TESSERACT_ADO_ORG_URL?.trim();
  const project = environment.TESSERACT_ADO_PROJECT?.trim();
  const token = environment.TESSERACT_ADO_PAT?.trim();
  const suitePath = environment.TESSERACT_ADO_SUITE_PATH?.trim();
  if (!organizationUrl || !project || !token || !suitePath) {
    return null;
  }

  return {
    organizationUrl,
    project,
    token,
    suitePath,
    areaPath: environment.TESSERACT_ADO_AREA_PATH?.trim(),
    iterationPath: environment.TESSERACT_ADO_ITERATION_PATH?.trim(),
    tag: environment.TESSERACT_ADO_TAG?.trim(),
    apiVersion: environment.TESSERACT_ADO_API_VERSION?.trim(),
  };
}
