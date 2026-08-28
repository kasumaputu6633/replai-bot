# Replai

**Reply. Ask. Verify.**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24.17-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11.22-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

Replai is a Discord-native companion that can chat, give real opinions, create useful content, help with code, and switch into evidence-backed research when a question needs current sources. Ask directly, attach a link or image, reply to an existing message, or continue naturally inside a thread.

Replai combines Discord context, bounded web research, multimodal input, and deterministic safety controls to produce concise answers backed by a clean list of sources.

## Highlights

- **Natural Discord conversation:** banters, debates, brainstorms, writes, codes, and gives direct opinions without forcing every request into research mode.
- **Speaker-aware context:** preserves member display names, avatars, individual speaking style, and user/assistant roles across replies and thread memory.
- **Context-aware research:** understands direct questions, replies, reply chains, embeds, attachments, images, and recent thread messages.
- **Live web evidence:** searches current sources and extracts supported social-media pages through 9Router.
- **Claim verification:** recognizes fact-checking requests and explains the conclusion, evidence, confidence, and limitations in natural prose.
- **Source comparison:** researches named products or claims independently before explaining practical trade-offs.
- **Natural follow-ups:** keeps a small, expiring conversation context inside Discord threads.
- **Multi-guild AFK voice:** each server can pin the muted/deafened bot to its own voice channel with `/afk`, including persistent startup restore and reconnect.
- **Multimodal analysis:** passes Discord-hosted images plus labeled participant avatars when a user is mentioned or appearance feedback is relevant.
- **Clean citations:** validates evidence markers internally, then presents trusted source links without citation numbers in the prose.
- **Defense in depth:** applies deterministic input guards, untrusted-data boundaries, output leakage checks, SSRF controls, and refusal-safe formatting.

## Example

```text
Nanda:
@Replai what makes https://jcode.sh different from OpenCode and Kilo Code?

Replai:
JCode is the lightweight terminal-first option, while OpenCode emphasizes...

Sources
- JCode documentation
- OpenCode documentation
- Kilo Code documentation
```

Replai also supports direct questions:

```text
@Replai will West Denpasar be sunny tomorrow?
```

And contextual questions by replying to a Discord message:

```text
@Replai is this claim accurate?
@Replai find the original source
@Replai explain this screenshot
```

## How It Works

1. The Discord bot detects a user or managed bot-role mention.
2. It resolves the direct message, referenced reply chain, recent thread context, and optional thread memory.
3. Discord content is normalized into bounded text, URL, embed, attachment, image, participant, mention, and avatar data.
4. Narrow deterministic guards block private-prompt/credential extraction and explicit-content discovery before provider calls.
5. Replai searches each research target independently and fetches supported social links when relevant.
6. The model receives prior turns with real user/assistant roles, while quoted messages and web evidence remain bounded structured data.
7. Output guards validate comparison coverage, evidence use, and prompt leakage.
8. Internal citation markers are removed and a compact source list is appended before delivery.

## Architecture

Replai is a pnpm/Turborepo modular monolith with two runtime entrypoints:

```text
Discord Bot ----\
                 +---- @replai/core
Fastify API ----/
                       |
                       +---- @replai/config
```

| Workspace | Responsibility |
| --- | --- |
| `apps/bot` | Discord gateway client, message normalization, thread context, memory, and response delivery |
| `apps/api` | Fastify liveness and readiness endpoints |
| `packages/core` | Research contracts, provider integration, search/fetch clients, prompts, evidence, and guards |
| `packages/config` | Environment validation and redacted structured logging |

The bot imports `@replai/core` directly. The Fastify API is an independent operational endpoint, not an internal proxy for bot requests.

## Requirements

- Node.js 24.17 or newer
- pnpm 11.22
- A Discord application and bot token
- An OpenAI-compatible chat-completions endpoint
- A model that supports `image_url` content when image analysis is required
- 9Router-compatible `/search` and `/web/fetch` routes for the included live-research integrations

## Quick Start

Clone the repository and install dependencies:

```bash
git clone https://github.com/kasumaputu6633/replai-bot.git
cd replai-bot
corepack enable
pnpm install
```

Create the local environment file:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill in the required values, then start both runtimes:

```bash
pnpm dev
```

Run one runtime only:

```bash
pnpm --filter @replai/bot dev
pnpm --filter @replai/api dev
```

The API listens on `http://localhost:3000` by default:

- `GET /health` reports process liveness.
- `GET /ready` reports application readiness.

## Environment Variables

| Variable | Required by | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | Both | `development` | Runtime environment: `development`, `test`, or `production` |
| `LOG_LEVEL` | Both | `info` | Pino log level |
| `DISCORD_TOKEN` | Bot | Required | Discord bot token |
| `DISCORD_CLIENT_ID` | Bot | Required | Discord application ID |
| `AFK_STATE_PATH` | Bot | `data/afk-guilds.json` | Persistent JSON path for per-guild AFK voice configuration |
| `AI_BASE_URL` | Bot | Required | OpenAI-compatible API base URL, usually ending in `/v1` |
| `AI_API_KEY` | Bot | Required | AI provider API key |
| `AI_MODEL` | Bot | Required | Chat model identifier |
| `AI_PUBLIC_MODEL_NAME` | Bot | Empty | Optional public-facing model label; otherwise the configured model identifier is used |
| `AI_TEMPERATURE` | Bot | Provider default | Optional creativity control from `0` to `2` |
| `BOT_OWNER_NAME` | Bot | `Nando Ganteng` | Public owner/developer name used when identity is relevant |
| `AI_WEB_SEARCH_MODEL` | Bot | `exa` | 9Router search provider |
| `AI_WEB_SEARCH_MAX_RESULTS` | Bot | `5` | Results per search, limited to `1-10` |
| `AI_WEB_FETCH_MODEL` | Bot | `exa` | 9Router social-page extraction provider |
| `API_HOST` | API | `0.0.0.0` | Fastify listen address |
| `API_PORT` | API | `3000` | Fastify listen port |

