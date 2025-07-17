# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hang is a real-time communication platform built with:
- **Frontend**: SolidJS + Vite + Tailwind CSS v4 + Tauri (desktop)
- **Backend**: Cloudflare Workers + Hono + tRPC + Drizzle ORM
- **Real-time**: WebTransport + MOQ (Media over QUIC)
- **Package Manager**: pnpm with workspaces

## Essential Commands

```bash
# Development
just dev

# Build & Deploy
just build
just deploy live

# Code Quality
just check
just fix
```

## Architecture

### Frontend (`/app`)
Closed source conferencing UI. The open source components are published as `@kixelated/*` under a separate repo.

- **Entry**: `src/index.tsx`
- **Routing**: SPA with `@solidjs/router`
- **State**: SolidJS signals, sometimes backed by @kixelated/signals
- **API Client**: RPC client using Hono RPC in `@hang/api-client`
- **Desktop**: Tauri configuration in `tauri/`

### Backend (`/api/server`)
- **Entry**: `src/index.ts` - Hono app.
- **Routes**: RPC endpoints using Hono RPC.
- **Auth**: JWT with OAuth providers in `src/auth.ts`
- **Environment**: Cloudflare Workers with D1 database and R2 storage

### Key Patterns
1. **Type-safe RPC**: Backend and frontend share types.
2. **WebTransport Rooms**: Real-time media streaming via MOQ protocol
3. **OAuth Flow**: Authentication with Google/Discord through popup windows
4. **Edge-first**: All backend services run on Cloudflare's edge network

## Development Tips

### Running Locally
- `just dev` runs the API server, app web server, and tauri app.
- `just check` runs linting and CI checks.
- `just fix` fixes common linting things (like formatting), only if current changes are staged/commited.


### Working with Media over QUIC
- Rust and Typescript implementation in https://github.com/kixelated/moq
- Uses WebTransport and QUIC under the hood.

## Code Style
- **Formatting**: Biome with tabs, 120 line width, double quotes
- **Components**: PascalCase for components, camelCase for functions
- **Imports**: Always use ESM, prefer `import * as ` for namespacing.
- **Async**: Use async/await over promises
