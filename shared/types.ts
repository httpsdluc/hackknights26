// Shared types. Mirrors CONTRACT.md exactly. FROZEN: change only with team agreement,
// in the same commit as CONTRACT.md.
//
// Import with a type-only import and the .ts extension, e.g.
//   import type { Request } from "../../shared/types.ts";
//
// Money is whole US dollars everywhere except inside chain/ (6 decimals there).

// ---- Chain error codes (CONTRACT.md §3) ----

export const ERROR_CODES = [
  "AgentCannotApprove",
  "Unauthorized",
  "AgentDisabled",
  "PayeeNotAllowed",
  "PayeeTimelocked",
  "OverPerTxLimit",
  "AlreadyApproved",
  "NotEnoughApprovals",
  "DailyCapExceeded",
  "AlreadyExecuted",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ---- Parser output (CONTRACT.md §6, BUILD_PLAN.md §7.1). No wallet/address field, ever. ----

export type RequestType =
  | "margin_call"
  | "loan_draw"
  | "payment_instruction_change"
  | "other";

export interface ReferencedItem {
  instrument_id: string;
  haircut_claimed: number | null;
}

export interface ParsedRequest {
  request_type: RequestType;
  counterparty_name: string;
  amount_requested_usd: number;
  /** ISO datetime or null */
  due: string | null;
  referenced_items: ReferencedItem[];
  mentions_new_payment_details: boolean;
  suspicious_instructions_detected: boolean;
  /** Exact sentences from the email supporting each field */
  quotes: string[];
}

// ---- Verification (CONTRACT.md §4) ----

export type VerificationStatus = "verified" | "partial" | "rejected";

export interface VerificationLine {
  instrument_id: string;
  market_value: number;
  haircut_claimed: number;
  haircut_agreed: number;
  clause: string;
  ok: boolean;
}

export interface Verification {
  status: VerificationStatus;
  verified_usd: number;
  disputed_usd: number;
  lines: VerificationLine[];
}

// ---- API shapes (CONTRACT.md §4) ----

export interface Proposal {
  id: string;
  approvals: number;
  required: number;
  executed: boolean;
  /** null until executed */
  tx: string | null;
}

/** GET /requests/:id */
export interface Request {
  id: string;
  type: RequestType;
  counterparty_id: string;
  amount_requested_usd: number;
  quotes: string[];
  verification: Verification;
  /** 64 hex characters */
  evidence_hash: string;
  /** null until a proposal exists */
  proposal: Proposal | null;
}

/** Propose, approve, execute and kill-switch. Always HTTP 200. */
export type ProposeResult =
  | { ok: true; tx: string; proposal_id: string }
  | { ok: false; error_code: ErrorCode };

export interface ApproveBody {
  approver: string;
}

export interface KillSwitchBody {
  enabled: boolean;
}

export interface CompromisedAgentBody {
  requestId: string;
}

// ---- chain → server boundary (CONTRACT.md §5) ----

/** Maps to the program's u8 kind: margin_call = 0, loan_draw = 1, other = 2 */
export type PaymentKind = "margin_call" | "loan_draw" | "other";

export interface ProposePaymentArgs {
  counterpartyId: string;
  /** whole USD; chain/ converts to 6 decimals */
  amountUsd: number;
  kind: PaymentKind;
  /** 64 hex characters */
  evidenceHash: string;
}

export interface ChainClient {
  proposePayment(args: ProposePaymentArgs): Promise<{ tx: string; proposalId: string }>;
  approve(proposalId: string, approverName: string): Promise<{ tx: string }>;
  execute(proposalId: string): Promise<{ tx: string }>;
  setAgentEnabled(enabled: boolean): Promise<{ tx: string }>;
}
