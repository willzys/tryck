# API reference

Every function that takes a `Result` also takes a `Promise` of one and gives a `Promise` back. The examples share a small sign-up flow, where `findUser(id)` returns `Promise<Result<User, NotFound>>`.

## `ok(value)` and `err(error)`

```ts
const checkAge = (age: number): Result<number, 'underage'> =>
  age >= 18 ? ok(age) : err('underage')

const result = checkAge(16)
if (!result.ok) result.error // 'underage'
```

Results are plain data, so tests compare them directly: `expect(checkAge(20)).toEqual(ok(20))`.

## `attempt(fn, ...catches)`

Runs `fn` and turns instances of the listed `Error` classes into an `Err`; anything else is rethrown. A `[Caught, Into]` pair translates a foreign error into one of yours, and `when` catches a class only when a check passes.

```ts
attempt(() => JSON.parse(text), [SyntaxError, InvalidJson]) // Result<any, InvalidJson>
// JSON.parse returns any: pass the value through parse(schema, value) to type it

const taken = when(DbError, failure => failure.code === 'unique')
await attempt(() => insertUser(fields), [taken, EmailTaken]) // Result<User, EmailTaken>
```

The return type follows `fn`: a `Result` when it is sync, a `Promise` of one when it is async. When `fn` returns `unknown`, or both a value and a promise, tryck cannot tell, so the type is the union of both; give `fn` a precise return type to get one or the other.

Translate native errors such as `SyntaxError` before mixing them with tagged ones: they add nothing to `Error`, so TypeScript would fold the union into plain `Error`.

The `Into` class of a pair receives only `{ cause }`, so its other fields must be optional. To fill fields from the caught error, catch the class and use `mapErr` on the result.

A `when` check that throws is a defect: its error is rethrown with the inspected error as `cause`.

Catching uses `instanceof`, which is per realm: an error created in another realm, such as a `vm` context or an iframe, is not an instance of this realm's `Error` and is rethrown. Translate it at the boundary where it crosses.

## `safe(fn, ...catches)`

Wraps a function once so every call goes through `attempt`.

The wrapper forwards `this`, so `safe(api.read, DbError)` works as a method of the object it is assigned to. Called bare, it has no `this`, like the original.

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

The schema must validate synchronously. A purely asynchronous schema is rejected at compile time; libraries that type every schema the same way, such as Zod, can only fail at runtime, where an async `refine` or `transform` throws a `TypeError`.

## `revive(sent, classes)`

Rebuilds a result that crossed a boundary as JSON, such as a worker message, a queue job or an HTTP body. The `Ok` and `Err` come back as real results, so `yield*` works on them, and the error comes back as an instance of the class named by its `_tag`. The table is keyed by tag, like the handlers of `match`.

```ts
const sent = JSON.stringify(await findUser(id)) // in the worker

const result = revive(JSON.parse(sent), { NotFound }) // in the main thread
// Result<unknown, NotFound>
```

A `_tag` missing from the table, or an error without one, throws a `TypeError`: the type promises only the listed classes. The value stays `unknown` unless the input is typed; validate it with `parse`. `cause` comes back as the plain object its JSON was, and the stack is the one of the `revive` call.

## `gen(function* name() {})`

`yield*` on an `Ok` gives back its value; on an `Err` it stops the body with that error. Errors from every step are unioned, a returned `Result` passes through as is, and `finally` blocks run on the way out. Use `async function*` with `yield* await` for promises, and `return yield* err(e)` as a guard. A `function*` that returns a promise is a type error and throws at runtime: make it `async function*`.

```ts
const signUp = (body: unknown) =>
  gen(async function* signUpUser() {
    const fields = yield* parse(Signup, body)
    return yield* await attempt(() => insertUser(fields), [taken, EmailTaken])
  }) // Promise<Result<User, ValidationError | EmailTaken>>
```

## `all(results)`

Collects a tuple of results, or promises of them, into one. The first `Err` in input order wins, and it is returned as soon as every item before it is an `Ok`, without waiting for the items after it. A rejection rejects right away, as with `Promise.all`. Nothing is cancelled: the remaining items keep running, and a rejection among them that comes after `all` has returned is raised as an unhandled rejection, so a defect is never lost.

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

Folds a `Result` into one value. Tagged errors need a handler per `_tag`, checked for exhaustiveness; `err` handles whatever is left. An error with no handler, such as one that lost its `_tag` on the way, throws a `TypeError` whose `cause` is that error.

Handlers are looked up through the prototype and called with the table as `this`, so a class instance works as a table.

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

`_tag`, `name`, `stack` and `toJSON` belong to the class: a field with one of those names is a type error, and throws a `TypeError` at runtime for callers that skip type checking. Every other field goes into the JSON, so keep secrets such as passwords out of fields or redact them in a `toJSON` override. A `bigint` field, such as an int8 id from Postgres, is written as a string. A `cause` keeps the original error, and everything it references, alive as long as yours: drop large payloads such as a response body before attaching them. Nested values follow `JSON.stringify`: a `Map` or `Set` becomes `{}`.

`structuredClone`, `postMessage`, `worker_threads`, `BroadcastChannel` and the `advanced` serialization of `child_process` copy an `Error` by `message`, `stack` and, on Node, `cause` only: `name` goes back to `Error`, and `_tag` and the fields are lost, so `match` falls to `err`. Runtimes also differ: a tagged error thrown inside a worker keeps its `_tag` in the `error` event on Node but not on Bun. Send `JSON.stringify(result)` across, or use JSON IPC, and rebuild it on the other side with `revive`.

The JSON follows `cause` 32 levels deep and then writes `[Truncated]`, so a runaway chain cannot overflow the stack.

See the [README](../README.md) for a quick start and the [examples](../examples) for complete recipes.
