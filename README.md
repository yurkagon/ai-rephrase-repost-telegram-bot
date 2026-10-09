# Telegram repost bot

Monorepo starter with NestJS, Prisma, PostgreSQL, Redis, React, Vite, and Tailwind CSS. The API includes JWT authentication, role-based access, and user management. The client is intentionally a single Hello world page. The Telegram repost bot runs in the API process and translates posts to Ukrainian through LangChain; it is independent of application accounts and storage.

## Requirements

- Node.js 24 and pnpm 11
- Docker with Compose

## Start locally

1. Copy `.env.sample` to `.env`. Set `JWT_SECRET` and the `SEED_USER_*` values before sharing the environment with anyone. Also set `TELEGRAM_BOT_API_TOKEN` and `OPENAI_API_KEY`: the bot always runs with the API, so both are required.
2. Run `pnpm install`.
3. Run `pnpm setup`. It starts PostgreSQL and Redis, applies the initial migration, generates Prisma Client, and creates one SUPERADMIN user. Repeating it does not create another user.
4. Run `pnpm dev`. The API is at `http://localhost:3000`, its docs at `http://localhost:3000/docs`, and the client at `http://localhost:3001`.

## Commands

| Command                                              | Purpose                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm setup`                                         | Start local services, migrate, generate, and seed                  |
| `pnpm dev`                                           | Run API and client with watch mode                                 |
| `pnpm dev:api` / `pnpm dev:client`                   | Run one app                                                        |
| `pnpm build` / `pnpm start:prod`                     | Build and run the API with the built client                        |
| `pnpm lint` / `pnpm typecheck` / `pnpm test`         | Verify the workspace                                               |
| `pnpm db:up` / `pnpm db:down`                        | Start or stop local PostgreSQL and Redis; `db:down` keeps data     |
| `pnpm db:migrate` / `pnpm db:deploy`                 | Apply migrations in development or deployment                      |
| `pnpm db:generate` / `pnpm db:seed` / `pnpm db:view` | Generate Prisma Client, seed the first user, or open Prisma Studio |

`pnpm install` activates the Git hooks through Husky. Before each commit, `lint-staged` runs Prettier and ESLint on staged app code. Before each push, `pnpm test` runs the API tests.

The initial migration contains only the `User` table and `Role` enum. It is for a **new, empty database**. Do not apply it to a database from an earlier application; no data migration is provided.

## Production

Run `pnpm build` and then `pnpm start:prod`. The React app is built into static files in `apps/client/dist`, and the NestJS API serves those files and the API from the same server and origin. A separate web server for the React app is not required; Vite is used only during development.

Include the client build in the deployment alongside the API build. By default, the API looks for it at `apps/client/dist` relative to the monorepo layout. Set `CLIENT_DIST_PATH` to its absolute path if the deployment layout differs. Set `DATABASE_URL`, `REDIS_URL`, JWT values, `TELEGRAM_BOT_API_TOKEN`, and `OPENAI_API_KEY` in the runtime environment.

## Configuration

`ConfigModule` in `apps/api/src/config` registers the global NestJS `ConfigModule`. A single Zod schema validates and normalizes the runtime environment at startup; services use `ConfigService` with the inferred `Environment` type. Invalid configuration stops startup and reports field names without exposing values.

Required values are `DATABASE_URL` (PostgreSQL), `REDIS_URL` (Redis), `JWT_SECRET`, `JWT_EXPIRATION_TIME` and `JWT_REFRESH_EXPIRATION_TIME` durations of at least one second such as `2h`/`7d`, the Telegram token, and `OPENAI_API_KEY`. Ports must be integers from 1 to 65535; defaults are `PORT=3000` and `CLIENT_PORT=3001`. `NODE_ENV` supports `development`, `test`, and `production`, with `development` as the default. Optional `CORS_ORIGIN` accepts comma-separated HTTP/HTTPS URLs and otherwise allows the local API and client ports. `CLIENT_DIST_PATH` defaults to the client build directory.

The project uses one `.env` file at the repository root. The API loads it through `ConfigModule`; `prisma.config.ts` loads it through Node.js `loadEnvFile` and passes its values to the seed process. Vite and Docker Compose use the same root file. Shell variables take priority. Prisma commands do not require bot credentials. Local secrets are not copied from `_original`.

## Telegram and AI

The bot is implemented in two NestJS modules:

- `apps/api/src/ai`: the LangChain model factory, system prompt, and `TextRewriterService` with strict structured output `{ html: string }`.
- `apps/api/src/telegram`: Telegram handlers and publishing for text, photos, videos, and photo/video albums.

`TelegramModule` imports `AiModule`; neither depends on auth, users, Prisma, or Redis. The existing API still uses PostgreSQL and Redis as before. No Telegram-to-account associations or database migrations are introduced. `_original` remains the reference copy and is not loaded at runtime.

Bot settings use the same validated `ConfigService`:

| Variable                 | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `TELEGRAM_BOT_API_TOKEN` | Required bot token                                             |
| `OPENAI_API_KEY`         | Required AI key                                                |
| `LLM_MODEL`              | Model name, default `gpt-6-luna`                               |
| `TARGET_CHANNEL`         | Destination `@username` or numeric ID, default `@test_yuragon` |

Add these variables to the new application's local `.env`; the values in `_original/.env` are not loaded or copied automatically. The bot needs access to source channels and permission to publish to the destination. Run one API process per bot token: multiple polling processes for the same token conflict.

The bot preserves Ukrainian wording, translates other languages, preserves HTML and meaningful links, and removes only the trailing source signature except YouTube links. `/start` replies with `Welcome` without accessing an application account. Posts from the destination channel are ignored.

OpenAI uses the Responses API with low reasoning effort, a 30-second timeout per request, and at most two retries for transient transport failures. Refusals, incomplete responses, invalid structured output, and empty results prevent publication, without falling back to the original text. Every album caption is prepared before sending the album; a failure in any caption skips the entire album. Media without a caption makes no AI request.

NestJS starts polling in the background so it does not block the HTTP server. A fatal polling error shuts down the shared process; individual post errors are logged and processing continues. Shutdown hooks stop polling and cancel pending album timers. Logs contain operation metadata and error types, not post content, AI responses, or credentials.

Albums use the original one-second debounce and in-memory deduplication. Pending albums and deduplication state are lost on restart. Structured output validates the shape of the AI response, not translation quality or Telegram HTML correctness. Persistent delivery, queues, webhooks, and evals remain separate follow-up work.

The API's Jest suite covers DI, AI requests and failures, media publishing, album behavior, and bot lifecycle with local mocks; it does not contact Telegram or OpenAI. Run `pnpm --filter api test --runInBand`, `pnpm --filter api typecheck`, `pnpm lint:api`, and `pnpm --filter api build` to check the port.

## API

All API endpoints are under `/api`. Use `POST /api/auth/login` with the seeded email and password to obtain access and refresh tokens. Send the access token as `Authorization: Bearer <token>`. `POST /api/auth/refresh` renews the token pair and `GET /api/auth/me` returns the current user.

`/api/user` contains the user management endpoints. Creating, listing, reading, changing roles, and deleting users require `SUPERADMIN`. Any authenticated user can update their own profile and password. The browser page intentionally has no authentication UI; use the API docs or an API client.

## License

The project code is licensed under the [MIT License](LICENSE). Bundled third-party skills in `.agents/skills` retain their own licenses.
