# Changelog

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
