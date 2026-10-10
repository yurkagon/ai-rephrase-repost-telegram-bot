# CopywriteRepostBot

A full-stack Telegram editorial workspace: collect channel posts, prepare structured AI drafts, review the result, and publish the exact version you approved.

Built with NestJS, React, PostgreSQL, Prisma, Redis, BullMQ, LangChain and OpenAI. The interface supports Ukrainian and English and follows Telegram Desktop's familiar layout. AI output language is selected independently.

## What works

- Registration without email confirmation, hashed passwords, profile password changes and stateless JWT access/refresh tokens.
- One shared platform bot; Telegram account linking with an expiring, single-use deep link.
- Administrator-verified channels and dynamic source → destination routes, with cycle prevention.
- Persistent inbox for text, photos, videos and albums; deduplication by route and Telegram message/group IDs.
- On-demand editorial rewriting with language, tone, length and source-signature settings.
- Telegram-compatible rich text editor, source/preview and version history.
- Explicit confirmation before publishing; no automatic publication or fallback to the original after AI failure.
- Discard unwanted inbox posts with confirmation. Draft versions are deleted; the original record stays to prevent replayed Telegram updates from restoring the post. Posts cannot be discarded while generating, publishing or awaiting delivery verification, or after publication.
- Durable operation records and a Redis-backed queue, token/latency/error metrics and a repository-owned eval suite.

```mermaid
flowchart LR
  TG[Telegram channel] --> Ingest[Persist incoming post]
  Ingest --> Inbox[Inbox]
  Inbox -->|Generate| Op[PostgreSQL operation record]
  Op --> Queue[BullMQ / Redis]
  Queue --> AI[LangChain structured output]
  AI --> Draft[Versioned draft]
  Draft --> Review[Review / edit / preview]
  Review -->|Confirm saved version| Send[Publication operation]
  Send --> Destination[Destination channel]
```

## Local development

Use Node 24+, pnpm (the version is pinned in `package.json`) and Docker.

```sh
cp .env.sample .env
pnpm install
pnpm db:up
pnpm db:deploy
pnpm db:generate
pnpm dev
```

Set `TELEGRAM_BOT_API_TOKEN`, `OPENAI_API_KEY` and a random `JWT_SECRET` in `.env`. Keep local credentials private. `APP_URL` must match the browser's origin; use the actual client port if you change it. Ports and database connections are documented in `.env.sample`.

The API starts the bot's polling and queue workers together. A fatal Telegram startup/polling failure stops the shared process; individual generation/publication failures are saved and shown in the workspace. Production runs **one API instance** per bot token.

Open the client at `http://localhost:3001`. API documentation: `http://localhost:3000/docs`; OpenAPI JSON: `/openapi.json`; readiness: `/api/health`.

`pnpm db:seed` optionally creates the configured SUPERADMIN. It is separate from normal registration; every publicly registered account is `USER`. Existing administrator roles are preserved by migrations. Existing accounts can sign in immediately; no email confirmation or email-based password recovery is required. Login returns access and refresh JWTs; refresh accepts `{ refreshToken }` in the request body. The client keeps the access token in memory and the refresh token in sessionStorage for the current tab. Logout clears the client tokens. Tokens cannot be revoked individually and remain valid until expiry, including after password changes.

### Connect your channels

1. Register and sign in immediately.
2. Open **Channels → Connect Telegram**, follow the bot link, and refresh the connection.
3. Add the bot as an administrator to your source and destination channels. Grant permission to post in the destination.
4. Add each channel by `@username`, or its numeric ID without a minus sign (e.g. `1001234567890`) for a private channel. Signed IDs are also accepted. The linked Telegram user must administrate both channels.
5. Create a route, choose the AI defaults, and publish a **new** test post in the source channel.
6. Select it from Inbox, generate a draft, edit/save if needed, then confirm publication.

