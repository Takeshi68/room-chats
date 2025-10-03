# Room Chats — Local/Demo-ready Chat App

A lightweight chat UI originally built around Supabase auth/realtime, now safe to open-source and runnable without any external keys.

## Highlights

- **Supabase optional**: When `NEXT_PUBLIC_DISABLE_SUPABASE=true`, the app switches to a local in-browser store for messages.
- **No leaked keys**: All hard-coded Supabase and GitHub keys are removed. Use environment variables instead.
- **Guest mode**: With GitHub disabled, users can join as a **Guest** (choose a display name).
- **Demo mode**: Enable `NEXT_PUBLIC_DEMO_MODE=true` to simulate a few users chatting automatically.
- **Realtime fallback**: Without Supabase, updates propagate via the `BroadcastChannel` API.

## Quick Start

```bash
pnpm i
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | _empty_ | Your Supabase project URL (optional) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | _empty_ | Your Supabase anon key (optional) |
| `NEXT_PUBLIC_DISABLE_SUPABASE` | `true` | If `true`, use local in-browser DB (no network) |
| `NEXT_PUBLIC_DISABLE_GITHUB` | `true` | If `true`, hide GitHub OAuth and use **Guest** flow |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | If `true`, seed & simulate conversation |

> To use real Supabase auth + realtime: set `NEXT_PUBLIC_DISABLE_SUPABASE=false`, fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and (optionally) set `NEXT_PUBLIC_DISABLE_GITHUB=false`.

## Features

- Chat room with message send/delete/hide (hide-for-me) basics
- Typing indicator (Supabase mode)
- File attachment (Supabase storage mode)
- Demo seeding + simulated chatter when in **DEMO_MODE**
- Guest auth fallback when GitHub disabled

## Notes on Local "DB"

When Supabase is disabled the app uses the browser's `localStorage` to persist messages under the key `local_messages`, and uses `BroadcastChannel` (`chat-demo`) to sync updates across open tabs. This keeps the app zero-dependency for demos and public repos.

If you prefer a server-backed local DB (e.g. SQLite/Prisma), add an API route (e.g. `/api/messages`) and swap the data calls in `lib/chat.ts` for fetch calls behind `NEXT_PUBLIC_DISABLE_SUPABASE`.

## Development Tips

- Use `.env.local` for your secrets (the app only reads `NEXT_PUBLIC_*` on the client).
- When enabling Supabase, double-check Row Level Security and Realtime config for tables used by `lib/chat.ts`.
- The `lib/supabase.ts` exports a **stub** client when disabled so other imports won't crash.
