import { describe, expect, expectTypeOf, test } from 'bun:test'

import { taggedError } from '../../src'

class NotFound extends taggedError('NotFound')<{ id: string }> {}

class Timeout extends taggedError('Timeout') {}

class Upstream extends taggedError('Upstream')<{
  message: string
  cause: unknown
}> {}

describe('taggedError', () => {
  test('is a real error with a literal tag', () => {
    const error = new NotFound({ id: '42' })

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(NotFound)
    expect(error.stack).toBeString()
    expect(error.name).toBe('NotFound')
    expectTypeOf(error._tag).toEqualTypeOf<'NotFound'>()
  })

  test('exposes its fields as readonly properties', () => {
    const error = new NotFound({ id: '42' })

    expect(error.id).toBe('42')
    expectTypeOf(error.id).toEqualTypeOf<string>()
  })

  test('takes no argument when it has no fields', () => {
    expect(new Timeout().message).toBe('Timeout')
  })

  test('requires its fields when it has some', () => {
    // @ts-expect-error: id is required
    expect(new NotFound().message).toBe('NotFound')
  })

  test('reserves the tags that name match handlers', () => {
    // @ts-expect-error: ok is reserved
    expect(() => taggedError('ok')).toThrow('reserved')
    // @ts-expect-error: err is reserved
    expect(() => taggedError('err')).toThrow('reserved')
  })

  test('keeps its own tag, name and stack', () => {
    const forge = (fields: {
      readonly _tag?: string
      readonly name?: string
      readonly stack?: string
    }) => Reflect.construct(NotFound, [{ id: '1', ...fields }])

    // @ts-expect-error: _tag belongs to taggedError
    class Forged extends taggedError('Forged')<{ _tag: string }> {}

    expect(Forged).toBeFunction()
    expect(() => forge({ _tag: 'Banned' })).toThrow('set by taggedError')
    expect(() => forge({ name: 'Banned' })).toThrow('set by taggedError')
    expect(() => forge({ stack: 'fake' })).toThrow('set by taggedError')
  })

  test('serializes its message, cause and fields', () => {
    const error = new Upstream({ cause: 'timeout', message: 'down' })

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      _tag: 'Upstream',
      cause: 'timeout',
      message: 'down',
      name: 'Upstream'
    })
  })

  test('accepts message and cause next to its own fields', () => {
    const cause = new Error('connection reset')
    const error = new NotFound({ cause, id: '42', message: 'no user 42' })

    expect(error.cause).toBe(cause)
    expect(error.message).toBe('no user 42')
    expect(error.id).toBe('42')
  })

  test('rejects fields it does not declare', () => {
    // @ts-expect-error: Timeout declares no fields
    const stray = () => new Timeout({ retry: true })

    expect(stray).toBeFunction()
  })

  test('serializes a native cause by name and message', () => {
    const error = new Upstream({
      cause: new TypeError('boom'),
      message: 'down'
    })

    expect(JSON.parse(JSON.stringify(error)).cause).toEqual({
      message: 'boom',
      name: 'TypeError'
    })
  })

  test('forwards message and cause to Error', () => {
    const cause = new Error('socket hang up')
    const error = new Upstream({ cause, message: 'payments is down' })

    expect(error.message).toBe('payments is down')
    expect(error.cause).toBe(cause)
  })
})
