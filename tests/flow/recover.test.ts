import { describe, expect, expectTypeOf, test } from 'bun:test'

import { taggedError, err, ok, recover } from '../../src'

import type { Result } from '../../src'

class NotFound extends taggedError('NotFound')<{ id: string }> {}

class Banned extends taggedError('Banned') {}

class Gone extends taggedError('Gone') {}

const lookup = (id: string): Result<string, NotFound | Banned> => {
  if (id === 'missing') return err(new NotFound({ id }))

  if (id === 'banned') return err(new Banned())

  return ok(id)
}

describe('recover', () => {
  test('turns a handled tag into a value and drops it from the type', () => {
    const result = recover(lookup('missing'), { NotFound: () => ok('guest') })

    expectTypeOf(result).toEqualTypeOf<Result<string, Banned>>()
    expect(result).toEqual(ok('guest'))
  })

  test('finds handlers inherited from a prototype', () => {
    const shared = { NotFound: () => ok('guest') }
    const result = recover(lookup('missing'), Object.create(shared))

    expect(result).toEqual(ok('guest'))
  })

  test('leaves other errors untouched', () => {
    const result = recover(lookup('banned'), { NotFound: () => ok('guest') })

    expect(result.ok ? undefined : result.error).toBeInstanceOf(Banned)
  })

  test('lets a handler fail with a new error', () => {
    const result = recover(lookup('missing'), {
      NotFound: error => err(new Gone({ cause: error }))
    })

    expectTypeOf(result).toEqualTypeOf<Result<string, Banned | Gone>>()
    expect(result.ok ? undefined : result.error).toBeInstanceOf(Gone)
  })

  test('recovers every error with err', () => {
    const result = recover(lookup('banned'), { err: () => ok(0) })

    expectTypeOf(result).toEqualTypeOf<Result<string | number, never>>()
    expect(result).toEqual(ok(0))
  })

  test('recovers a promised result into a promise', async () => {
    const result = recover(Promise.resolve(lookup('missing')), {
      NotFound: () => ok('guest')
    })

    expectTypeOf(result).toEqualTypeOf<Promise<Result<string, Banned>>>()
    expect(await result).toEqual(ok('guest'))
  })

  test('lets a rejection reject', async () => {
    const rejected: Promise<Result<string, NotFound>> = Promise.reject(
      new TypeError('bug')
    )

    await expect(
      recover(rejected, { NotFound: () => ok('guest') })
    ).rejects.toThrow(TypeError)
  })

  test('passes an ok through', () => {
    expect(recover(lookup('user'), { NotFound: () => ok('guest') })).toEqual(
      ok('user')
    )
  })

  test('rejects handlers for tags that cannot happen', () => {
    const typo = () =>
      // @ts-expect-error: NotFond is not a tag of this result
      recover(lookup('user'), { NotFond: () => ok('guest') })

    expect(typo).toBeFunction()
  })
})
