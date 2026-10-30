import { describe, expect, expectTypeOf, test } from 'bun:test'

import { err, taggedError } from '../../src'

import type { Result } from '../../src'

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
      readonly toJSON?: () => object
    }) => Reflect.construct(NotFound, [{ id: '1', ...fields }])

    // @ts-expect-error: _tag belongs to taggedError
    class Forged extends taggedError('Forged')<{ _tag: string }> {}

    expect(Forged).toBeFunction()
    expect(() => forge({ _tag: 'Banned' })).toThrow('set by taggedError')
    expect(() => forge({ name: 'Banned' })).toThrow('set by taggedError')
    expect(() => forge({ stack: 'fake' })).toThrow('set by taggedError')
    expect(() => forge({ toJSON: () => ({}) })).toThrow('set by taggedError')
  })

  test('accepts fields whose prototype has a toJSON', () => {
    class Fields {
      readonly id = '42'

      toJSON() {
        return { id: this.id }
      }
    }

    const error = new NotFound(new Fields())

    expect(error.id).toBe('42')
    expect(JSON.parse(JSON.stringify(error))._tag).toBe('NotFound')
  })

  test('serializes bigint fields as strings', () => {
    class Row extends taggedError('Row')<{ id: bigint }> {}

    const json = JSON.parse(
      JSON.stringify(new Row({ id: 9_007_199_254_740_993n }))
    )

    expect(json.id).toBe('9007199254740993')
  })

  test('constructs without fields where a result type is expected', async () => {
    const TimedOut = taggedError('TimedOut')

    const failed: Result<never, InstanceType<typeof TimedOut>> = err(
      new TimedOut()
    )

    const pending = Promise.resolve<
      Result<never, InstanceType<typeof TimedOut>>
    >(err(new TimedOut()))

    expect(failed).toEqual(err(new TimedOut()))
    await expect(pending).resolves.toEqual(err(new TimedOut()))
  })

  test('ignores a __proto__ field parsed from JSON', () => {
    const fields: { id: string } = JSON.parse(
      '{"id":"42","__proto__":{"admin":true}}'
    )

    const error = new NotFound(fields)

    expect(error).toBeInstanceOf(NotFound)
    expect(error.id).toBe('42')
    expect('admin' in error).toBe(false)
    expect(Object.hasOwn(error, '__proto__')).toBe(false)
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

  test('keeps the fields of a native cause', () => {
    const cause = Object.assign(new Error('terminating connection'), {
      code: '57P01'
    })

    const error = new Upstream({ cause, message: 'down' })

    expect(JSON.parse(JSON.stringify(error)).cause).toEqual({
      code: '57P01',
      message: 'terminating connection',
      name: 'Error'
    })
  })

  test('serializes a nested cause chain', () => {
    const root = new TypeError('socket closed')

    const error = new Upstream({
      cause: new Upstream({ cause: root, message: 'retry failed' }),
      message: 'down'
    })

    expect(JSON.parse(JSON.stringify(error)).cause).toEqual({
      _tag: 'Upstream',
      cause: { message: 'socket closed', name: 'TypeError' },
      message: 'retry failed',
      name: 'Upstream'
    })
  })

  test('serializes the errors of an AggregateError cause', () => {
    const cause = new AggregateError([new Error('first'), 'second'], 'both')
    const error = new Upstream({ cause, message: 'down' })

    expect(JSON.parse(JSON.stringify(error)).cause).toEqual({
      errors: [{ message: 'first', name: 'Error' }, 'second'],
      message: 'both',
      name: 'AggregateError'
    })
  })

  test('truncates a runaway cause chain instead of overflowing', () => {
    let chain: Error = new Error('root')

    for (let depth = 0; depth < 100_000; depth += 1) {
      chain = new Error('link', { cause: chain })
    }

    const json = JSON.stringify(new Upstream({ cause: chain, message: 'down' }))

    expect(json).toContain('[Truncated]')
    expect(json).not.toContain('root')
  })

  test('survives a circular cause', () => {
    const first = new Upstream({ cause: undefined, message: 'first' })
    const second = new Upstream({ cause: first, message: 'second' })

    Object.assign(first, { cause: second })

    expect(JSON.parse(JSON.stringify(second)).cause).toEqual({
      _tag: 'Upstream',
      cause: '[Circular]',
      message: 'first',
      name: 'Upstream'
    })
  })

  test('forwards message and cause to Error', () => {
    const cause = new Error('socket hang up')
    const error = new Upstream({ cause, message: 'payments is down' })

    expect(error.message).toBe('payments is down')
    expect(error.cause).toBe(cause)
  })
})
