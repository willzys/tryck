# An HTTP handler

A sign-up route: read the body, validate it, save the user and answer with the right status. It uses `Bun.serve`, but the handler is a plain function that works with any framework.

```ts
import { attempt, gen, match, parse, taggedError, when } from 'tryck'
import { z } from 'zod'

class InvalidJson extends taggedError('InvalidJson') {}
class EmailTaken extends taggedError('EmailTaken') {}

const Signup = z.object({ email: z.email(), password: z.string().min(8) })
const taken = when(DbError, failure => failure.code === 'unique')

const signUp = (request: Request) =>
  gen(async function* signUpUser() {
    const body = yield* await attempt(
      () => request.json(),
      [SyntaxError, InvalidJson]
    )
    const fields = yield* parse(Signup, body)
    return yield* await attempt(
      () => db.insertUser(fields),
      [taken, EmailTaken]
    )
  })

const handle = (request: Request) =>
  match(signUp(request), {
    ok: user => Response.json(user, { status: 201 }),
    InvalidJson: () =>
      Response.json({ message: 'Invalid JSON' }, { status: 400 }),
    ValidationError: error =>
      Response.json({ issues: error.issues }, { status: 400 }),
    EmailTaken: () => Response.json({ message: 'Email taken' }, { status: 409 })
  })

Bun.serve({ routes: { '/signup': { POST: handle } } })
```

## Notes

- `match` takes the promise from `signUp` directly, so `handle` returns `Promise<Response>` with no `await`.
- Each response is built from the error's tag, never from the error itself, so internal details such as the database cause never reach the client.
- Any other database failure is not caught by `taken`: it throws, and the server answers 500 while your error tracker gets the stack trace.
