# Cosign

An AI agent that recomputes every payment request a credit fund receives from source data, and a Solana program that makes it impossible for that agent to move money without human approval.

- **Run the demo / record the video: [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md)**
- Plan, demo script and design rules: [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)
- Shared data shapes, routes, error codes: [CONTRACT.md](CONTRACT.md) (mirrored in [shared/types.ts](shared/types.ts), **frozen**)

## Folder ownership

| Folder | Owner | What lives there |
|---|---|---|
| `programs/`, `tests/` | A | Anchor program `policy_vault` and its tests (A creates these with `anchor init`) |
| `chain/` | A | TypeScript Solana client: `proposePayment`, `approve`, `execute`, `setAgentEnabled` |
| `scripts/` | A | Devnet setup: mint, payees, keypairs, airdrops |
| `server/` | B | Fastify API (port 3001), Gemini parser, agent service |
| `web/` | C | Next.js + Tailwind frontend (port 3000) |
| `engine/` | D | Pure verification functions: `verifyMarginCall`, `verifyLoanDraw`, `evidenceHash` |
| `fixtures/` | D | Positions, agreements, registry JSON and `emails/*.txt` |
| `shared/`, `CONTRACT.md` | everyone | Frozen. Change only with whole-team agreement, both files in one commit |
| `docs/` | everyone | Read-only reference |

Only edit files in folders you own. If you need something from another folder, ask its owner.

## Setup

Requires Node 22.18 or newer (the server runs TypeScript directly with Node's built-in type stripping).

```bash
npm install
```

```bash
cp .env.example .env
```

Don't create `web/.env.local`: the web app calls the real server by default (`npm run dev:mocks -w web` for mock data).
To act on Solana you also need the devnet keys in `keys/` (see the runbook).

Never commit `.env`, `.env.local` or anything in `keys/`.

## Run each workspace

| Workspace | Command | Check |
|---|---|---|
| engine | `npm test -w engine` | vitest runs |
| server | `npm run dev -w server` | `curl localhost:3001/health` → `{"ok":true}` |
| web | `npm run dev -w web` | open http://localhost:3000 |
| chain | `npm run typecheck -w chain` | no errors |
| all | `npm run typecheck` | no errors in any workspace |

## Conventions

- Money is whole US dollars everywhere except inside `chain/` (6 decimals there).
- Import shared types with a type-only import and the `.ts` extension:
  `import type { Request } from "../../shared/types.ts";`
- No enums or other TypeScript syntax that emits code (`erasableSyntaxOnly` is on), so Node can run the files directly.
- Never commit real keys or `.env` files.

## Branches

One branch per person:

| Branch | Owner |
|---|---|
| `a-solana` | A |
| `b-server` | B |
| `c-web` | C |
| `d-engine` | D |

- Small merges into `main`, often.
- **Never break `main`.** Before merging, run `npm install`, `npm run typecheck` and `npm test` from the root.
- Pull `main` into your branch regularly so the contract and other folders stay current.
