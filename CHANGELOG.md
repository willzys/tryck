# Changelog

## 0.2.0

### Breaking

- `match`, `recover`, `mapErr`, `unwrap` and `gen` take the input as their type parameter (`unwrap<Result<User, NotFound>>` instead of `unwrap<User, NotFound>`). Calls that let TypeScript infer the types are unaffected.
- `mapErr` rejects async callbacks at compile time. They used to produce an `Err` holding a promise, which `match` and `recover` could not dispatch on.
- `Ok` and `Err` are frozen. Mutating a result was never supported; code that did so now throws in strict mode.

### Results from JSON

- New `revive(sent, { NotFound })` rebuilds a result that came from JSON, such as a worker message, with its error as an instance of its class.
- `match`, `recover`, `all`, `mapErr` and `unwrap` treat a result as an `Ok` only when `ok` is exactly `true`, so `{"ok":"false"}` no longer takes the success path.
- `gen` passes through a returned result that came from JSON or another copy of tryck, instead of wrapping it in an `Ok`.

### `gen`

- A plain `yield` throws a `TypeError`, instead of leaking the yielded value as the result.
- A `function*` that returns a promise is a type error and throws a `TypeError`, instead of wrapping the promise in an `Ok`.
- An `Err` yielded from a `finally` block replaces the result, instead of being dropped.

### `all`

- An `Err` is returned as soon as every item before it is an `Ok`, instead of waiting for the slowest item. Input order still decides which `Err` wins, and a rejection still rejects right away. A rejection that comes after `all` returned is raised as an unhandled rejection instead of vanishing.

### `match` and `recover`

- Tag handlers inherited from a prototype, such as class methods or `Object.create`, are found and called with the table as `this`.
- `match` names the `_tag` it could not handle, `no handler for "Tag"; add one or an err handler`, and keeps the unhandled error as the `cause`.

### `attempt`, `safe` and `when`

- `safe` forwards `this`, so a wrapped method keeps working as a method.
- A `when` check that throws is rethrown with the inspected error as its `cause`, instead of losing the inspected error.

### `taggedError`

- `new E()` without fields compiles where a result type is expected, such as `Promise<Result<never, E>>`. The fields used to be inferred from that type and then demanded.
- A `bigint` field is written to JSON as a string instead of making `JSON.stringify` throw.
- Fields are copied with `defineProperty` and `__proto__` is skipped, so fields parsed from untrusted JSON cannot swap the prototype.
- `toJSON` joins `_tag`, `name` and `stack` as reserved, so a field cannot replace the serializer. Only the fields' own keys are checked, so an object whose class has a `toJSON` is accepted.
- The JSON keeps the fields of a native `cause`, such as a database `code`, its nested causes and the `errors` of an `AggregateError`. A circular `cause` becomes `[Circular]` and a chain deeper than 32 becomes `[Truncated]`, instead of throwing.

### `parse`

- The error for an asynchronous schema names async refines and transforms as the likely cause.

### Errors and documentation

- A call rejected at compile time fails against a `Hint` type named after the fix, so the compiler error says what to change.
- Runtime errors end with the next action to take.
- Every export carries an `@example` in its JSDoc, so the usage shows up on hover.

## 0.1.0

First release: typed errors for TypeScript that catch only what you declare and let every bug surface.

```ts
const name = gen(function* loadName() {
  const user = yield* findUser(id)
  return user.name
})

match(name, { ok: value => value, NotFound: () => 'missing' })
```

- `Result` with `ok`, `err` and `mapErr`
- `attempt` and `safe`: catch only the listed `Error` classes, translate them with `[Caught, Into]` pairs, and handle sync and async alike
- `when`: catch a class only when a check passes, so other instances stay defects
- `gen`: `yield*` as Rust's `?`, for sync and async generators
- `all`: collect results and promises of results concurrently
- `match`: exhaustive handlers per `_tag`, typed as the union of what they return, for a `Result` or a promise of one
- `recover`: handle errors by `_tag` and remove them from the error type
- `match`, `recover`, `mapErr` and `unwrap` take a `Result` or a promise of one
- `parse`: validate input with any Standard Schema into a `Result`
- `unwrap`: the inverse of `attempt`
- `taggedError`: errors with a literal `_tag`, typed fields and JSON serialization
