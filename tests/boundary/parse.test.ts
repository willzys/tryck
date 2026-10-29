import { describe, expect, expectTypeOf, test } from 'bun:test'

import { z } from 'zod'

import { ValidationError, gen, ok, parse } from '../../src'
import type { Result } from '../../src'

const User = z.object({ age: z.number().int().min(0), name: z.string() })

describe('parse', () => {
  test('returns the parsed value typed from the schema', () => {
    const result = parse(User, { age: 30, name: 'Ana' })

    expectTypeOf(result).toEqualTypeOf<
      Result<{ age: number; name: string }, ValidationError>
    >()
    expect(result).toEqual(ok({ age: 30, name: 'Ana' }))
  })

  test('returns a ValidationError with every issue', () => {
    const result = parse(User, { age: -1 })
    const error = result.ok ? undefined : result.error

    expect(error).toBeInstanceOf(ValidationError)
    expect(error?._tag).toBe('ValidationError')
    expect(error?.issues.map(issue => issue.path)).toEqual([['age'], ['name']])
  })

  test('composes inside gen', () => {
    const greet = (input: z.input<typeof User>) =>
      gen(function* () {
        const user = yield* parse(User, input)

        return `Hello, ${user.name}!`
      })

    expectTypeOf(greet).returns.toEqualTypeOf<Result<string, ValidationError>>()
    expect(greet({ age: 1, name: 'Bia' })).toEqual(ok('Hello, Bia!'))
  })

  test('infers the output of a hand-written schema from its success', () => {
    const age = {
      '~standard': {
        validate: (value: number) =>
          value >= 0 ? { value } : { issues: [{ message: 'negative' }] }
      }
    }

    expectTypeOf(parse(age, 1)).toEqualTypeOf<Result<number, ValidationError>>()
    expect(parse(age, -1).ok).toBe(false)
  })

  test('rejects an asynchronous schema at compile time and at runtime', () => {
    const slow = {
      '~standard': {
        validate: (value: string) => Promise.resolve({ value })
      }
    }

    // @ts-expect-error: parse takes a schema that can validate synchronously
    expect(() => parse(slow, 'x')).toThrow('synchronous schema')
  })
})
