import { describe, expect, expectTypeOf, test } from 'bun:test'

import { err, mapErr, ok } from '../../src'

import type { Err, Ok, Result } from '../../src'

const parse = (input: string): Result<number, 'nan'> => {
  const value = Number(input)

  return Number.isNaN(value) ? err('nan') : ok(value)
}

describe('ok', () => {
  test('carries a value', () => {
    const result = ok(1)

    expect(result).toEqual(expect.objectContaining({ ok: true, value: 1 }))
    expectTypeOf(result).toEqualTypeOf<Ok<number>>()
  })

  test('carries nothing when called bare', () => {
    expectTypeOf(ok()).toEqualTypeOf<Ok<void>>()
    expect(ok().value).toBeUndefined()
  })
})

describe('err', () => {
  test('carries an error with a literal type', () => {
    const result = err('not_found')

    expect(result).toEqual(
      expect.objectContaining({ error: 'not_found', ok: false })
    )
    expectTypeOf(result).toEqualTypeOf<Err<'not_found'>>()
  })

  test('refuses to be iterated outside gen', () => {
    expect(() => [...err('x')]).toThrow('yield* an Err only inside gen')
  })
})

describe('mapErr', () => {
  test('transforms the error of an err', () => {
    const result = mapErr(parse('x'), cause => ({ cause, code: 400 }))

    expectTypeOf(result).toEqualTypeOf<
      Result<number, { cause: 'nan'; code: number }>
    >()
    expect(result).toEqual(err({ cause: 'nan', code: 400 }))
  })

  test('maps a promised result into a promise', async () => {
    const result = mapErr(Promise.resolve(parse('x')), () => 400)

    expectTypeOf(result).toEqualTypeOf<Promise<Result<number, number>>>()
    expect(await result).toEqual(err(400))
  })

  test('lets a rejection reject', async () => {
    const rejected: Promise<Result<number, 'nan'>> = Promise.reject(
      new TypeError('bug')
    )

    await expect(mapErr(rejected, () => 400)).rejects.toThrow(TypeError)
  })

  test('leaves an ok untouched', () => {
    expect(mapErr(parse('1'), () => 'never')).toEqual(ok(1))
  })

  test('rejects async callbacks, which would wrap a promise in an err', () => {
    const wrapped = () =>
      // @ts-expect-error: the callback must return the new error, not a promise
      mapErr(parse('x'), async () => 400)

    expect(wrapped).toBeFunction()
  })
})

describe('Result', () => {
  test('narrows on ok', () => {
    const result = parse('42')

    if (result.ok) expectTypeOf(result.value).toEqualTypeOf<number>()
    else expectTypeOf(result.error).toEqualTypeOf<'nan'>()
    expect(result.ok).toBe(true)
  })

  test('serializes as plain data', () => {
    expect(JSON.stringify(ok(1))).toBe('{"ok":true,"value":1}')
    expect(JSON.stringify(err('x'))).toBe('{"ok":false,"error":"x"}')
  })
})