The app’s **Guide** page (`/guide`) explains the two-channel setup, bot administrator permissions, manual forwarding into the collection channel, and the review/publish/discard workflow in Ukrainian and English.

The bot receives new posts only from channels where it has been added. This MVP does not scrape other channels or import existing history. A Telegram account/channel can belong to one platform account; teams are outside this release.

## Code structure

```text
apps/api/src/
  api/
    auth/, user/     accounts, JWT authentication and profiles
    channels/        Telegram linking, verified channels and route settings
    posts/           ingestion, drafts, operations, queue worker and media proxy
  ai/                one AiService, provider settings, versioned prompts and rewrite options
  evals/             40-case dataset, deterministic checks and budgeted live runner
  telegram/          Telegraf construction, handlers transport and cancellable polling
  config/            Zod-validated server environment
  infra/             Prisma and Redis
apps/client/src/     bilingual React workspace, editor, account and channel flows
```

Feature modules depend on Telegram transport and AI, without reverse imports or service locators. Prisma is used directly; no extra repository layer. Original Telegram content, AI revisions and manual revisions are separate records. Telegram file IDs are reused; previews are fetched through an owner-authorized bounded proxy and never expose the bot token.

## AI contract and evaluation

Versioned system and developer prompts live in `apps/api/src/ai/prompts/rewrite.ts`. The application and eval runner share this module; validated rewrite options supply its dynamic instructions. `AiService` handles model creation, response validation and execution metadata. Zod schemas and option defaults are declared below the service class in `ai.service.ts`. The eval judge reuses its static `createLanguageModel()` factory.

Routes support optional rewrite rules (up to 2000 characters), editable on the Routes page. They are stored in the existing route options and snapshotted into each generation operation and AI run. The developer prompt applies them within the fixed rules for factual accuracy, language and Telegram HTML; an empty field preserves the default behavior.

The Inbox also offers an optional post instruction next to Generate/Regenerate (up to 2000 characters). It supplements the current route rules and is snapshotted for that generation; it never updates the route settings. Post-specific style instructions take precedence over route style instructions, within the fixed rewrite constraints.

Rewriting supports light, moderate (default) and deep rewrite strength in route settings and the Inbox. Light keeps most phrasing and structure; moderate rephrases sentences; deep rebuilds the opening, organization and wording while preserving meaning and all material facts. Existing route options default to moderate; each generation records the selected strength. The rewrite-mode removal migration strips the obsolete mode from routes and operation settings while preserving drafts, other settings and historical AI run metadata. Run `pnpm --filter api db:deploy` before starting the updated API.

`AiService.rewrite(text, options)` returns validated `{ html, model, promptVersion, durationMs, inputTokens?, outputTokens?, outcome }`. The model's schema remains strictly `{ html: string }` with `jsonSchema`, `strict` and `includeRaw`. System/developer instructions are separate from the untrusted post. Default model: `gpt-6-luna`, overridden with `LLM_MODEL`; Responses API, low reasoning, 30-second timeout, and up to two transport retries.

