# From try/catch

The same lookup, written twice.

## Before

```ts
const getProfile = async (id: string) => {
  try {
    const user = await db.findUser(id)
    if (!user) return { status: 404 }
    return { status: 200, body: user.profile }
  } catch {
    return { status: 500 }
  }
}
```

The `catch` cannot tell a dropped connection from a typo in your own code, and nothing in the signature says this function can fail.

## After

```ts
import { attempt, err, gen, match, ok, taggedError } from 'tryck'

class NotFound extends taggedError('NotFound')<{ id: string }> {}
class DatabaseDown extends taggedError('DatabaseDown') {}

const findUser = (id: string) =>
  gen(async function* findUserById() {
    const user = yield* await attempt(
      () => db.findUser(id),
      [ConnectionError, DatabaseDown]
    )
    return user ? ok(user) : err(new NotFound({ id }))
  })

const getProfile = (id: string) =>
  match(findUser(id), {
    ok: user => ({ status: 200, body: user.profile }),
    NotFound: () => ({ status: 404 }),
    DatabaseDown: () => ({ status: 503 })
  })
```

## What changed

- `findUser` returns `Promise<Result<User, NotFound | DatabaseDown>>`: every expected failure is in its type.
- Only `ConnectionError` is caught. A bug such as `user.profle` still throws and reaches your error tracker as a real 500.
- `match` must handle both errors. Add a new one to `findUser` and `getProfile` stops compiling until it has a status.
