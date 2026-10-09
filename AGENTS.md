# Starter conventions

- Keep the API in `apps/api`, the React client in `apps/client`, and shared code in `packages/shared`.
- Add Prisma schema changes through migrations. The initial migration targets a new, empty database.
- Keep credentials in local `.env` files; document required variables in `.env.sample`.
