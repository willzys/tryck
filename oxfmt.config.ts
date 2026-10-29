import { defineConfig } from 'oxfmt'
import ultracite from 'ultracite/oxfmt'

export default defineConfig({
  ...ultracite,
  arrowParens: 'avoid',
  semi: false,
  singleQuote: true,
  trailingComma: 'none'
})
