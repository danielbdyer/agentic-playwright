const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

const tsFiles = ['**/*.ts', '**/*.tsx', 'playwright*.ts'];
const nodeScriptGlobals = {
  __dirname: 'readonly',
  module: 'readonly',
  require: 'readonly',
  exports: 'writable',
  process: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

const typedRules = {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
  }],
  '@typescript-eslint/consistent-type-imports': ['error', {
    prefer: 'type-imports',
    fixStyle: 'separate-type-imports',
  }],
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': ['error', {
    checksVoidReturn: {
      attributes: false,
    },
  }],
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  '@typescript-eslint/ban-ts-comment': ['error', {
    'ts-check': false,
    'ts-expect-error': 'allow-with-description',
    'ts-ignore': true,
    'ts-nocheck': true,
    minimumDescriptionLength: 8,
  }],
};

module.exports = [
  {
    ignores: [
      'dashboard/**',
      'dogfood/.ado-sync/**',
      '.tesseract/**',
      '.tools/**',
      'dist/**',
      'dogfood/generated/**',
      'generated/**',
      'lib/generated/**',
      'node_modules/**',
      'scripts/**',
      'test-results/**',
      'tests-capture/**',
    ],
  },
  {
    files: ['scripts/**/*.cjs', '*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: nodeScriptGlobals,
    },
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: tsFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: typedRules,
  },
  {
    files: ['lib/domain/schemas/**/*.ts', 'lib/domain/validation/**/*.ts', 'lib/domain/algebra/**/*.ts', 'lib/domain/graph-query.ts', 'lib/domain/program.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '@playwright/test', message: 'Domain must stay free of Playwright dependencies.' },
          { name: 'playwright', message: 'Domain must stay free of Playwright dependencies.' },
        ],
        patterns: [
          { group: ['../application', '../application/*', '../application/**', '../../application', '../../application/*', '../../application/**'], message: 'Domain must not import the application layer.' },
          { group: ['../infrastructure', '../infrastructure/*', '../infrastructure/**', '../../infrastructure', '../../infrastructure/*', '../../infrastructure/**'], message: 'Domain must not import infrastructure.' },
          { group: ['../runtime', '../runtime/*', '../runtime/**', '../../runtime', '../../runtime/*', '../../runtime/**'], message: 'Domain must not import runtime.' },
        ],
      }],
    },
  },
  {
    files: ['lib/domain/**/*.ts'],
    ignores: ['lib/domain/schemas/**/*.ts', 'lib/domain/validation/**/*.ts', 'lib/domain/algebra/**/*.ts', 'lib/domain/graph-query.ts', 'lib/domain/program.ts', 'lib/domain/types/agent-interpreter.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'effect', message: 'Domain must stay free of Effect runtime dependencies.' },
          { name: '@playwright/test', message: 'Domain must stay free of Playwright dependencies.' },
          { name: 'playwright', message: 'Domain must stay free of Playwright dependencies.' },
        ],
        patterns: [
          { group: ['effect/*'], message: 'Domain must stay free of Effect runtime dependencies.' },
          { group: ['../application', '../application/*', '../application/**'], message: 'Domain must not import the application layer.' },
          { group: ['../infrastructure', '../infrastructure/*', '../infrastructure/**'], message: 'Domain must not import infrastructure.' },
          { group: ['../runtime', '../runtime/*', '../runtime/**'], message: 'Domain must not import runtime.' },
        ],
      }],
      'no-restricted-syntax': ['error',
        { selector: "VariableDeclaration[kind='let']", message: 'Prefer const with pure expressions. Use reduce/map/filter instead of let + mutation.' },
        { selector: "CallExpression[callee.property.name='push']", message: 'Prefer spread, concat, or reduce over Array.push.' },
        { selector: "CallExpression[callee.property.name='splice']", message: 'Prefer [...arr.slice(0,i), ...arr.slice(i+1)] over Array.splice.' },
        { selector: "CallExpression[callee.property.name='unshift']", message: 'Prefer [newItem, ...arr] over Array.unshift.' },
        { selector: "CallExpression[callee.property.name='fill']", message: 'Prefer Array.from({ length: n }, () => value) over Array.fill.' },
        { selector: "CallExpression[callee.property.name='pop']", message: 'Prefer arr.slice(0, -1) and arr.at(-1) over Array.pop.' },
        { selector: "CallExpression[callee.property.name='map'][callee.object.callee.property.name='filter']", message: 'Prefer .flatMap() over .filter().map() to avoid double traversal.' },
        { selector: "CallExpression[callee.property.name='flat'][callee.object.callee.property.name='map']", message: 'Prefer .flatMap() over .map().flat() to avoid double traversal.' },
        { selector: "CallExpression[callee.property.name='filter'][callee.object.callee.property.name='map']", message: 'Prefer .flatMap() over .map().filter() to avoid double traversal.' },
        { selector: 'ForStatement', message: 'Prefer map/filter/reduce/flatMap over imperative for loops.' },
        { selector: 'ForInStatement', message: 'Prefer Object.entries().map() over for...in.' },
      ],
    },
  },
  {
    files: ['lib/domain/types/agent-interpreter.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '@playwright/test', message: 'Domain must stay free of Playwright dependencies.' },
          { name: 'playwright', message: 'Domain must stay free of Playwright dependencies.' },
        ],
        patterns: [
          { group: ['../application', '../application/*', '../application/**'], message: 'Domain must not import the application layer.' },
          { group: ['../infrastructure', '../infrastructure/*', '../infrastructure/**'], message: 'Domain must not import infrastructure.' },
          { group: ['../runtime', '../runtime/*', '../runtime/**'], message: 'Domain must not import runtime.' },
        ],
      }],
    },
  },
  {
    files: ['lib/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['../infrastructure', '../infrastructure/*', '../infrastructure/**'], message: 'Application must not import infrastructure implementations.' },
          { group: ['../runtime', '../runtime/*', '../runtime/**'], message: 'Application must not import runtime orchestration.' },
        ],
      }],
      'no-restricted-syntax': ['error',
        { selector: "ThrowStatement > NewExpression[callee.name='Error']", message: 'Use structured domain/runtime errors instead of throwing Error in application/runtime code.' },
        { selector: "CallExpression[callee.property.name='push']", message: 'Prefer spread, concat, or reduce over Array.push.' },
        { selector: "CallExpression[callee.property.name='splice']", message: 'Prefer [...arr.slice(0,i), ...arr.slice(i+1)] over Array.splice.' },
        { selector: "CallExpression[callee.property.name='unshift']", message: 'Prefer [newItem, ...arr] over Array.unshift.' },
        { selector: "CallExpression[callee.property.name='fill']", message: 'Prefer Array.from({ length: n }, () => value) over Array.fill.' },
        { selector: "CallExpression[callee.property.name='pop']", message: 'Prefer arr.slice(0, -1) and arr.at(-1) over Array.pop.' },
        { selector: "CallExpression[callee.property.name='map'][callee.object.callee.property.name='filter']", message: 'Prefer .flatMap() over .filter().map() to avoid double traversal.' },
        { selector: "CallExpression[callee.property.name='flat'][callee.object.callee.property.name='map']", message: 'Prefer .flatMap() over .map().flat() to avoid double traversal.' },
        { selector: "CallExpression[callee.property.name='filter'][callee.object.callee.property.name='map']", message: 'Prefer .flatMap() over .map().filter() to avoid double traversal.' },
        { selector: 'ForStatement', message: 'Prefer map/filter/reduce/flatMap over imperative for loops.' },
        { selector: 'ForInStatement', message: 'Prefer Object.entries().map() over for...in.' },
      ],
    },
  },
  {
    files: ['lib/runtime/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['../application', '../application/*', '../application/**'], message: 'Runtime must stay isolated from application orchestration.' },
          { group: ['../infrastructure', '../infrastructure/*', '../infrastructure/**'], message: 'Runtime must stay isolated from infrastructure orchestration.' },
        ],
      }],
      'no-restricted-syntax': ['error',
        { selector: "ThrowStatement > NewExpression[callee.name='Error']", message: 'Use structured domain/runtime errors instead of throwing Error in application/runtime code.' },
        { selector: "CallExpression[callee.property.name='push']", message: 'Prefer spread, concat, or reduce over Array.push.' },
        { selector: "CallExpression[callee.property.name='splice']", message: 'Prefer [...arr.slice(0,i), ...arr.slice(i+1)] over Array.splice.' },
        { selector: "CallExpression[callee.property.name='unshift']", message: 'Prefer [newItem, ...arr] over Array.unshift.' },
        { selector: "CallExpression[callee.property.name='fill']", message: 'Prefer Array.from({ length: n }, () => value) over Array.fill.' },
        { selector: "CallExpression[callee.property.name='pop']", message: 'Prefer arr.slice(0, -1) and arr.at(-1) over Array.pop.' },
        { selector: "CallExpression[callee.property.name='map'][callee.object.callee.property.name='filter']", message: 'Prefer .flatMap() over .filter().map() to avoid double traversal.' },
        { selector: "CallExpression[callee.property.name='flat'][callee.object.callee.property.name='map']", message: 'Prefer .flatMap() over .map().flat() to avoid double traversal.' },
        { selector: "CallExpression[callee.property.name='filter'][callee.object.callee.property.name='map']", message: 'Prefer .flatMap() over .map().filter() to avoid double traversal.' },
      ],
    },
  },
  {
    files: ['lib/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['../runtime', '../runtime/*', '../runtime/**', '../../runtime', '../../runtime/*', '../../runtime/**'], message: 'Infrastructure must not import runtime internals.' },
        ],
      }],
    },
  },
  {
    files: ['lib/**/*.ts'],
    ignores: [
      'lib/composition/**',
      'lib/infrastructure/tooling/**',
    ],
    rules: {
      'no-restricted-properties': ['error', {
        object: 'process',
        property: 'env',
        message: 'Read environment variables only at explicit boundary modules.',
      }],
      'no-restricted-syntax': ['error',
        {
          selector: "CallExpression[callee.object.name='Effect'][callee.property.name='runPromise']",
          message: 'Use Effect.runPromise only in lib/composition adapters.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-misused-promises': ['error', {
        checksVoidReturn: false,
      }],
    },
  },
  {
    files: ['playwright*.ts'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
];
