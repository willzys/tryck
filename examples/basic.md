# A simple example

Read some JSON, look up a user and answer, without a single `try/catch`.

```ts
import { attempt, err, gen, match, ok, parse, taggedError } from 'tryck'
import { z } from 'zod'

class InvalidJson extends taggedError('InvalidJson') {}
class UserNotFound extends taggedError('UserNotFound')<{ id: string }> {}

interface User {
  id: string
  name: string
}

const users = new Map<string, User>([['1', { id: '1', name: 'Ana' }]])

const Input = z.object({ id: z.string() })

const findUser = (id: string) => {
  const user = users.get(id)
  return user ? ok(user) : err(new UserNotFound({ id }))
}

const greet = (body: string) =>
  gen(function* greetUser() {
    const json = yield* attempt(
      () => JSON.parse(body),
      [SyntaxError, InvalidJson]
    )
    const input = yield* parse(Input, json)
    const user = yield* findUser(input.id)
    return `Hello, ${user.name}!`
  })

const respond = (body: string) =>
  match(greet(body), {
    ok: message => message,
    InvalidJson: () => 'Invalid JSON',
    ValidationError: () => 'Missing id',
    UserNotFound: error => `No user ${error.id}`
  })
```

## Output

```ts
respond('{"id":"1"}') // 'Hello, Ana!'
respond('{"id":"2"}') // 'No user 2'
respond('{}') // 'Missing id'
respond('{') // 'Invalid JSON'
```

## Step by step

1. **`attempt`** runs `JSON.parse`. A `SyntaxError` becomes an `InvalidJson`; any other error, such as a bug, stays an exception.
2. **`parse`** checks the JSON against the schema, so `input.id` is a real string instead of an unchecked `any`.
3. **`yield*`** unwraps each result: on success it hands back the value; on failure it stops the function right there.
4. **`findUser`** returns `ok(user)` or `err(new UserNotFound(...))` and never throws.
5. **`match`** handles every case. If a new error appears and nobody handles it, the code **does not compile**.
