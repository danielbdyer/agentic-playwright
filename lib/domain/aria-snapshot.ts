import YAML from 'yaml';

export interface CanonicalAriaSnapshotNode {
  role?: string;
  name?: string;
  value?: string;
  checked?: boolean | 'mixed';
  pressed?: boolean | 'mixed';
  disabled?: boolean;
  expanded?: boolean;
  selected?: boolean;
  children?: CanonicalAriaSnapshotNode[];
}

type CanonicalAriaSnapshot = CanonicalAriaSnapshotNode | CanonicalAriaSnapshotNode[] | null;

const wrapperRoles = new Set(['none', 'presentation', 'rowgroup']);
const textRoles = new Set(['text', 'InlineTextBox']);

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeRole(value: unknown): string | undefined {
  const role = normalizeString(value);
  if (!role) {
    return undefined;
  }
  if (role === 'gridcell') {
    return 'cell';
  }
  if (role === 'InlineTextBox') {
    return 'text';
  }
  return role;
}

function nodeHasState(node: CanonicalAriaSnapshotNode): boolean {
  return (
    node.value !== undefined
    || node.checked !== undefined
    || node.pressed !== undefined
    || node.disabled !== undefined
    || node.expanded !== undefined
    || node.selected !== undefined
  );
}

function isRedundantTextSubtree(node: CanonicalAriaSnapshotNode, parentName: string | undefined): boolean {
  if (!node.role || !textRoles.has(node.role) || !parentName || node.name !== parentName || nodeHasState(node)) {
    return false;
  }

  return (node.children ?? []).every((child) => isRedundantTextSubtree(child, parentName));
}

function shouldCollapseWrapper(node: CanonicalAriaSnapshotNode): boolean {
  return Boolean(node.role && wrapperRoles.has(node.role) && !node.name && !nodeHasState(node));
}

function canonicalizeNode(input: unknown): CanonicalAriaSnapshotNode[] {
  if (!input || typeof input !== 'object') {
    return [];
  }

  const record = input as Record<string, unknown>;
  const role = normalizeRole(record.role);
  const name = normalizeString(record.name);
  const value = normalizeString(record.value ?? record.valueString);
  const children = Array.isArray(record.children)
    ? record.children.flatMap((child) => canonicalizeNode(child))
    : [];

  const node: CanonicalAriaSnapshotNode = {};
  if (role) node.role = role;
  if (name) node.name = name;
  if (value) node.value = value;
  if (typeof record.checked === 'boolean' || record.checked === 'mixed') node.checked = record.checked;
  if (typeof record.pressed === 'boolean' || record.pressed === 'mixed') node.pressed = record.pressed;
  if (typeof record.disabled === 'boolean') node.disabled = record.disabled;
  if (typeof record.expanded === 'boolean') node.expanded = record.expanded;
  if (typeof record.selected === 'boolean') node.selected = record.selected;

  const filteredChildren = children.filter((child) => !isRedundantTextSubtree(child, node.name));
  if (filteredChildren.length > 0) {
    node.children = filteredChildren;
  }

  if (shouldCollapseWrapper(node)) {
    return node.children ?? [];
  }

  if (!node.role && !node.name && !nodeHasState(node)) {
    return node.children ?? [];
  }

  return [node];
}

function formatNormalizedYaml(value: CanonicalAriaSnapshot): string {
  if (value === null) {
    return '';
  }

  return YAML.stringify(value, { indent: 2 })
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

export function canonicalizeAriaSnapshot(input: unknown): CanonicalAriaSnapshot {
  const nodes = canonicalizeNode(input);
  if (nodes.length === 0) {
    return null;
  }
  return nodes.length === 1 ? nodes[0] : nodes;
}

export function renderAriaSnapshot(input: unknown): string {
  return formatNormalizedYaml(canonicalizeAriaSnapshot(input));
}

export function normalizeAriaSnapshot(snapshot: string): string {
  const normalized = snapshot.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    return '';
  }

  try {
    return renderAriaSnapshot(YAML.parse(normalized));
  } catch {
    return normalized
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .trim();
  }
}
