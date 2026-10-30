import { describe, expect, expectTypeOf, test } from 'bun:test'
import path from 'node:path'

import { all, err, gen, ok } from '../../src'

import type { Result } from '../../src'

const user = (id: string): Result<{ id: string }, 'missing'> =>
  id ? ok({ id }) : err('missing')

const later = <T>(value: T): Promise<T> => Promise.resolve(value)

const after = async <T>(ms: number, value: T): Promise<T> => {
  await Bun.sleep(ms)

  return value
}

// Runs code in a fresh process, where unhandled rejections reach `process`.
const unhandled = (code: string): string[] => {
  const script = `
    import { all, err, ok } from ${JSON.stringify(path.resolve(import.meta.dir, '../../src'))}
    const seen = []
    process.on('unhandledRejection', error => seen.push(error.message))
    ${code}
    console.log(JSON.stringify(seen))
  `

  const run = Bun.spawnSync([process.execPath, '-e', script])

  return JSON.parse(run.stdout.toString())
}

describe('all', () => {
  test('returns an err without waiting for slower items', async () => {
    const started = performance.now()
    const result = await all([after(5, err('first')), after(400, ok(1))])

    expect(result).toEqual(err('first'))
    expect(performance.now() - started).toBeLessThan(200)
  })

  test('keeps input order when a later item fails sooner', async () => {
    const result = await all([after(50, err('a')), after(5, err('b'))])

    expect(result).toEqual(err('a'))
  })

  test('waits for earlier items before returning a later err', async () => {
    const result = await all([after(50, ok(1)), after(5, err('b'))])

    expect(result).toEqual(err('b'))
  })

  test('surfaces a defect that comes after it returned', () => {
    expect(
      unhandled(`
        const late = Bun.sleep(20).then(() => { throw new TypeError('late bug') })
        await all([Bun.sleep(5).then(() => err('first')), late])
        await Bun.sleep(60)
      `)
    ).toEqual(['late bug'])
  })

  test('does not surface the defect it rejected with', () => {
    expect(
      unhandled(`
        const defect = Bun.sleep(5).then(() => { throw new TypeError('bug') })
        await all([Bun.sleep(50).then(() => ok(1)), defect]).catch(() => null)
        await Bun.sleep(80)
      `)
    ).toEqual([])
  })

  test('rejects on a defect', async () => {
    const defect = Promise.reject(new TypeError('bug'))

    await expect(all([after(50, ok(1)), defect])).rejects.toThrow('bug')
  })

  test('treats a result whose ok is not exactly true as an err', () => {
    const forged: Result<number, string> = JSON.parse(
      '{"ok":"false","error":"forged"}'
    )

    expect<unknown>(all([ok(1), forged])).toBe(forged)
  })

  test('collects values into a tuple', () => {
    const result = all([user('1'), ok(2)])

    expectTypeOf(result).toEqualTypeOf<
      Result<[{ id: string }, number], 'missing'>
    >()
    expect(result).toEqual(ok([{ id: '1' }, 2]))
  })

  test('returns the first err in input order', () => {
    expect(all([ok(1), err('a'), err('b')])).toEqual(err('a'))
  })

  test('awaits promised results concurrently', async () => {
    const result = all([later(user('1')), ok('sync')])

    expectTypeOf(result).toEqualTypeOf<
      Promise<Result<[{ id: string }, string], 'missing'>>
    >()
    expect(await result).toEqual(ok([{ id: '1' }, 'sync']))
  })

  test('picks the first err in input order, not in settling order', async () => {
    const slow = Promise.withResolvers<Result<number, 'slow'>>()
    const fast = Promise.withResolvers<Result<number, 'fast'>>()
    const result = all([slow.promise, fast.promise])

    fast.resolve(err('fast'))
    slow.resolve(err('slow'))

    expect(await result).toEqual(err('slow'))
  })

  test('rejects when a promise rejects, as a defect', async () => {
    const result = all([Promise.reject(new TypeError('bug')), ok(1)])

    await expect(result).rejects.toThrow(TypeError)
  })

  test('runs steps in parallel inside gen', async () => {
    const result = await gen(async function* () {
      const [first, second] = yield* await all([
        later(user('1')),
        later(user('2'))
      ])

      return [first.id, second.id]
    })

    expect(result).toEqual(ok(['1', '2']))
  })
})
