// Type-checks every `ts` block of the README, the docs and the examples, and
// every `@example` of the JSDoc, against the built package.
//
// The blocks of one document run in order and see each other's names, as a
// reader would. Each block opens a nested scope, so a later block may
// redeclare a name to show a variation. Imports are hoisted and merged.
// Names a snippet takes from the reader's code, such as `db` or `findUser`,
// are declared in `snippets.d.ts`. A document with no imports at all, such as
// the API reference or the JSDoc, gets every export of tryck. A block that
// does import from tryck must import every export it calls, so it can be
// copied on its own. Every exported value must carry an `@example`.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { $ } from 'bun'

interface Origin {
  readonly file: string
  readonly line: number
}

interface Block {
  readonly code: string
  readonly file: string
  readonly line: number
}

interface Document {
  readonly blocks: readonly Block[]
  readonly implicit: boolean
  readonly name: string
}

interface Exports {
  readonly sources: readonly string[]
  readonly types: readonly string[]
  readonly values: readonly string[]
}

interface Module {
  readonly origins: readonly (Origin | null)[]
  readonly source: string
}

const root = path.resolve(import.meta.dir, '../..')
const out = path.join(root, 'node_modules/.cache/tryck-snippets')
const fence = /^```ts\n(?<code>[\s\S]*?)^```$/gmu
const example = /^ \* @example\n(?<body>(?: \*.*\n)+?) \*\//gmu

const exportLine =
  /^export (?<kind>type )?\{(?<names>[^}]+)\} from '\.\/(?<from>[^']+)'/gmu

const importLine = /^import \{ (?<names>[^}]+) \} from '(?<from>[^']+)'$/u

const documented =
  /\/\*\*(?<doc>(?:(?!\*\/)[\s\S])*)\*\/\nexport declare (?:function|const) (?<name>\w+)/gu

const tscError =
  /^(?<generated>\S+\.ts)\((?<line>\d+),(?<column>\d+)\)(?<rest>.*)$/u

const read = (file: string) => readFile(path.join(root, file), 'utf-8')

const lineAt = (text: string, index = 0) =>
  text.slice(0, index).split('\n').length

const split = (names = '') => names.split(',').map(name => name.trim())

const exported = async (): Promise<Exports> => {
  const index = await read('src/index.ts')
  const found = [...index.matchAll(exportLine)]

  const names = (types: boolean) =>
    found.flatMap(match =>
      Boolean(match.groups?.kind) === types ? split(match.groups?.names) : []
    )

  return {
    sources: [...new Set(found.map(match => `src/${match.groups?.from}.ts`))],
    types: names(true),
    values: names(false)
  }
}

const markdownBlocks = (file: string, text: string): Block[] =>
  [...text.matchAll(fence)].map(match => ({
    code: match.groups?.code ?? '',
    file,
    line: lineAt(text, match.index) + 1
  }))

const exampleBlocks = (file: string, text: string): Block[] =>
  [...text.matchAll(example)].map(match => ({
    code: (match.groups?.body ?? '').replaceAll(/^ \*(?: |$)/gmu, ''),
    file,
    line: lineAt(text, match.index) + 1
  }))

const markdownDocuments = async (): Promise<Document[]> => {
  const examples = await readdir(path.join(root, 'examples'))

  const files = [
    'README.md',
    'docs/api.md',
    ...examples.flatMap(name =>
      name.endsWith('.md') ? [`examples/${name}`] : []
    )
  ]

  const texts = await Promise.all(files.map(read))

  return files.map((file, index) => {
    const text = texts[index] ?? ''

    return {
      blocks: markdownBlocks(file, text),
      implicit: !/^import /mu.test(text),
      name: file
    }
  })
}

// The JSDoc examples read like the API reference: everything is in scope,
// and the files follow the export order of `src/index.ts`.
const jsdocDocument = async (exports: Exports): Promise<Document> => {
  const texts = await Promise.all(exports.sources.map(read))

  return {
    blocks: exports.sources.flatMap((file, index) =>
      exampleBlocks(file, texts[index] ?? '')
    ),
    implicit: true,
    name: 'jsdoc'
  }
}

