# Cosign shared contract

This file is the single source of truth for every shape that crosses a folder boundary.
`shared/types.ts` mirrors it exactly and is **frozen**. To change either one, get agreement from the whole team and update both in the same commit on `main`.

Background and reasoning: `docs/BUILD_PLAN.md`.

---

## 1. Money

- Amounts are **whole US dollars** (`number`, no cents) everywhere: engine, server, API, web, fixtures.
- The **only** exception is inside `chain/`, which converts USD to the Test USDC base unit (6 decimals) before calling the program and converts back before returning.
- Haircuts are fractions: `0.15` means 15%.

## 2. Ports

| Service | Port |
|---|---|
| server (Fastify) | 3001 |
| web (Next.js) | 3000 |

## 3. Chain error codes

Chain errors are a plain string code. These are the only allowed codes:

```
AgentCannotApprove
Unauthorized
AgentDisabled
PayeeNotAllowed
PayeeTimelocked
OverPerTxLimit
AlreadyApproved
NotEnoughApprovals
DailyCapExceeded
AlreadyExecuted
```

One more code comes from the server, never from the chain:

```
AgentRefused
```

`AgentRefused` means the agent itself declined to propose before touching the chain: the request was rejected by verification, mentions new payment details, or isn't a payable type (Story 2, and the phishing email when the agent is not compromised).

## 4. HTTP routes (server, port 3001)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/requests` | | `Request[]` (inbox list) |
| GET | `/requests/:id` | | `Request` |
| POST | `/requests/:id/propose` | | `ProposeResult` |
| POST | `/proposals/:id/approve` | `{ "approver": string }` | `ProposeResult` |
| POST | `/proposals/:id/execute` | | `ProposeResult` |
| POST | `/vault/kill-switch` | `{ "enabled": boolean }` | `ProposeResult` |
| POST | `/attack/compromised-agent` | `{ "requestId": string }` | `ProposeResult` |
| POST | `/attack/add-phishing-payee` | | `AddPayeeResult` |
| GET | `/requests/:id/evidence` | | `EvidenceCheck` |
| GET | `/vault` | | `VaultState` |

### Action results

Propose, approve, execute and kill-switch **always return HTTP 200** with one of:

```json
{ "ok": true, "tx": "...", "proposal_id": "..." }
```
```json
{ "ok": false, "error_code": "<code>" }
```

`error_code` is one of the codes in section 3 (the chain codes, or `AgentRefused` from `POST /requests/:id/propose`).

### Kill switch direction

`POST /vault/kill-switch { "enabled": false }` **stops the agent** (kill switch ON). `enabled` means **agent enabled**, not "kill switch enabled", and matches `rules.agent_enabled` in `GET /vault`. `{ "enabled": true }` lets the agent propose again.

### `POST /attack/add-phishing-payee`

Story 3, second beat: a phished approver adds the phishing wallet (`fixtures/attack.json`) as a payee. The program starts its timelock, so the compromised agent's next proposal fails with `PayeeTimelocked` instead of `PayeeNotAllowed`. Always HTTP 200:

```json
{ "ok": true, "tx": "...", "active_after": 1791677167 }
```
```json
{ "ok": false, "error_code": "<code>" }
```

- `tx` is `null` if the wallet was already a payee of this vault (nothing was sent). Run `scripts/reset-demo.ts` to start over.
- `active_after` is unix **seconds**, same as in `GET /vault`.

### `GET /requests/:id/evidence` example response

Recomputes the evidence hash now, from the source email file, the fixture files and the engine (only the parsed request is reused from memory), and compares it with the hash on the request and the one stored in the on-chain proposal.

```json
{
  "recomputed_hash": "4d73...bc1d",
  "stored_hash": "4d73...bc1d",
  "on_chain_hash": "4d73...bc1d",
  "match": true
}
```

- `on_chain_hash` is `null` until the request has a proposal.
- `match` is true when `recomputed_hash` equals `stored_hash` and, if there is one, `on_chain_hash`.
- Unknown request: HTTP 404, same as `GET /requests/:id`.

### `GET /vault` example response

