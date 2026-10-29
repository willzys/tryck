import { defineConfig } from 'oxlint'
import antiSlop from 'ultracite/oxlint/anti-slop'
import core from 'ultracite/oxlint/core'

export default defineConfig({
  categories: {
    correctness: 'error',
    perf: 'error',
    suspicious: 'error'
  },
  extends: [core, antiSlop],
  ignorePatterns: core.ignorePatterns ?? [],
  overrides: [
    {
      files: ['src/**/*.ts'],
      rules: {
        'import/no-nodejs-modules': 'error',
        'no-console': 'error'
      }
    },
    {
      files: ['src/boundary/parse.ts'],
      rules: {
        'eslint/no-inline-comments': 'off',
        'eslint/no-redeclare': 'off'
      }
    },
    {
      files: ['src/index.ts'],
      rules: {
        'anti-slop/require-readable-spacing': 'off'
      }
    },
    {
      files: ['src/core/result.ts'],
      rules: {
        'max-classes-per-file': 'off',
        'require-yield': 'off'
      }
    },
    {
      files: ['tests/**/*.ts'],
      rules: {
        'eslint/func-names': 'off',
        'eslint/no-throw-literal': 'off',
        'eslint/require-await': 'off',
        'eslint/require-yield': 'off',
        'max-classes-per-file': 'off',
        'max-lines-per-function': 'off',
        'unicorn/consistent-function-scoping': 'off',
        'unicorn/custom-error-definition': 'off',
        'unicorn/error-message': 'off',
        'unicorn/prefer-structured-clone': 'off'
      }
    }
  ],
  rules: {
    complexity: ['error', { max: 8 }],
    curly: ['error', 'multi-line'],
    'max-depth': ['error', { max: 2 }],
    'max-lines-per-function': [
      'error',
      { max: 30, skipBlankLines: true, skipComments: true }
    ],
    'max-params': ['error', { max: 3 }],
    'typescript/no-explicit-any': 'error'
  }
})