Every generation rewrites the post in the selected output language, including posts already written in that language. Tone, length, rewrite strength and custom instructions guide the wording while preserving facts. Meaningful links are retained; only a trailing source signature is removed when enabled, with the YouTube exception. Runtime HTML and Telegram length checks still apply: structured output alone does not ensure safe markup or correct meaning. See [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

```sh
# Offline: check the dataset and deterministic validators, no model requests
pnpm evals

# Live: explicit logical-call budget, reports go to apps/api/eval-reports/
pnpm --filter api evals --live --budget-calls 40 --out eval-reports/candidate.json

# Optional structured LLM grading; budget includes generation + grading
pnpm --filter api evals --live --judge --budget-calls 80 --out eval-reports/judged.json

# Compare models or prompt revisions on the same versioned dataset
pnpm --filter api evals --live --budget-calls 40 --model YOUR_MODEL \
  --out eval-reports/alternative.json --compare eval-reports/candidate.json
```

Keep baseline reports before editing a prompt and bump `promptVersion` when its rules change. Reports contain each case's failures, available token usage, latency, model and prompt version. Deterministic checks cover required facts/links, source removal, safe HTML and message lengths; they do not prove rewrite quality. Live LLM grades are advisory and must be calibrated with human review, following [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices). An [example offline report](apps/api/src/evals/examples/reference-check.md) and its JSON are included in the repository. Never present `reference_self_check` results as measured model quality. CI performs no paid API calls.

## Verification

```sh
pnpm test
pnpm typecheck          # includes API tests
pnpm lint
pnpm build
```

Integration and browser tests require **isolated, migrated** PostgreSQL and Redis. External Telegram and OpenAI are replaced with local stubs. Browser tests require a dedicated database whose name ends in `_test`; their test-only server resets its data between scenarios. Never point these variables at production.

```sh
DATABASE_URL=postgresql://postgres:test@localhost:55439/copywrite_browser_test pnpm db:deploy
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55439/copywrite_browser_test \
TEST_REDIS_URL=redis://localhost:56390/1 pnpm test:integration

pnpm --filter client exec playwright install chromium
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55439/copywrite_browser_test \
TEST_REDIS_URL=redis://localhost:56390/1 pnpm test:e2e
```

Coverage includes ownership boundaries, public role injection, JWT expiry/type checks, bot permissions, routes, replayed updates, album order/deduplication, recovery after Redis failure and restart, shutdown during generation, password changes, AI failure blocking, optimistic draft revisions, ambiguous Telegram delivery and the registration → reviewed publication flow on desktop/mobile.

## Production deployment

Configure HTTPS `APP_URL`, strong JWT/database credentials and working bot/OpenAI keys. `.env` is excluded from the image. Place the app behind an HTTPS reverse proxy; the API serves the built client on the same origin. Production trusts one reverse-proxy hop for client IP rate limits. The proxy must replace `X-Forwarded-For` with the actual client IP; keep the app’s loopback port private and do not expose PostgreSQL or Redis ports. The initial deployment is single-instance polling; no webhook or separate worker is needed.

```sh
docker compose -f compose.production.yaml build
docker compose -f compose.production.yaml up -d postgres redis
docker compose -f compose.production.yaml run --rm app pnpm db:deploy
docker compose -f compose.production.yaml up -d app
```

Set `LOCAL_POSTGRES_PASSWORD` and `JWT_SECRET` to strong random values. URL-encode reserved characters in database URL credentials.

Redis uses AOF and a persistent volume; PostgreSQL holds source content, drafts, operation intents and publication results. The queue dispatcher re-enqueues pending intents after recovery. A generation interrupted after starting requires a manual retry. A publication interrupted during sending becomes **delivery unknown**; verify the destination before marking it published or explicitly allowing another send.

### Backup and restore

```sh
docker compose -f compose.production.yaml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql

# Stop the app, restore into a new empty database, then migrate and restart.
docker compose -f compose.production.yaml stop app
# On the replacement PostgreSQL database:
psql "$RESTORE_DATABASE_URL" < backup.sql
# Configure DATABASE_URL to the restored database before restarting.
```

Protect backups like channel content and account data. Restore PostgreSQL first; pending operation intents can recreate queue jobs. Run `pnpm db:deploy` before starting the restored app. Already-running publications are intentionally not sent automatically again.

## Limits

No scraping/MTProto, channel history import, automatic/scheduled posting, teams, payments, RAG, agents or demo mode. The album's 1000 ms quiet period is a completeness heuristic; Telegram updates are retained by Telegram for a limited time. Telegram sending has no general exactly-once guarantee. Media preview is capped at 20 MiB and may be unavailable even when Telegram can republish the saved file. Live provider access, real rewrite quality and actual public deployment require separate smoke tests; offline test success is not evidence of those.
