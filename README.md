# Graffiti API

The Graffiti API makes it possible to build a diverse set of social applications that naturally interoperate.
This repository contains the abstract API and it's documentation.

[View the Documentation](https://api.graffiti.garden/classes/Graffiti.html)

## Implementing the API

To implement the API, first install it:

```bash
npm install @graffiti-garden/api
```

Then create a class that extends the `Graffiti` class and implement the abstract methods.

```typescript
import { Graffiti } from "@graffiti-garden/api";

class MyGraffitiImplementation extends Graffiti {
  // Implement the abstract methods here
}
```

### Testing

We have written a number of unit tests written with [vitest](https://vitest.dev/)
that can be used to verify implementations of the API.
To use them, create a test file in that ends in `*.spec.ts` and format it as follows:

```typescript
import { graffitiCRUDTests } from "@graffiti-garden/api/tests";

const useGraffiti = () => new MyGraffitiImplementation();
// Fill in with implementation-specific information
// to provide to valid actor sessions for the tests
// to use as identities.
const useSession1 = () => ({ actor: "someone" });
const useSession2 = () => ({ actor: "someoneelse" });

// Run the tests
graffitiCRUDTests(useGraffiti, useSession1, useSession2);
```

Then run the tests in the root of your directory with:

```bash
npx vitest
```

## Building the Documentation

To build the [TypeDoc](https://typedoc.org/) documentation, run the following commands:

```bash
npm run install
npm run docs
```

Then run a local server to view the documentation:

```bash
cd docs
npx http-server
```
