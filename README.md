# Replai

**Reply. Ask. Verify.**

Replai is a Discord research assistant for factual questions, contextual analysis, claim verification, and source comparison. Users can ask a direct question, include links or media in the same message, or reply to existing Discord content. Replai analyzes relevant text, links, attachments, embeds, images, reply chains, and thread context before responding.

```text
Alice:
"NVIDIA is ending consumer GPU production."
[screenshot]

Bob (replying to Alice):
@Replai is this actually true?

Replai (replying to Bob):
...
```

## Architecture

This repository is a pnpm/Turborepo modular monolith with multiple entrypoints:

```text
Discord Bot ----\
                 +---- @replai/core
Fastify API ----/
```

- `apps/bot`: discord.js gateway client, Discord normalization, bounded thread memory, and response delivery.
- `apps/api`: Fastify process exposing liveness and readiness endpoints.
- `packages/core`: provider-independent research types, context limits, prompts, and the OpenAI-compatible provider.
- `packages/config`: centralized Zod environment parsing and Pino logger creation.

The bot imports `@replai/core` directly. It does not call the API over HTTP.

## Requirements

- Node.js 24.17 or newer
- pnpm 11.22
- A Discord application and bot token
- An OpenAI-compatible endpoint and a model capable of processing image URL content when image analysis is needed

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp` if no Unix-compatible shell is installed.

Run one entrypoint only:

```bash
pnpm --filter @replai/bot dev
pnpm --filter @replai/api dev
```

The API is available at `http://localhost:3000` by default:

- `GET /health`: process liveness
- `GET /ready`: application readiness

## Environment

| Variable | Required by | Description |
| --- | --- | --- |
| `NODE_ENV` | Both | `development`, `test`, or `production` |
| `LOG_LEVEL` | Both | Pino level such as `info`, `debug`, or `warn` |
| `DISCORD_TOKEN` | Bot | Discord bot token |
| `DISCORD_CLIENT_ID` | Bot | Discord application/client ID |
| `AI_BASE_URL` | Bot | OpenAI-compatible API base URL, commonly ending in `/v1` |
| `AI_API_KEY` | Bot | Provider API key |
| `AI_MODEL` | Bot | Provider-specific model identifier |
| `AI_WEB_SEARCH_MODEL` | Bot | 9Router web-search provider, defaults to `exa` |
| `AI_WEB_SEARCH_MAX_RESULTS` | Bot | Search evidence count, defaults to `5` and is capped at `10` |
| `AI_WEB_FETCH_MODEL` | Bot | 9Router social-page extraction provider, defaults to `exa` |
| `API_HOST` | API | Listen address, defaults to `0.0.0.0` |
| `API_PORT` | API | Listen port, defaults to `3000` |

Configuration is validated at startup. Secret values are never included in validation errors and common secret-shaped log fields are redacted.

## Discord Developer Portal

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications).
2. Open **Bot**, create the bot user, and copy/reset its token into `DISCORD_TOKEN`.
3. Under **Privileged Gateway Intents**, enable **Message Content Intent**. Replai needs the referenced message's `content`, `embeds`, and `attachments`; these fields can otherwise be empty.
4. Under **OAuth2 > URL Generator**, select the `bot` scope.
5. Grant only **View Channels**, **Send Messages**, and **Read Message History**. Read Message History is required to resolve the message being replied to.
6. Open the generated URL and install the bot in the target server.
7. Put the application's ID in `DISCORD_CLIENT_ID`.

The runtime requests only `Guilds`, `GuildMessages`, and `MessageContent`. Discord currently requires privileged-intent review after an app reaches its applicable user threshold; consult the Developer Portal when scaling beyond development use.

## Interaction

Mention the bot with a direct factual question, include evidence in the same message, or reply to existing content:

```text
@Replai is this actually true?
@Replai find the original source
@Replai explain this screenshot
@Replai is this misleading?
@Replai will West Denpasar be sunny tomorrow?
@Replai compare https://example.com with OpenCode and Kilo Code
```

Reply chains are resolved up to six messages. Threads can include up to eight recent messages and keep a bounded in-memory follow-up context for 15 minutes. A mention with no question or evidence receives a short instruction and does not invoke the AI provider.

## Quality Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Tests use plain adapter data and Fastify injection; they do not require Discord or AI credentials.

## Production

Build locally:

```bash
pnpm build
```

Run both non-root Docker targets:

```bash
docker compose up -d --build
```

The Docker build installs the frozen lockfile once, builds the workspace, and deploys a pruned production package for each runtime target.

## Security Guardrails

- Discord content, images, embeds, attachment metadata, and search results are serialized as untrusted JSON evidence rather than instructions.
- A deterministic guard blocks common prompt-injection, secret-extraction, jailbreak, unrelated generation, and explicit sexual-content discovery requests before the AI provider or web search is called.
- The same guard runs inside `@replai/core`, so future entrypoints cannot bypass it.
- The system prompt restricts Replai to contextual analysis and forbids exposing prompts, credentials, configuration, internal errors, or tool instructions.
- Provider output is checked for recognizable internal-prompt leakage before delivery.
- Refusal responses never receive citations or a source list.
- Blocked request text is not written to logs; only the guard reason and Discord metadata are recorded.
- URL content extraction is limited to two URLs on an explicit social-domain allowlist, standard HTTP(S) ports, 6,000 characters per page, and a 20-second timeout.

## MVP Boundaries

- No database, queues, persistent conversation history, guild settings, or usage tracking. Thread memory is process-local, bounded, and expires after 15 minutes.
- Live research uses 9Router's bounded `/v1/search` endpoint and passes result titles, URLs, dates, and snippets to the AI model.
- Social links from Instagram, YouTube, TikTok, X/Twitter, Reddit, Facebook, and Threads can be extracted through bounded `/v1/web/fetch` calls. Arbitrary hosts remain search-only to avoid a generic SSRF surface.
- Attachment MIME types and filename extensions are hints only.
- Image URLs are passed directly as multimodal `image_url` parts; the configured provider must support that OpenAI-compatible format and be able to reach Discord CDN URLs.
- Search availability depends on the configured 9Router web-search route. The default is `exa`.
- Evidence markers are validated internally and removed before delivery; users receive a compact list of trusted source links instead of inline citation numbers.
- Replies are split below Discord's message limit and delivered in order; the first chunk replies to the user's query message.
