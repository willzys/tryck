const entry = Bun.fileURLToPath(new URL('only-ok.ts', import.meta.url))
const build = await Bun.build({ entrypoints: [entry], minify: true })
const [bundle] = build.outputs
const code = bundle ? await bundle.text() : ''

if (!build.success || code.includes('ValidationError')) {
  throw new Error(
    `tryck: importing ok pulled in unused code (${code.length} bytes)`
  )
}
