# API reference

Every function that takes a `Result` also takes a `Promise` of one and gives a `Promise` back. The examples share a small sign-up flow, where `findUser(id)` returns `Promise<Result<User, NotFound>>`.

## `ok(value)` and `err(error)`

```ts
const checkAge = (age: number): Result<number, 'underage'> =>
  age >= 18 ? ok(age) : err('underage')

const result = checkAge(16)
if (!result.ok) result.error // 'underage'
```

## `attempt(fn, ...catches)`

Runs `fn` and turns instances of the listed `Error` classes into an `Err`; anything else is rethrown. A `[Caught, Into]` pair translates a foreign error into one of yours, and `when` catches a class only when a check passes.

```ts
attempt(() => JSON.parse(text), [SyntaxError, InvalidJson]) // Result<any, InvalidJson>

const taken = when(DbError, failure => failure.code === 'unique')
await attempt(() => insertUser(fields), [taken, EmailTaken]) // Result<User, EmailTaken>
```

Translate native errors such as `SyntaxError` before mixing them with tagged ones: they add nothing to `Error`, so TypeScript would fold the union into plain `Error`.

## `safe(fn, ...catches)`

Wraps a function once so every call goes through `attempt`.

```ts
const parseJson = safe(JSON.parse, [SyntaxError, InvalidJson])
parseJson('{') // Err<InvalidJson>
```

## `parse(schema, input)`

Validates `input` with any [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType) and returns the output or a `ValidationError` listing every issue.

```ts
const Signup = z.object({ email: z.email(), password: z.string().min(8) })

parse(Signup, body) // Result<{ email: string; password: string }, ValidationError>
```

## `gen(function* name() {})`

`yield*` on an `Ok` gives back its value; on an `Err` it stops the body with that error. Errors from every step are unioned, a returned `Result` passes through as is, and `finally` blocks run on the way out. Use `async function*` with `yield* await` for promises, and `return yield* err(e)` as a guard.

```ts
const signUp = (body: unknown) =>
  gen(async function* signUpUser() {
    const fields = yield* parse(Signup, body)
    return yield* await attempt(() => insertUser(fields), [taken, EmailTaken])
  }) // Promise<Result<User, ValidationError | EmailTaken>>
```

## `all(results)`

Collects a tuple of results, or promises of them, into one. The first `Err` in input order wins; nothing is cancelled.

```ts
await all([findUser(id), findPlan(id)]) // Result<[User, Plan], NotFound>
```

## `mapErr(result, fn)` and `recover(result, handlers)`

`mapErr` translates an error between layers. `recover` handles errors by `_tag`, or all of them with `err`, and removes them from the type.

```ts
await mapErr(findUser(id), cause => new Unauthorized({ cause })) // Result<User, Unauthorized>
await recover(findUser(id), { NotFound: () => ok(guest) }) // Result<User, never>
```

## `match(result, handlers)`

Folds a `Result` into one value. Tagged errors need a handler per `_tag`, checked for exhaustiveness; `err` handles whatever is left.

```ts
const status = await match(signUp(body), {
  ok: () => 201,
  ValidationError: () => 400,
  EmailTaken: () => 409
}) // number
```

## `unwrap(result)`

Returns the value or throws the error as is, so `unwrap(attempt(fn, E))` behaves like `fn()`. Meant for scripts, tests and framework edges.

```ts
const user = await unwrap(findUser(id)) // User, or throws NotFound
```

## `taggedError(tag)`

```ts
class RateLimited extends taggedError('RateLimited')<{ retryIn: number }> {}

new RateLimited({ retryIn: 30 })._tag // 'RateLimited'
```

A real `Error` with typed fields; `message` and `cause` are forwarded to `Error`. Its JSON is meant for logs: map tags to public messages instead of sending errors to clients.

See the [README](../README.md) for a quick start and the [examples](../examples) for complete recipes.
