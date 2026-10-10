# Project conventions

- Keep the API in `apps/api`, the React client in `apps/client`, and shared code in `packages/shared`.
- Keep HTTP feature modules (controllers, DTOs, services and their tests) under `apps/api/src/api` and compose them in `ApiModule`. Keep shared AI, Telegram transport, configuration and infrastructure modules outside it.
- Add Prisma schema changes through migrations. The initial migration targets a new, empty database.
- Keep credentials in local `.env` files; document required variables in `.env.sample`.

## Code formatting

- Follow the root Prettier configuration and format every file you change.
- Leave one blank line after the final import before declarations or executable code.
- Group imports as external dependencies, internal aliases, then relative imports; separate groups with one blank line.
- Separate top-level declarations (constants, schemas, types, functions and classes) and class methods with one blank line. Keep closely related short constants or state variables in one group.
- Use blank lines between logical steps inside functions, such as validation, preparation, execution and returning a result. Keep closely related statements together.
- Do not add blank lines inside prompt strings or other string literals just to format the surrounding code.
- Prettier does not insert all these blank lines; check spacing manually before finishing a change.