```json
{
  "rules": {
    "agent_enabled": true,
    "large_amount_usd": 1000000,
    "approvals_required_large": 2,
    "approvals_required_small": 1,
    "payee_timelock_secs": 60
  },
  "payees": [
    { "counterparty_id": "pbx", "label": "Prime Broker X", "wallet": "43utK3Q6iqC9MxkrvL9RRwd7v2F9ApxoqTi98iztEa2e", "per_tx_limit_usd": 5000000, "active_after": 1791677167 },
    { "counterparty_id": "aby", "label": "Agent Bank Y", "wallet": "BrDqpW74UceVDvwxQTxdAgxrii8rkyEWvoVGzTKaR3YU", "per_tx_limit_usd": 5000000, "active_after": 1791677172 }
  ],
  "balances": { "vault_usd": 10000000 },
  "spent_today_usd": 0
}
```

- `wallet` is the full base58 address.
- `payees` are in registry order, then any payee not in the registry. `counterparty_id` is `null` only for an on-chain payee that isn't in `registry.json` (e.g. the phishing wallet in Story 3); use `label` for its name.
- `active_after` is a unix timestamp in **seconds**. A payee is under its timelock while `active_after * 1000 > Date.now()`.
- No daily cap: it was cut and is not enforced, so it isn't reported. `spent_today_usd` is always `0` for now.

### `GET /requests/:id` example response

```json
{
  "id": "req_margin_1", "type": "margin_call", "counterparty_id": "pbx",
  "amount_requested_usd": 2400000, "quotes": ["Bond A haircut 15%"],
  "verification": {
    "status": "partial", "verified_usd": 1900000, "disputed_usd": 500000,
    "lines": [
      { "instrument_id": "BOND_A", "market_value": 10000000, "haircut_claimed": 0.15, "haircut_agreed": 0.10, "clause": "4.2", "ok": false },
      { "instrument_id": "LOAN_B", "market_value": 6000000, "haircut_claimed": 0.15, "haircut_agreed": 0.15, "clause": "4.3", "ok": true }
    ]
  },
  "evidence_hash": "9f2c...",
  "proposal": { "id": "prop_1", "approvals": 1, "required": 2, "executed": false, "tx": null }
}
```

- `type` is one of the parser's `request_type` values (section 6).
- `verification.status` is one of: `"verified"`, `"partial"`, `"rejected"`.
- `proposal` is `null` until a proposal exists. `proposal.tx` is `null` until executed.

## 5. Function boundaries

### engine → server

```ts
verifyMarginCall(parsed, positions, agreement): Verification
verifyLoanDraw(parsed, creditAgreement): Verification
evidenceHash(bundle): string   // 64 hex characters (sha256)
```

### chain → server

```ts
proposePayment({ counterpartyId, amountUsd, kind, evidenceHash }): { tx, proposalId }
approve(proposalId, approverName): { tx }
execute(proposalId): { tx }
setAgentEnabled(enabled): { tx }          // enabled = agent enabled; false = kill switch ON
proposePaymentToWallet({ wallet, amountUsd, kind, evidenceHash }): { tx, proposalId }   // Story 3 compromised agent only
getVaultState(): VaultState               // GET /vault
addPayeeForWallet({ wallet, label }): { tx, activeAfter }   // Story 3 phished approver; tx null if already a payee
getProposalEvidenceHash(proposalId): string                  // 64 hex characters, read from the proposal account
```

Chain functions are async (they return Promises of the shapes above). `amountUsd` is whole USD; `chain/` converts to 6 decimals.
`kind` is `"margin_call" | "loan_draw" | "other"`, which `chain/` maps to the program's `u8` (0, 1, 2).
`evidenceHash` is the 64-hex-character string from `evidenceHash()`; `chain/` turns it into the 32 bytes the program stores.

## 6. Parser output schema

Copied exactly from `docs/BUILD_PLAN.md` section 7.1:

```json
{
  "request_type": "margin_call | loan_draw | payment_instruction_change | other",
  "counterparty_name": "string",
  "amount_requested_usd": "number",
  "due": "ISO datetime or null",
  "referenced_items": [{ "instrument_id": "string", "haircut_claimed": "number or null" }],
  "mentions_new_payment_details": "boolean",
  "suspicious_instructions_detected": "boolean",
  "quotes": ["exact sentences from the email supporting each field"]
}
```

- **No wallet/address field.** Never. The payee wallet always comes from `fixtures/registry.json` by counterparty ID.
- Every string in `quotes` must appear word-for-word in the email; drop any that don't.
