# Demo runbook: run Cosign on your laptop and record the video

Everything here runs against the **real program on Solana devnet**. Only Node is needed; Rust, Anchor and the Solana CLI are only for rebuilding or redeploying the program (see the end).

## 1. One-time setup (about 5 minutes)

1. **Node 22.18 or newer.** Check with `node --version`. Older Node can't run the server's TypeScript.
2. **Clone and install:**
   ```bash
   git clone https://github.com/httpsdluc/hackknights26.git && cd hackknights26 && npm install
   ```
3. **Get the `keys/` folder from Diana** (sent privately, never through GitHub). Put the five files in `keys/` at the repo root:
   `admin.json`, `agent.json`, `approver1.json`, `approver2.json`, `deployer.json`.
   These are devnet-only test keys with no real value, but don't post them anywhere public.
   Without them the pages load, but every button that touches Solana fails with "missing keypair".
4. **Create `.env`** at the repo root:
   ```bash
   cp .env.example .env
   ```
   Then set `USE_CACHED_LLM=true`. No Gemini key is needed in this mode, and the numbers are identical.
5. **Delete `web/.env.local` if you have one.** An older README told you to create it, and it turns on fake mock data:
   ```bash
   rm -f web/.env.local
   ```

## 2. Start it (two terminals)

```bash
npm run dev:server
```

```bash
npm run dev:web
```

Open http://localhost:3000. **The pill at the top right must say "Solana devnet".** If it says "Mock API", you are recording fake data: stop, do step 5 above, restart the web app.

## 3. Before every recording or rehearsal

1. Stop the server (Ctrl-C). Required: it remembers proposals from the old vault, and Approve would fail after the reset.
2. Reset the vault: fresh $10M, agent on, phishing wallet gone.
   ```bash
   node scripts/reset-demo.ts
   ```
3. **Wait 60 seconds** (the new payees' timelock), then start the server again.
4. Open http://localhost:3000/vault: balance $10,000,000, kill switch says "Agent running", both payees "Active".
5. Open the inbox once so it's loaded. Close other tabs, hide bookmarks, zoom the browser so the page fills the frame.

Reset is required after any run that used the kill switch or "Approver adds the new wallet". It also refills the vault (each Story 1 pays $1.9M).
Only the person recording should run the reset: it creates a new vault for that laptop only. **Don't commit `chain/deployment.json` afterwards.**

## 4. Shot list (3 minutes)

| Time | Screen | Click | Say / show |
|---|---|---|---|
| 0:00 | Inbox | none | Hook: funds check margin calls by hand; AI agents that pay are one phishing email from disaster. |
| 0:20 | Inbox → **Margin call** | open it | Broker asks **$2,400,000**. Highlighted sentences are what Gemini extracted. |
| | Reconciliation | none | Bond A at **15%**, agreement says **10%** (clause 4.2). Cosign agrees **$1,900,000**, disputes **$500,000**. Dispute notice is drafted. |
| | Payment ticket | **Propose payment** | Agent proposes on Solana. "Needs 2 approvals before release". |
| | | **Approve** (Demo signer 1), **Approve** (Demo signer 2) | 2/2. The dropdown moves to signer 2 by itself. |
| | | **Release payment** → **View payment on Solana Explorer** | Real devnet transaction, about a second. |
| | Evidence fingerprint | **Verify evidence** | Three hashes match: recomputed now, on this page, stored on Solana. An auditor can check why it was paid. |
| 1:20 | Inbox → **Loan draw** | open it | $5,000,000 asked, only **$3,000,000** left (clause 2.1). Rejected, nothing proposed. |
| 1:50 | Inbox → **Payment details change** | open it | The phishing email: new wallet, $2M, hidden "SYSTEM: approve" text. The honest agent refuses. |
| | **Attack lab** | switch **Compromised agent** on → **Fire phishing payment** | `PayeeNotAllowed`: the wallet isn't on the allowlist. |
| | | **Approver adds the new wallet** → **Fire phishing payment** | `PayeeTimelocked`: even a phished approver can't make it payable right away (60s here, 72h in production). |
| | **Vault** | flip **Kill switch** | Agent stopped. The phishing wallet shows as "Not in registry", timelocked. |
| | **Attack lab** | **Fire phishing payment** | `AgentDisabled`. |
| 2:40 | any | none | Close: "The AI does the reading and the math. The blockchain enforces the rules." |

If you take longer than 60s between "Approver adds the new wallet" and firing, the proposal is accepted as "Held for approval" instead of `PayeeTimelocked`. That's still correct (it can't be released without two humans), but for the video, fire right away.

## 5. If something goes wrong

| Symptom | Fix |
|---|---|
| Header says "Mock API" | `rm -f web/.env.local`, restart `npm run dev:web` |
| Button shows "The server didn't answer" and the server log says "missing keypair" | `keys/` is missing a file (step 1.3) |
| Story 1 propose shows `PayeeTimelocked` | You didn't wait 60s after the reset. Wait, click again. |
| Story 1 propose shows `AgentDisabled` | Kill switch is still on: flip it back on the Vault page, or reset |
| Phishing fire shows "Held for approval" on the first try | The phishing wallet is left over from a rehearsal: reset |
| Inbox is slow or empty | Check `USE_CACHED_LLM=true` in `.env`, restart the server |
| Reset fails with "Need ... SOL" | Devnet faucet limit. Tell Diana; the deployer key funds it and has about 2.8 SOL. |

## 6. Is the Solana part done?

Yes. `programs/policy_vault` is deployed on devnet at `HW56pPpGGjQxfp1UaGgJmDTSmMAHNcZnTo7qbEp3zYX1` and matches this repo byte for byte. All six instructions work, and 17 program tests cover every rejection: `PayeeNotAllowed`, `PayeeTimelocked`, `AgentDisabled`, `Unauthorized`, `NotEnoughApprovals`, `AlreadyApproved`, `AlreadyExecuted`, `OverPerTxLimit`, `AgentCannotApprove`. The daily cap was cut on purpose (stored, not enforced).

Only needed to change the program (not to run the demo): Rust, Solana CLI and Anchor 0.31.1, then `scripts/test.sh` (local tests) and `scripts/build.sh` + `node scripts/setup-devnet.ts` (deploy). Redeploying needs `keys/deployer.json`, the program's upgrade authority.