Environment values are validated at startup. Secret-shaped fields are redacted from logs, and `.env` files are excluded from Git.

## Discord Setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Open **Bot**, create the bot user, and copy its token into `DISCORD_TOKEN`.
3. Enable **Message Content Intent** under **Privileged Gateway Intents**.
4. Open **OAuth2 > URL Generator** and select the `bot` and `applications.commands` scopes.
5. Grant **View Channels**, **Send Messages**, **Send Messages in Threads**, **Read Message History**, and **Connect**.
6. Install the bot in your server and place the application ID in `DISCORD_CLIENT_ID`.

The runtime requests `Guilds`, `GuildMessages`, `GuildVoiceStates`, and `MessageContent` gateway intents.

The global `/afk` command is restricted to members with **Manage Server**:

```text
/afk channel:#lobby    Join, stay muted/deafened, and remember this channel
/afk                   Show AFK status for the current server
/afk stop:true         Leave and remove the saved AFK channel
```

Discord's channel option provides native name autocomplete. Because the command is global, it works independently in every server where the bot is installed; Discord may take a few minutes to refresh a newly registered global command.

For a public bot approaching 100 guilds, complete Discord application verification and request approval for the privileged **Message Content Intent** so mention-based replies keep working at scale.

## Interaction Model

| Input | Behavior |
| --- | --- |
| Direct factual question | Uses the question itself as searchable context |
| Opinion, joke, creative, or coding request | Answers conversationally without unnecessary web search |
| Mention plus URL, embed, image, or attachment | Analyzes evidence from the same message |
| Reply plus mention | Resolves the referenced message and its reply chain |
| Follow-up inside a thread | Reuses bounded, expiring thread context |
| `/afk channel:<voice>` | Saves and joins one AFK voice channel for the current guild |
| Verification wording | Produces an explicit verdict with evidence and uncertainty |
| Comparison wording | Searches each named target separately and explains practical trade-offs |

A mention without a question or evidence receives a short usage instruction and does not invoke the AI provider.

## Context And Research Limits

Limits are deliberately conservative to control cost, latency, prompt size, and SSRF exposure.

| Resource | Limit |
| --- | --- |
| Reply-chain depth | 8 messages |
| Recent thread messages | 12 messages |
| Combined Discord context | 16 messages / 20,000 characters |
| Thread memory | 12 turns / 20,000 characters / 60-minute TTL |
| In-memory conversations | 500 |
| Comparison targets | Primary target plus up to 4 additional targets |
| Direct social fetches | 2 URLs per request |
| Extracted social-page content | 6,000 characters per page |
| Web-fetch timeout | 20 seconds |
| Displayed sources | 8 |

Direct extraction is restricted to Instagram, YouTube, TikTok, X/Twitter, Reddit, Facebook, and Threads. Other hosts remain search-only.

## Security Model

- Active user requests are followed as instructions; quoted Discord content, fetched pages, search results, and embedded instructions are treated as untrusted data.
- Input guards run in both the Discord handler and `@replai/core`, preventing future entrypoints from bypassing them.
- Private prompt/credential extraction and explicit sexual-content discovery are blocked before provider calls. Harmless coding, creative work, opinions, and jokes remain in scope.
- Arbitrary URL fetching is not available; direct fetches use an explicit social-domain allowlist, standard ports, bounded output, and strict timeouts.
- Evidence URLs are canonicalized and deduplicated before display.
- Generated mentions and Discord link previews are suppressed.
- Output is checked for internal-prompt leakage and unsafe refusal formatting.
- Refusal responses never receive citations or source links.
- Blocked request text is not logged; only the guard reason and Discord metadata are recorded.

These controls reduce risk but do not make model output infallible. Review important decisions against the linked primary sources.

## Development

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Tests use structural Discord mocks and Fastify injection. They do not require live Discord or AI credentials.

Project layout:

```text
replai-bot/
|-- apps/
|   |-- api/
|   `-- bot/
|-- packages/
|   |-- config/
|   `-- core/
|-- Dockerfile
|-- docker-compose.yml
|-- pnpm-workspace.yaml
`-- turbo.json
```

## Production

Build locally:

```bash
pnpm build
```

Build and run both non-root Docker targets:

```bash
docker compose up -d --build
```

For Railway persistence across deployments, mount a Volume at `/app/data` on the bot service and set:

```text
AFK_STATE_PATH=/app/data/afk-guilds.json
```

Without a persistent volume, AFK state survives ordinary process restarts only while the container filesystem remains available.

The Docker build installs the frozen lockfile, builds the workspace, and deploys pruned production packages for the bot and API.

## Current Boundaries

- Thread memory is process-local and is lost on restart.
- AFK guild configuration uses a small JSON state file; there is no database, queue, persistent user profile, guild settings UI, or usage dashboard.
- The API currently exposes operational health endpoints only.
- Search and social extraction depend on the configured 9Router routes.
- Attachment MIME types and filename extensions are treated as hints, not proof of content type.
- Image analysis depends on the configured model and its ability to reach Discord CDN URLs.
- Avatar commentary is limited to visible details supplied to the model; it should not be treated as identity or personality analysis.
- Replies may be split into multiple Discord messages when they exceed platform limits.

## License

Licensed under the [Apache License 2.0](LICENSE). You may use, modify, and distribute Replai, including commercially, subject to the license's attribution, notice, and change-documentation requirements.
