// Keeps the build under the size the README states.

import path from 'node:path'

const root = path.resolve(import.meta.dir, '../..')
const readme = await Bun.file(path.join(root, 'README.md')).text()

const claim = /Under (?<kb>[\d.]+) kB minified and gzipped/u.exec(readme)
  ?.groups?.kb

if (!claim) throw new Error('tryck: the README no longer states the size')

const build = await Bun.build({
  entrypoints: [path.join(root, 'dist/index.js')],
  minify: true
})

const [bundle] = build.outputs
const code = bundle ? await bundle.text() : ''
const size = Bun.gzipSync(code, { level: 9 }).length

if (!build.success || size >= Number(claim) * 1000) {
  throw new Error(
    `tryck: ${size} bytes minified and gzipped, over the ${claim} kB in the README`
  )
}
