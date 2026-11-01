import { existsSync, readdirSync, readFileSync } from 'node:fs';

import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      // Written by next build in examples/next.
      '**/.next/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The editor's sources carry inline disables for these rules, so the plugins must be registered;
    // jsx-a11y runs with its recommended set, as in the source repo.
    files: ['packages/editor/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'jsx-a11y/no-autofocus': ['warn', { ignoreNonDOM: true }],
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-array-index-key': 'warn',
    },
  },
  {
    // ggraphic Studio: the same accessibility set as the editor, plus the hook rules.
    files: ['apps/studio/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-array-index-key': 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^@ggraphic/(?!(?:${publicEntries().join('|')})$)`,
              message:
                'Studio imports only public entry points: no `internal/*`, no deep paths. See docs/public-api-proposal.md.',
            },
          ],
        },
      ],
    },
  },
  {
    // The render gate harness draws with the test brands, which only the monorepo can reach.
    files: ['apps/studio/src/gate/**'],
    rules: { 'no-restricted-imports': 'off' },
  }
);

/** Every specifier a published `@ggraphic/*` export map names exactly (no wildcards), as regex alternatives. */
function publicEntries() {
  const packages = new URL('./packages/', import.meta.url);
  const entries = [];
  for (const dir of readdirSync(packages)) {
    const manifest = new URL(`${dir}/package.json`, packages);
    if (!existsSync(manifest)) continue;
    const { name, exports, publishConfig } = JSON.parse(readFileSync(manifest, 'utf8'));
    for (const key of Object.keys(publishConfig?.exports ?? exports ?? {})) {
      if (!key.includes('*')) entries.push(name.slice('@ggraphic/'.length) + key.slice(1));
    }
  }
  return entries.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}
