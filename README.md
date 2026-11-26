# Hang

Real-time communication platform built on [Media over QUIC](https://moq.dev).

Try it at [hang.live](https://hang.live).

## Architecture

Hang is a web application built on the open-source [MoQ](https://github.com/moq-dev/moq) media streaming library:

- **app** — Web frontend built with SolidJS, Vite, and Tailwind CSS v4
- **api** — Backend running on Cloudflare Workers with Hono and Drizzle ORM

The frontend and backend share types via Hono RPC.
Real-time media is streamed over WebTransport using the MoQ protocol, through [moq.pro](https://moq.pro) relays in production and a local relay in development.

## Project Structure

```
app/        Web frontend (SolidJS + Vite)
api/        Backend API (Cloudflare Workers + Hono)
dev/        Local relay and auth service config
moq/        Pinned MoQ submodule, consumed as Bun workspaces
quest/      Planned work (see quest/README.md)
```

## Getting Started

Install [Nix](https://nixos.org) and [direnv](https://direnv.net); the dev shell in `flake.nix` provides every tool, including the `moq-relay` and `moq` binaries `just dev` runs.
The shell supports Linux and Apple Silicon macOS.
Without Nix, put the tools that dev shell lists on your `PATH` yourself.

```sh
git clone --recurse-submodules https://github.com/moq-dev/hang.live.git
cd hang.live
direnv allow
git lfs pull
just install
just dev
```

In an existing checkout, run `git submodule update --init` first.
`git lfs pull` fetches the media assets a clone leaves as pointers when Git LFS is only in the dev shell.

`just dev` starts these processes concurrently:

- **api** — Cloudflare Workers dev server (via wrangler) on port 3000
- **app** — Vite dev server on port 1420
- **types** — Watch API declarations for frontend RPC types
- **relay** — MoQ relay server on port 4443
- **auth** — Local token verification service

## Commands

| Command | Description |
| --- | --- |
| `just install` | Install workspaces, decoder assets, and API declarations |
| `just dev` | Run all dev servers |
| `just check` | Run quest validation, the unused-dependency check, type checks, linting, and tests |
| `just fix` | Auto-fix formatting and lint issues |
| `just build` | Build all packages |
| `just deploy` | Deploy the live API and app to Cloudflare |

`just --list` shows the rest.

## MoQ (Media over QUIC)

Hang uses [moq](https://github.com/moq-dev/moq), an open-source library for real-time media streaming over WebTransport and QUIC.
The `@moq/*` packages resolve from the pinned `moq/` submodule as Bun workspaces, and the Nix flake builds `moq-relay`, `moq`, and the `@moq/libav` decoder from the same revision.
Without Nix, the decoder build downloads that version's published npm tarball instead.
See [moq.dev](https://moq.dev) for full documentation.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and the Quest workflow.
The [quest backlog](quest/README.md) tracks planned bugs and improvements.

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE), at your option.
