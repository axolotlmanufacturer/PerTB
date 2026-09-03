import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import prettierConfig from 'eslint-config-prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * The affiliate link builders are contractual with Amazon Associates and the
 * eBay Partner Network. See CLAUDE.md §1.6 and known trap 12: parameter order
 * and presence are part of the agreement, and a "cleanup" that drops `mkevt`
 * or `toolid` silently zeroes revenue.
 *
 * ESLint has no per-file "lint but never autofix" switch, so this is enforced
 * in three layers:
 *
 *   1. Here — every auto-fixable rule is disabled for this path, so
 *      `eslint --fix` has nothing it is willing to rewrite.
 *   2. .prettierignore — Prettier does not format the file at all.
 *   3. test/unit/affiliate-immutability.test.ts — asserts that running the
 *      fixer and the formatter leaves the file byte-identical. That test is
 *      the actual guarantee; the two config entries just make it hold.
 *
 * The file is still *linted*: non-fixable correctness rules continue to report.
 * Only the rewriting is switched off.
 */
const AFFILIATE_FILE = 'src/lib/affiliate.ts';

const noAutofixForAffiliate = {
  name: 'perterabyte/affiliate-no-autofix',
  files: [AFFILIATE_FILE],
  rules: {
    // Formatting-adjacent fixable rules.
    quotes: 'off',
    semi: 'off',
    indent: 'off',
    'comma-dangle': 'off',
    'object-curly-spacing': 'off',
    'quote-props': 'off',
    'arrow-body-style': 'off',
    'object-shorthand': 'off',
    'prefer-template': 'off',
    'dot-notation': 'off',
    // Fixable rules that would rewrite the URL-building expressions themselves.
    'prefer-const': 'off',
    'no-useless-concat': 'off',
    'no-useless-escape': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/no-unnecessary-condition': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
  },
};

const config = [
  {
    name: 'perterabyte/ignores',
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'next-env.d.ts',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    name: 'perterabyte/rules',
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `any` erases exactly the guarantees this codebase depends on.
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },

  // Prettier last among the rule-bearing entries: switches off everything
  // stylistic so the formatter is the single authority on layout.
  { name: 'perterabyte/prettier', ...prettierConfig },

  // Must come after `prettierConfig` so its `off`s are not re-enabled.
  noAutofixForAffiliate,
];

export default config;
