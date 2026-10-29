import { describe, expect, expectTypeOf, test } from 'bun:test'

import { all, err, gen, ok } from '../../src'
import type { Result } from '../../src'

const user = (id: string): Result<{ id: string }, 'missing'> =>
  id ? ok({ id }) : err('missing')

const later = <T>(value: T): Promise<T> => Promise.resolve(value)

describe('all', () => {
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
