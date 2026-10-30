import { describe, expect, expectTypeOf, test } from 'bun:test'

import { attempt, err, ok, safe, taggedError, unwrap, when } from '../../src'

import type { Result } from '../../src'

class NetworkError extends Error {}

class InvalidJson extends taggedError('InvalidJson') {}

const parse = (text: string): number => JSON.parse(text)

describe('attempt', () => {
  test('wraps a returned value in ok', () => {
    expect(attempt(() => 1, SyntaxError)).toEqual(ok(1))
  })

  test('catches the listed classes', () => {
    const result = attempt(() => parse('{'), SyntaxError)

    expectTypeOf(result).toEqualTypeOf<Result<number, SyntaxError>>()
    expect(result.ok ? undefined : result.error).toBeInstanceOf(SyntaxError)
  })

  test('unions several listed classes', () => {
    const result = attempt(() => 1, InvalidJson, NetworkError)

    expectTypeOf(result).toEqualTypeOf<
      Result<number, InvalidJson | NetworkError>
    >()
  })

  test('requires at least one class to catch', () => {
    // @ts-expect-error: catching everything hides defects
    const everything = () => attempt(() => 1)

    expect(everything).toBeFunction()
  })

  test('translates a caught class into a domain error', () => {
    const result = attempt(() => parse('{'), [SyntaxError, InvalidJson])

    expectTypeOf(result).toEqualTypeOf<Result<number, InvalidJson>>()
    expect(result.ok ? undefined : result.error).toBeInstanceOf(InvalidJson)
    expect(result.ok ? undefined : result.error.cause).toBeInstanceOf(
      SyntaxError
    )
  })

  test('translates async rejections too', async () => {
    const result = await attempt(
      () => Promise.reject(new SyntaxError('bad')),
      [SyntaxError, InvalidJson]
    )

    expect(result.ok ? undefined : result.error).toBeInstanceOf(InvalidJson)
  })

  test('keeps tagged unions apart when mixing catches', () => {
    const result = attempt(() => 1, [SyntaxError, InvalidJson], NetworkError)

    expectTypeOf(result).toEqualTypeOf<
      Result<number, InvalidJson | NetworkError>
    >()
  })

  test('rethrows defects it was not asked to catch', () => {
    const defect = () =>
      attempt(() => {
        throw new TypeError('bug')
      }, SyntaxError)

    expect(defect).toThrow(TypeError)
  })

  test('rethrows values that are not errors', () => {
    const thrown = () =>
      attempt(() => {
        throw null
      }, Error)

    expectTypeOf(thrown).returns.toEqualTypeOf<Result<never, Error>>()
    expect(thrown).toThrow()
  })

  test('resolves async functions to a promised result', async () => {
    const result = attempt(async () => 1, NetworkError)

    expectTypeOf(result).toEqualTypeOf<Promise<Result<number, NetworkError>>>()
    expect(await result).toEqual(ok(1))
  })

  test('types functions that are only sometimes async', () => {
    const maybe = (async: boolean): number | Promise<number> =>
      async ? Promise.resolve(1) : 1

    const result = attempt(() => maybe(false), NetworkError)

    expectTypeOf(result).toEqualTypeOf<
      Result<number, NetworkError> | Promise<Result<number, NetworkError>>
    >()
    expect(result).toEqual(ok(1))
  })

  test('types an unknown return as possibly async', async () => {
    const opaque: unknown = Promise.resolve(1)
    const result = attempt(() => opaque, NetworkError)

    expectTypeOf(result).toEqualTypeOf<
      Result<unknown, NetworkError> | Promise<Result<unknown, NetworkError>>
    >()
    expect(await result).toEqual(ok(1))
  })

  test('catches listed rejections and rethrows the rest', async () => {
    const rejecting = (error: Error) => async () => {
      throw error
    }

    expect(await attempt(rejecting(new NetworkError()), NetworkError)).toEqual(
      err(new NetworkError())
    )
    await expect(
      attempt(rejecting(new TypeError()), NetworkError)
    ).rejects.toThrow(TypeError)
  })
})

describe('safe', () => {
  test('wraps a function once and keeps its parameters', () => {
    const parseSafely = safe(parse, SyntaxError)

    expectTypeOf(parseSafely).parameters.toEqualTypeOf<[text: string]>()
    expect(parseSafely('1')).toEqual(ok(1))
    expect(parseSafely('{').ok).toBe(false)
  })

  test('wraps async functions', async () => {
    const fetchUser = safe(async (id: string) => ({ id }), NetworkError)

    expectTypeOf(fetchUser).returns.toEqualTypeOf<
      Promise<Result<{ id: string }, NetworkError>>
    >()
    expect(await fetchUser('1')).toEqual(ok({ id: '1' }))
  })
})

