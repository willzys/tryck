import { describe, expect, expectTypeOf, test } from 'bun:test'

import { taggedError, err, match, ok } from '../../src'

import type { Result } from '../../src'

class NotFound extends taggedError('NotFound')<{ id: string }> {}

class Banned extends taggedError('Banned') {}

const lookup = (id: string): Result<string, NotFound | Banned> => {
  if (id === 'missing') return err(new NotFound({ id }))

  if (id === 'banned') return err(new Banned())

  return ok(id)
}

const status = (id: string) =>
  match(lookup(id), {
    Banned: () => 403,
    NotFound: () => 404,
    ok: () => 200
  })

describe('match', () => {
  test('dispatches oks and tagged errors', () => {
    expect([status('user'), status('missing'), status('banned')]).toEqual([
      200, 404, 403
    ])
  })

  test('narrows each handler to its own error', () => {
    const message = match(lookup('missing'), {
      Banned: error => error._tag,
      NotFound: error => error.id,
      ok: value => value
    })

    expect(message).toBe('missing')
  })

  test('returns the union of every handler', () => {
    const value = match(lookup('banned'), {
      Banned: () => false,
      NotFound: error => error.id.length,
      ok: name => name
    })

    expectTypeOf(value).toEqualTypeOf<string | number | boolean>()
    expect(value).toBe(false)
  })

  test('requires a handler for every tag or an err fallback', () => {
    const handlers = { NotFound: () => 0, ok: () => 0 }
    // @ts-expect-error: Banned has no handler and there is no err fallback
    const incomplete = () => match(lookup('user'), handlers)

    const fallback = match(lookup('banned'), {
      NotFound: () => 'not found',
      err: error => error._tag,
      ok: () => 'ok'
    })

    expect(fallback).toBe('Banned')
    expect(incomplete).toBeFunction()
  })

  test('rejects handlers for tags that cannot happen', () => {
    const typo = () =>
      match(lookup('user'), {
        Banned: () => 0,
        // @ts-expect-error: NotFond is not a tag of this result
        NotFond: () => 0,
        NotFound: () => 0,
        ok: () => 0
      })

    expect(typo).toBeFunction()
  })

  test('requires err for untagged errors', () => {
    const result: Result<number, string> = err('boom')
    // @ts-expect-error: string errors carry no tag
    const incomplete = () => match(result, { ok: () => 0 })

    expect(match(result, { err: error => error, ok: String })).toBe('boom')
    expect(incomplete).toBeFunction()
  })

  test('ignores tags that name Object.prototype members', () => {
    const inherited = ['constructor', 'toString', 'valueOf', '__proto__'].map(
      tag =>
        match(err(new (taggedError(tag))()), {
          err: () => 'fallback',
          ok: () => 'ok'
        })
    )

    expect(inherited).toEqual(['fallback', 'fallback', 'fallback', 'fallback'])
  })

  test('folds a result parsed back from JSON', () => {
    const wire: Result<string, NotFound> = JSON.parse(
      JSON.stringify(err(new NotFound({ id: '7' })))
    )

    expect(
      match(wire, {
        NotFound: error => `missing ${error.id}`,
        ok: name => name
      })
    ).toBe('missing 7')
  })

  test('accepts shared handler groups spread in', () => {
    const forbidden = { Banned: () => 403 }
    const missing = { NotFound: () => 404 }

    const code = match(lookup('banned'), {
      ...forbidden,
      ...missing,
      ok: () => 200
    })

    expectTypeOf(code).toEqualTypeOf<number>()
    expect(code).toBe(403)
  })

  test('never sends an error tagged ok to the ok handler', () => {
    const foreign: Result<string, { readonly _tag: 'ok' }> = err({ _tag: 'ok' })
    const value = match(foreign, { err: () => 'fallback', ok: name => name })

    expect(value).toBe('fallback')
  })

  test('needs only ok when nothing can fail', () => {
    const value = match(ok(1), { ok: one => one + 1 })

    expectTypeOf(value).toEqualTypeOf<number>()
    expect(value).toBe(2)
  })

  test('takes a promised result and returns a promise', async () => {
    const pending = Promise.resolve(lookup('missing'))

    const value = match(pending, {
      Banned: () => 403,
      NotFound: () => 404,
      ok: () => 200
    })

    expectTypeOf(value).toEqualTypeOf<Promise<number>>()
    expect(await value).toBe(404)
  })

  test('stays exhaustive for promised results', () => {
    const pending = Promise.resolve(lookup('user'))
    const handlers = { NotFound: () => 0, ok: () => 0 }
    // @ts-expect-error: Banned has no handler and there is no err fallback
    const incomplete = () => match(pending, handlers)

    expect(incomplete).toBeFunction()
  })

  test('types an any input as a promise, as before', () => {
    // JSON.parse returns any
    const fold = () => match(JSON.parse('null'), { err: () => 0, ok: () => 1 })

    expectTypeOf(fold).returns.toEqualTypeOf<Promise<number>>()
  })

  test('lets an unexpected rejection reject', async () => {
    const pending: Promise<Result<string, NotFound | Banned>> = Promise.reject(
      new TypeError('bug')
    )

    const value = match(pending, {
      err: () => 'typed',
      ok: () => 'ok'
    })

    await expect(value).rejects.toThrow(TypeError)
  })

  test('awaits async handlers in the returned type', async () => {
    const pending = Promise.resolve(lookup('missing'))

    const value = match(pending, {
      Banned: async () => 403,
      NotFound: () => 'missing',
      ok: async name => name.length
    })

    expectTypeOf(value).toEqualTypeOf<Promise<string | number>>()
    expect(await value).toBe('missing')
  })

  test('keeps async handlers visible on a sync result', () => {
    const value = match(lookup('user'), {
      Banned: () => 0,
      NotFound: () => 0,
      ok: async name => name
    })

    expectTypeOf(value).toEqualTypeOf<number | Promise<string>>()
  })

  test('throws when untyped callers leave an error unhandled', () => {
    // @ts-expect-error: untyped callers can still forget err
    const forgotten = () => match(err('x'), { ok: () => 0 })

    expect(forgotten).toThrow('unhandled error')
  })

  test('names the tag left unhandled', () => {
    const forgotten = () =>
      // @ts-expect-error: untyped callers can still forget a tag
      match(lookup('banned'), { NotFound: () => 0, ok: () => 0 })

    expect(forgotten).toThrow('unhandled error "Banned"')
  })
})
