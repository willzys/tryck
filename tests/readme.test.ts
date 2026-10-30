import { describe, expect, expectTypeOf, test } from 'bun:test'

import { z } from 'zod'

import {
  taggedError,
  all,
  attempt,
  err,
  gen,
  mapErr,
  match,
  ok,
  parse,
  recover
} from '../src'

import type { Result, ValidationError } from '../src'

class NotFound extends taggedError('NotFound')<{ id: string }> {}

class Banned extends taggedError('Banned') {}

class InvalidToken extends taggedError('InvalidToken') {}

interface User {
  banned: boolean
  profile: { name: string }
}

const users = new Map<string, User>([
  ['1', { banned: false, profile: { name: 'Ana' } }],
  ['2', { banned: true, profile: { name: 'Bia' } }]
])

const findUser = async (id: string): Promise<Result<User, NotFound>> => {
  const user = users.get(id)

  return user ? ok(user) : err(new NotFound({ id }))
}

const json = (profile: User['profile']) => ({
  body: JSON.stringify(profile),
  code: 200
})

const status = (code: number, body = '') => ({ body, code })

const Token = z.object({ userId: z.string() })

const profile = (header: string) =>
  gen(async function* loadProfile() {
    const decoded = yield* attempt(
      () => JSON.parse(atob(header)),
      [DOMException, InvalidToken],
      [SyntaxError, InvalidToken]
    )

    const token = yield* mapErr(
      parse(Token, decoded),
      cause => new InvalidToken({ cause })
    )

    const user = yield* await findUser(token.userId)

    if (user.banned) return yield* err(new Banned())

    return user.profile
  })

const respond = async (header: string) =>
  match(await profile(header), {
    Banned: () => status(403),
    InvalidToken: () => status(400),
    NotFound: error => status(404, `no user ${error.id}`),
    ok: body => json(body)
  })

const header = (userId: string) => btoa(JSON.stringify({ userId }))

describe('readme', () => {
  test('the opening example handles every outcome', async () => {
    expect(await respond(header('1'))).toEqual(json({ name: 'Ana' }))
    expect(await respond(header('2'))).toEqual(status(403))
    expect(await respond('%%%')).toEqual(status(400))
    expect(await respond(btoa('{"id":1}'))).toEqual(status(400))
    expect(await respond(header('3'))).toEqual(status(404, 'no user 3'))
    expect(await respond(btoa('{'))).toEqual(status(400))
  })
})

describe('readme api examples', () => {
  const half = (n: number): Result<number, 'odd'> =>
    n % 2 === 0 ? ok(n / 2) : err('odd')

  const quarter = (n: number) =>
    gen(function* () {
      const once = yield* half(n)

      return yield* half(once)
    })

  test('gen composes half into quarter', () => {
    expect([quarter(8), quarter(6)]).toEqual([ok(2), err('odd')])
  })

  test('all and mapErr compose inside an async gen', async () => {
    class Unauthorized extends taggedError('Unauthorized') {}

    const session = (id: string) =>
      gen(async function* () {
        const [user] = yield* await all([findUser(id), findUser(id)])

        return yield* mapErr(ok(user), cause => new Unauthorized({ cause }))
      })

    const [found, missing] = await Promise.all([session('1'), session('9')])

    expect(found).toEqual(ok({ banned: false, profile: { name: 'Ana' } }))
    expect(missing.ok).toBe(false)
  })

  test('match falls back to err for unlisted tags', () => {
    const result: Result<string, NotFound | Banned> = err(new Banned())

    const label = match(result, {
      NotFound: error => `missing ${error.id}`,
      err: () => 'unavailable',
      ok: name => name
    })

    expect(label).toBe('unavailable')
  })

  test('taggedError carries its fields', () => {
    class RateLimited extends taggedError('RateLimited')<{ retryIn: number }> {}

    const error = new RateLimited({ retryIn: 30 })

    expect([error._tag, error.retryIn, error instanceof Error]).toEqual([
      'RateLimited',
      30,
      true
    ])
  })
})

describe('readme recovery and parsing', () => {
  test('recover drops the handled tag', async () => {
    const guest: User = { banned: false, profile: { name: 'Guest' } }
    const user = recover(await findUser('9'), { NotFound: () => ok(guest) })

    expectTypeOf(user).toEqualTypeOf<Result<User, never>>()
    expect(user).toEqual(ok(guest))
  })

  test('parse validates with a Standard Schema', () => {
    const User = z.object({ name: z.string() })

    expectTypeOf(parse(User, {})).toEqualTypeOf<
      Result<{ name: string }, ValidationError>
    >()
    expect(parse(User, { name: 'Ana' })).toEqual(ok({ name: 'Ana' }))
  })
})
