import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { defineConfig } from 'tsdown'

const danglingMap = /\n\/\/# sourceMappingURL=\S+\.d\.ts\.map\s*$/u

const stripDeclarationMap = async (outDir: string) => {
  const file = path.join(outDir, 'index.d.ts')
  const content = await readFile(file, 'utf-8')

  await writeFile(file, content.replace(danglingMap, '\n'))
}

export default defineConfig({
  clean: true,
  dts: { generator: 'oxc' },
  entry: ['src/index.ts'],
  format: 'esm',
  hooks: {
    'build:done': ctx => stripDeclarationMap(ctx.options.outDir)
  },
  platform: 'neutral',
  publint: true,
  sourcemap: true,
  target: 'es2022'
})
