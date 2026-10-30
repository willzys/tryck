import { defineConfig } from 'oxfmt'
import ultracite from 'ultracite/oxfmt'

export default defineConfig({
  ...ultracite,
  arrowParens: 'avoid',
  semi: false,
  singleQuote: true,
  sortImports: {
    groups: [
      'builtin',
      'external',
      ['internal', 'subpath'],
      ['parent', 'sibling', 'index'],
      'style',
      'unknown',
      'type'
    ],
    ignoreCase: true,
    newlinesBetween: true,
    order: 'asc'
  },
  trailingComma: 'none'
})
