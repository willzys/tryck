import { describe, expect, expectTypeOf, test } from 'bun:test'

import { err, gen, match, ok, revive, taggedError } from '../../src'

import type { Result } from '../../src'

class NotFound extends taggedError('NotFound')<{ id: string }> {}

class Banned extends taggedError('Banned') {}

const wire = (result: Result<unknown, unknown>) =>
  JSON.parse(JSON.stringify(result))

describe('revive', () => {
  test('rebuilds an err as an instance of its class', () => {
    const cause = new Error('row missing')
    const sent = err(new NotFound({ cause, id: '7', message: 'no user 7' }))
    const result = revive(wire(sent), { Banned, NotFound })

    expect(result.ok).toBe(false)

    const error = result.ok ? undefined : result.error

    expect(error).toBeInstanceOf(NotFound)
    expect(error?._tag).toBe('NotFound')
    expect(error?.message).toBe('no user 7')
    expect(error instanceof NotFound ? error.id : undefined).toBe('7')
    expect(error?.cause).toEqual({ message: 'row missing', name: 'Error' })
  })

  test('types the err with the classes of the table', () => {
    const result = revive(wire(err(new Banned())), { Banned, NotFound })

    expectTypeOf(result).toEqualTypeOf<Result<unknown, Banned | NotFound>>()
    expect(
      match(result, { Banned: () => 403, NotFound: () => 404, ok: () => 200 })
    ).toBe(403)
  })

  test('keeps the value type of a typed input', () => {
    const sent: Result<number, NotFound> = ok(1)
    const result = revive(sent, { NotFound })

    expectTypeOf(result).toEqualTypeOf<Result<number, NotFound>>()
    expect(result).toEqual(ok(1))
  })

  test('gives back a result that yield* can unwrap', () => {
    const result = gen(function* () {
      const sent: Result<number, NotFound> = wire(ok(2))
      const value = yield* revive(sent, { NotFound })

      return value * 2
    })

    expect(result).toEqual(ok(4))
  })

  test('throws on a tag missing from the table', () => {
    const unlisted = () => revive(wire(err(new Banned())), { NotFound })

    expect(unlisted).toThrow('no class for "Banned"')
  })

  test('throws on an untagged error', () => {
    const untagged = () => revive(wire(err('boom')), { NotFound })

    expect(untagged).toThrow('no class for this error')
  })

  test('throws on data that is not a result', () => {
    expect(() => revive(JSON.parse('{"status":"ok"}'), { NotFound })).toThrow(
      'revive takes a result'
    )
  })

  test('rejects a key that is not the tag of its class', () => {
    // @ts-expect-error: each key must be the _tag of its class
    const swapped = () => revive(wire(ok(1)), { NotFound: Banned })

    expect(swapped).toBeFunction()
  })

  test('ignores a __proto__ field from the wire', () => {
    const hostile = JSON.parse(
      '{"ok":false,"error":{"_tag":"NotFound","id":"1","__proto__":{"admin":true}}}'
    )

    const result = revive(hostile, { NotFound })
    const error = result.ok ? undefined : result.error

    expect(error).toBeInstanceOf(NotFound)
    expect(error && 'admin' in error).toBe(false)
  })
})