const implicitImports = (exports: Exports) =>
  new Map([
    [
      'tryck',
      new Set([...exports.values, ...exports.types.map(name => `type ${name}`)])
    ],
    ['zod', new Set(['z'])]
  ])

// Records an import line and reports whether the line was one.
const hoist = (imports: Map<string, Set<string>>, code: string) => {
  const found = importLine.exec(code)?.groups

  if (!found?.from) return false

  const merged = imports.get(found.from) ?? new Set<string>()

  for (const name of split(found.names)) merged.add(name)

  imports.set(found.from, merged)

  return true
}

const moduleOf = (document: Document, exports: Exports): Module => {
  const imports = document.implicit
    ? implicitImports(exports)
    : new Map<string, Set<string>>()

  const lines = document.blocks.flatMap(block => [
    { code: '{', origin: null },
    ...block.code
      .trimEnd()
      .split('\n')
      .map((code, offset) => ({
        code: hoist(imports, code) ? '' : code,
        origin: { file: block.file, line: block.line + offset }
      }))
  ])

  const header = [...imports].map(
    ([from, names]) =>
      `import { ${[...names].toSorted().join(', ')} } from '${from}'`
  )

  return {
    origins: [...header.map(() => null), ...lines.map(line => line.origin)],
    source: [
      ...header,
      ...lines.map(line => line.code),
      ...document.blocks.map(() => '}'),
      'export {}',
      ''
    ].join('\n')
  }
}

const calls = (code: string, name: string) =>
  new RegExp(`(?<![.\\w])${name}\\(`, 'u').test(code)

const missingImports = (document: Document, values: readonly string[]) =>
  document.blocks.flatMap(block => {
    const names = block.code
      .split('\n')
      .map(code => importLine.exec(code)?.groups)
      .find(found => found?.from === 'tryck')?.names

    if (!names) return []

    const imported = new Set(split(names))

    return values.flatMap(name =>
      !imported.has(name) && calls(block.code, name)
        ? [`${block.file}:${block.line}: calls ${name} but does not import it`]
        : []
    )
  })

const missingExamples = (declarations: string, values: readonly string[]) => {
  const withExample = new Set(
    [...declarations.matchAll(documented)].flatMap(match =>
      match.groups?.doc?.includes('@example') ? [match.groups.name] : []
    )
  )

  return values.flatMap(name =>
    withExample.has(name) ? [] : [`src: ${name} has no @example in its JSDoc`]
  )
}

const located = (output: string, modules: ReadonlyMap<string, Module>) =>
  output
    .trimEnd()
    .split('\n')
    .map(text => {
      const found = tscError.exec(text)?.groups

      if (!found?.generated) return text

      const origin = modules
        .get(path.basename(found.generated))
        ?.origins.at(Number(found.line) - 1)

      return origin
        ? `${origin.file}:${origin.line}:${found.column}${found.rest}`
        : text
    })

const exports = await exported()
const markdown = await markdownDocuments()
const documents = [...markdown, await jsdocDocument(exports)]

const modules = new Map(
  documents.map(document => [
    `${document.name.replaceAll('/', '__')}.ts`,
    moduleOf(document, exports)
  ])
)

await rm(out, { force: true, recursive: true })

await mkdir(out, { recursive: true })

await Promise.all(
  [...modules].map(([name, module]) =>
    writeFile(path.join(out, name), module.source)
  )
)

await writeFile(
  path.join(out, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      lib: ['ES2022', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      noEmit: true,
      paths: { tryck: [path.join(root, 'dist/index.d.ts')] },
      strict: true,
      target: 'ES2022',
      types: ['bun']
    },
    files: [path.join(import.meta.dir, 'snippets.d.ts'), ...modules.keys()]
  })
)

const checked =
  await $`${path.join(root, 'node_modules/.bin/tsc')} -p ${out} --pretty false`
    .cwd(out)
    .nothrow()
    .quiet()

const problems = [
  ...documents.flatMap(document => missingImports(document, exports.values)),
  ...missingExamples(await read('dist/index.d.ts'), exports.values),
  ...(checked.exitCode === 0 ? [] : located(checked.stdout.toString(), modules))
]

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