const thrownBy = (fn: () => void): Error | undefined => {
  try {
    fn()
  } catch (error) {
    if (error instanceof Error) return error
  }

  return undefined
}

describe('unwrap', () => {
  test('returns the value of an ok', () => {
    expect(unwrap(ok(1))).toBe(1)
  })

  test('throws the error of an err as is', () => {
    const error = new NetworkError()

    expect(thrownBy(() => unwrap(err(error)))).toBe(error)
  })

  test('unwraps a promised result into a promise', async () => {
    const value = unwrap(Promise.resolve(ok(1)))
    const error = new NetworkError()

    expectTypeOf(value).toEqualTypeOf<Promise<number>>()
    expect(await value).toBe(1)
    await expect(unwrap(Promise.resolve(err(error)))).rejects.toBe(error)
  })

  test('undoes an async attempt', async () => {
    const error = new NetworkError()

    const fail = async () => {
      throw error
    }

    await expect(unwrap(attempt(fail, NetworkError))).rejects.toBe(error)
  })

  test('undoes attempt', () => {
    const error = new SyntaxError('bad')

    const fail = () => {
      throw error
    }

    expect(thrownBy(() => unwrap(attempt(fail, SyntaxError)))).toBe(error)
  })
})

class HttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

class NotFound extends taggedError('NotFound') {}

const failWith = (status: number) => () => {
  throw new HttpError(status)
}

const missing = when(HttpError, failure => failure.status === 404)

describe('when', () => {
  test('catches an error only when the check passes', () => {
    const result = attempt(failWith(404), missing)

    expectTypeOf(result).toEqualTypeOf<Result<never, HttpError>>()
    expect(result.ok ? undefined : result.error.status).toBe(404)
  })

  test('rethrows the same class when the check fails', () => {
    expect(() => attempt(failWith(500), missing)).toThrow('HTTP 500')
  })

  test('works inside a translation pair', () => {
    const result = attempt(failWith(404), [missing, NotFound])

    expectTypeOf(result).toEqualTypeOf<Result<never, NotFound>>()
    expect(result.ok ? undefined : result.error).toBeInstanceOf(NotFound)
  })

  test('falls through to the next entry', () => {
    const result = attempt(failWith(500), missing, HttpError)

    expect(result.ok ? undefined : result.error.status).toBe(500)
  })

  test('narrows with instanceof', () => {
    const thrown: Error = new HttpError(404)

    if (thrown instanceof missing) {
      expectTypeOf(thrown).toEqualTypeOf<HttpError>()
    }

    expect(thrown instanceof missing).toBe(true)
  })

  test('composes inside safe', () => {
    const fetchPage = safe((status: number) => failWith(status)(), missing)

    expectTypeOf(fetchPage).returns.toEqualTypeOf<Result<never, HttpError>>()
    expect(fetchPage(404).ok).toBe(false)
    expect(() => fetchPage(500)).toThrow('HTTP 500')
  })

  test('narrows async rejections and their translations', async () => {
    const rejectWith = (status: number) => async () => {
      throw new HttpError(status)
    }

    const caught = await attempt(rejectWith(404), [missing, NotFound])

    expectTypeOf(caught).toEqualTypeOf<Result<never, NotFound>>()
    expect(caught.ok ? undefined : caught.error).toBeInstanceOf(NotFound)
    expect(attempt(rejectWith(500), missing)).rejects.toThrow('HTTP 500')
  })

  test('unions several guards and classes', () => {
    const gone = when(HttpError, failure => failure.status === 410)

    const result = attempt(
      failWith(410),
      [missing, NotFound],
      gone,
      SyntaxError
    )

    expectTypeOf(result).toEqualTypeOf<
      Result<never, NotFound | HttpError | SyntaxError>
    >()
    expect(result.ok ? undefined : result.error).toBeInstanceOf(HttpError)
  })

  test('answers instanceof like a guarded class', () => {
    expect([
      new HttpError(404) instanceof missing,
      new HttpError(500) instanceof missing,
      new Error('plain') instanceof missing
    ]).toEqual([true, false, false])
  })
})
