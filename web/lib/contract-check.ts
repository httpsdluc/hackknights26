// Runtime check that a response has the shape CONTRACT.md §4 promises. A mismatch is reported
// by field name instead of being papered over, so the owning teammate can be told exactly what differs.
import type {
  AddPayeeResult,
  EvidenceCheck,
  ProposeResult,
  Request as CosignRequest,
  RequestType,
  VaultState,
  VerificationStatus,
} from "../../shared/types.ts";

export class ContractError extends Error {
  constructor(path: string, expected: string) {
    super(`${path} should be ${expected}`);
    this.name = "ContractError";
  }
}

const REQUEST_TYPES = ["margin_call", "loan_draw", "payment_instruction_change", "other"] as const satisfies readonly RequestType[];
const STATUSES = ["verified", "partial", "rejected"] as const satisfies readonly VerificationStatus[];

type Obj = Record<string, unknown>;

function obj(v: unknown, path: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new ContractError(path, "an object");
  return v as Obj;
}
function str(o: Obj, key: string, path: string) {
  if (typeof o[key] !== "string") throw new ContractError(`${path}.${key}`, "a string");
}
function num(o: Obj, key: string, path: string) {
  if (typeof o[key] !== "number" || !Number.isFinite(o[key])) throw new ContractError(`${path}.${key}`, "a number");
}
function bool(o: Obj, key: string, path: string) {
  if (typeof o[key] !== "boolean") throw new ContractError(`${path}.${key}`, "true or false");
}
function oneOf(o: Obj, key: string, allowed: readonly string[], path: string) {
  if (!allowed.includes(o[key] as string)) throw new ContractError(`${path}.${key}`, `one of ${allowed.join(", ")}`);
}
function list(o: Obj, key: string, path: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new ContractError(`${path}.${key}`, "a list");
  return v;
}

export function checkRequest(v: unknown, path = "Request"): CosignRequest {
  const r = obj(v, path);
  str(r, "id", path);
  oneOf(r, "type", REQUEST_TYPES, path);
  str(r, "counterparty_id", path);
  num(r, "amount_requested_usd", path);
  list(r, "quotes", path).forEach((q, i) => {
    if (typeof q !== "string") throw new ContractError(`${path}.quotes[${i}]`, "a string");
  });
  str(r, "evidence_hash", path);

  const vPath = `${path}.verification`;
  const ver = obj(r.verification, vPath);
  oneOf(ver, "status", STATUSES, vPath);
  num(ver, "verified_usd", vPath);
  num(ver, "disputed_usd", vPath);
  list(ver, "lines", vPath).forEach((line, i) => {
    const lPath = `${vPath}.lines[${i}]`;
    const l = obj(line, lPath);
    str(l, "instrument_id", lPath);
    num(l, "market_value", lPath);
    num(l, "haircut_claimed", lPath);
    num(l, "haircut_agreed", lPath);
    str(l, "clause", lPath);
    bool(l, "ok", lPath);
  });

  if (r.proposal !== null) {
    const pPath = `${path}.proposal`;
    const p = obj(r.proposal, pPath);
    str(p, "id", pPath);
    num(p, "approvals", pPath);
    num(p, "required", pPath);
    bool(p, "executed", pPath);
    if (p.tx !== null && typeof p.tx !== "string") throw new ContractError(`${pPath}.tx`, "a string or null");
  }
  return v as CosignRequest;
}

export function checkRequestList(v: unknown): CosignRequest[] {
  if (!Array.isArray(v)) throw new ContractError("GET /requests", "a list");
  return v.map((r, i) => checkRequest(r, `Request[${i}]`));
}

export function checkProposeResult(v: unknown): ProposeResult {
  const path = "ProposeResult";
  const r = obj(v, path);
  bool(r, "ok", path);
  if (r.ok) {
    str(r, "tx", path);
    str(r, "proposal_id", path);
  } else {
    // Any string is accepted here: codes outside CONTRACT.md §3 are shown raw.
    str(r, "error_code", path);
  }
  return v as ProposeResult;
}

export function checkVaultState(v: unknown): VaultState {
  const path = "VaultState";
  const s = obj(v, path);

  const rPath = `${path}.rules`;
  const rules = obj(s.rules, rPath);
  bool(rules, "agent_enabled", rPath);
  num(rules, "large_amount_usd", rPath);
  num(rules, "approvals_required_large", rPath);
  num(rules, "approvals_required_small", rPath);
  num(rules, "payee_timelock_secs", rPath);

  list(s, "payees", path).forEach((payee, i) => {
    const pPath = `${path}.payees[${i}]`;
    const p = obj(payee, pPath);
    if (p.counterparty_id !== null && typeof p.counterparty_id !== "string") {
      throw new ContractError(`${pPath}.counterparty_id`, "a string or null");
    }
    str(p, "label", pPath);
    if (p.wallet !== null && typeof p.wallet !== "string") throw new ContractError(`${pPath}.wallet`, "a string or null");
    num(p, "per_tx_limit_usd", pPath);
    num(p, "active_after", pPath);
  });

  num(obj(s.balances, `${path}.balances`), "vault_usd", `${path}.balances`);
  num(s, "spent_today_usd", path);
  return v as VaultState;
}

export function checkAddPayeeResult(v: unknown): AddPayeeResult {
  const path = "AddPayeeResult";
  const r = obj(v, path);
  bool(r, "ok", path);
  if (r.ok) {
    if (r.tx !== null && typeof r.tx !== "string") throw new ContractError(`${path}.tx`, "a string or null");
    num(r, "active_after", path);
  } else {
    str(r, "error_code", path);
  }
  return v as AddPayeeResult;
}

export function checkEvidenceCheck(v: unknown): EvidenceCheck {
  const path = "EvidenceCheck";
  const r = obj(v, path);
  str(r, "recomputed_hash", path);
  str(r, "stored_hash", path);
  if (r.on_chain_hash !== null && typeof r.on_chain_hash !== "string") {
    throw new ContractError(`${path}.on_chain_hash`, "a string or null");
  }
  bool(r, "match", path);
  return v as EvidenceCheck;
}
