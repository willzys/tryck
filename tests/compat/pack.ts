import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { $ } from 'bun'

const root = path.resolve(import.meta.dir, '../..')
const project = await mkdtemp(path.join(tmpdir(), 'tryck-pack-'))

try {
  const packed = await $`npm pack --silent --pack-destination ${project}`
    .cwd(root)
    .text()

  const tarball = packed.trim()

  await writeFile(
    path.join(project, 'package.json'),
    JSON.stringify({ name: 'consumer', private: true, type: 'module' })
  )
  await writeFile(
    path.join(project, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        skipLibCheck: false,
        strict: true,
        target: 'ES2022',
        types: []
      },
      files: ['consumer.ts']
    })
  )
  await cp(
    path.join(import.meta.dir, 'consumer.ts'),
    path.join(project, 'consumer.ts')
  )

  await $`npm install --silent --no-audit --no-fund ./${tarball}`.cwd(project)
  await $`${path.join(root, 'node_modules/.bin/tsc')} -p .`.cwd(project)
  await writeFile(
    path.join(project, 'run.ts'),
    [
      "import { contracts, run } from './consumer.ts'",
      'const outcomes = [await run(\'{"id":"1"}\'), await contracts()]',
      "if (outcomes.join() !== '12,0') throw new Error(outcomes.join())"
    ].join('\n')
  )
  await $`node run.ts`.cwd(project)
} finally {
  await rm(project, { force: true, recursive: true })
}
