# AgentBox Demo

A minimal Next.js chat UI that showcases the [AgentBox SDK](../openagent). Pick a sandbox provider, a coding-agent harness, and a model, then chat with an agent running inside an isolated cloud sandbox.

- Frontend: [AI Elements](https://skills.sh/vercel/ai-elements) (Vercel) on top of shadcn/ui
- Backend: Next.js route handler streaming NDJSON events from the AgentBox SDK
- Log rendering: ClaudeCode/Codex/OpenCode display components ported from Twill
- Sandboxes: E2B, Modal, Daytona, Vercel (one shared sandbox per provider for the demo)

> Shared-sandbox warning: for cost reasons this demo reuses a single sandbox per provider across all chats. Anything you type, run, or write to disk can be observed by other users. Do not paste secrets.

## Prerequisites

- Node.js 20+ (`nvm use 20` or newer)
- pnpm 10+
- Accounts/keys for the sandbox providers you want to try (E2B / Modal / Daytona / Vercel)
- At least one of: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`

## 1. Install demo dependencies

```bash
cd ../agentbox-demo
pnpm install
```

## 2. Build the sandbox image on each provider

The image in [`sandbox-image.mjs`](./sandbox-image.mjs) installs `claude-code`, `opencode`, and `codex` CLIs on top of `node:20-bookworm`. You need to build it once per sandbox provider and capture the returned ID into `.env`.

```bash
# E2B -- prints a template id
npx agentbox image build --provider e2b --file ./sandbox-image.mjs

# Modal -- prints a modal image id
npx agentbox image build --provider modal --file ./sandbox-image.mjs

# Daytona -- prints a snapshot id
npx agentbox image build --provider daytona --file ./sandbox-image.mjs
```

> Vercel is not supported by `agentbox image build`. Vercel sandboxes use
> runtime snapshots instead. A small helper script is included for this:
>
> ```bash
> # Node 20.6+ (for --env-file). VERCEL_TOKEN, VERCEL_TEAM_ID, and
> # VERCEL_PROJECT_ID must already be set in .env.
> node --env-file=.env build-vercel-snapshot.mjs
> ```
>
> It boots a bare `node24` Vercel sandbox, `sudo npm i -g` the three
> harness CLIs, calls `sandbox.snapshot()`, prints the resulting id, and
> tears the source sandbox down. Paste the printed id into
> `VERCEL_SNAPSHOT_ID` in `.env`.

## 3. Configure environment

Copy [`.env.example`](./.env.example) to `.env` (or extend your existing `.env`) and fill in the keys/IDs. At minimum you need:

- `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`
- Provider credentials + image ID for each sandbox you want available:
  - `E2B_API_KEY` + `E2B_TEMPLATE_ID`
  - `MODAL_TOKEN_ID` + `MODAL_TOKEN_SECRET` + `MODAL_IMAGE_ID`
  - `DAYTONA_API_KEY` + `DAYTONA_SNAPSHOT_ID`
  - `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID` + `VERCEL_SNAPSHOT_ID` (optional: `VERCEL_PROTECTION_BYPASS`)

## 4. Run the demo

```bash
pnpm dev
# then open http://localhost:3000
```

## How it works

```
UI (AI Elements)  ──POST /api/chat NDJSON──▶  Next.js route handler
                                               │
                                               ▼
                                         SandboxPool (singleton)
                                               │ reuse or boot
                                               ▼
                                         Sandbox (per provider)
                                               ▲
                                               │ agent.stream()
                                         AgentBox SDK  ── raw events ──▶  UI
                                                                          │
                                                                          ▼
                                                          AgentJobLogsDisplay
                                                          (ported from Twill)
```

- [`lib/sandbox-pool.ts`](./lib/sandbox-pool.ts) keeps one `Sandbox` per provider in a module-level map, health-checks it on reuse (`sandbox.run("true")`), and boots a new one if needed. It also enforces single-flight per provider via an in-memory busy flag and responds 409 when a second chat hits the same provider.
- [`app/api/chat/route.ts`](./app/api/chat/route.ts) forwards every raw agent event emitted by `agent.stream().rawEvents()` as one line of NDJSON (`{type:"raw", provider, event}`) plus a terminal `{type:"done"}`.
- [`components/agent-logs/`](./components/agent-logs) contains the ClaudeCode / Codex / OpenCode log-rendering components ported from Twill (same raw-event shape the CLI emits).
- [`app/page.tsx`](./app/page.tsx) uses AI Elements (`Conversation`, `Message`, `PromptInput`, `Shimmer`, `CodeBlock`) for the chat shell and plugs the ported agent-logs display into `MessageContent`.

## Scripts

```bash
pnpm dev         # next dev
pnpm build       # next build
pnpm start       # next start
pnpm lint        # eslint
```

## Known limitations (intentional for a demo)

- No auth / rate limiting / multi-user isolation -- shared sandbox.
- Chat history is not persisted across refresh.
- Permission approvals run in `auto` mode.
- AI Elements ships some components whose typings don't match the installed `@base-ui/react`; type check is disabled during `next build` via `typescript.ignoreBuildErrors`. Our own code passes `tsc --noEmit` cleanly.
