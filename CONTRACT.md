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
| GET | `/vault` | | rules, payees, balances, today's spend |

### Action results

Propose, approve, execute and kill-switch **always return HTTP 200** with one of:

```json
{ "ok": true, "tx": "...", "proposal_id": "..." }
```
```json
{ "ok": false, "error_code": "<code>" }
```

`error_code` is one of the codes in section 3.

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
setAgentEnabled(enabled): { tx }
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
