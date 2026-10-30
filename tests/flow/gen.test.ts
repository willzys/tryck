import { describe, expect, expectTypeOf, test } from 'bun:test'

import { err, gen, ok } from '../../src'

import type { Result } from '../../src'

const half = (value: number): Result<number, 'odd'> =>
  value % 2 === 0 ? ok(value / 2) : err('odd')

const positive = (value: number): Result<number, 'negative'> =>
  value < 0 ? err('negative') : ok(value)

describe('gen', () => {
  test('unwraps oks and wraps the returned value', () => {
    const result = gen(function* () {
      const value = yield* half(8)

      return yield* positive(value)
    })

    expect(result).toEqual(ok(4))
  })

  test('collects every error into one union', () => {
    const result = gen(function* () {
      return yield* positive(yield* half(8))
    })

    expectTypeOf(result).toEqualTypeOf<Result<number, 'odd' | 'negative'>>()
  })

  test('stops at the first err', () => {
    let resumed = false

    const result = gen(function* () {
      yield* half(3)
      resumed = true

      return 0
    })

    expect(result).toEqual(err('odd'))
    expect(resumed).toBe(false)
  })

  test('fails early on a yielded err', () => {
    const result = gen(function* () {
      yield* err('guard')

      return 1
    })

    expectTypeOf(result).toEqualTypeOf<Result<number, 'guard'>>()
    expect(result).toEqual(err('guard'))
  })

  test('runs finally blocks when it short-circuits', () => {
    let released = false

    gen(function* () {
      try {
        return yield* half(1)
      } finally {
        released = true
      }
    })

    expect(released).toBe(true)
  })

  test('passes through a returned result instead of nesting it', () => {
    const failed = gen(function* () {
      const value = yield* half(8)

      return value > 1 ? err('big' as const) : ok(value)
    })

    expectTypeOf(failed).toEqualTypeOf<Result<number, 'odd' | 'big'>>()
    expect(failed).toEqual(err('big'))
    expect(
      gen(function* () {
        return ok(1)
      })
    ).toEqual(ok(1))
  })

  test('rejects a plain yield, which would skip unwrapping', () => {
    const plain = () =>
      // @ts-expect-error: yield a Result with yield*, not yield
      gen(function* () {
        yield 5

        return 1
      })

    expect(plain).toBeFunction()
  })

  test('passes through a result created by another copy of tryck', () => {
    class ForeignOk {
      *[Symbol.iterator]() {
        return this.value
      }

      readonly ok = true
      readonly value = 1
    }

    const foreign = new ForeignOk()

    expect(
      gen(function* () {
        return foreign
      })
    ).toBe(foreign)
  })

  test('wraps returned values that only look like results', () => {
    const response = new Response('body')

    const iterable = {
      *[Symbol.iterator]() {
        yield 1
      },
      ok: true
    }

    const flagged = Object.assign([1, 2], { ok: false })

    const returned = [response, iterable, flagged].map(value =>
      gen(function* () {
        return value
      })
    )

    expect(returned).toEqual([ok(response), ok(iterable), ok(flagged)])
  })

  test('lets defects thrown in the body escape', () => {
    const body = () =>
      gen(function* () {
        throw new TypeError('bug')
      })

    expect(body).toThrow(TypeError)
  })

  test('lets defects in async bodies reject', async () => {
    const result = gen(async function* () {
      yield* await Promise.resolve(half(8))
      throw new TypeError('bug')
    })

    await expect(result).rejects.toThrow(TypeError)
  })

  test('runs async bodies', async () => {
    const result = gen(async function* () {
      const value = yield* await Promise.resolve(half(8))

      return yield* positive(value)
    })

    expectTypeOf(result).toEqualTypeOf<
      Promise<Result<number, 'odd' | 'negative'>>
    >()
    expect(await result).toEqual(ok(4))
  })

  test('short-circuits async bodies and runs their finally blocks', async () => {
    let released = false

    const result = await gen(async function* () {
      try {
        return yield* await Promise.resolve(half(1))
      } finally {
        released = true
      }
    })

    expect(result).toEqual(err('odd'))
    expect(released).toBe(true)
  })
})
