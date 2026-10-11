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

/** Not a chain error: the server's agent declined to propose (CONTRACT.md §3). */
export const AGENT_REFUSED = "AgentRefused" as const;

/** Any `error_code` an action result can carry. */
export type ResultErrorCode = ErrorCode | typeof AGENT_REFUSED;

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
  | { ok: false; error_code: ResultErrorCode };

/** POST /attack/add-phishing-payee. Always HTTP 200. */
export type AddPayeeResult =
  | {
      ok: true;
      /** null if the wallet was already a payee (nothing sent) */
      tx: string | null;
      /** unix timestamp in SECONDS; the payee can receive payments from then on */
      active_after: number;
    }
  | { ok: false; error_code: ResultErrorCode };

/** GET /requests/:id/evidence */
export interface EvidenceCheck {
  /** recomputed now from the source email, fixture files and engine */
  recomputed_hash: string;
  /** the hash on the request (GET /requests/:id evidence_hash) */
  stored_hash: string;
  /** read from the proposal account on Solana; null until a proposal exists */
  on_chain_hash: string | null;
  /** recomputed === stored, and === on_chain when there is one */
  match: boolean;
}

export interface ApproveBody {
  approver: string;
}

export interface KillSwitchBody {
  /** AGENT enabled, not kill switch enabled: false stops the agent (kill switch ON). Same as rules.agent_enabled. */
  enabled: boolean;
}

export interface CompromisedAgentBody {
  requestId: string;
}

export interface VaultPayee {
  /** null only for an on-chain payee that isn't in registry.json (e.g. the phishing wallet in Story 3) */
  counterparty_id: string | null;
  label: string;
  /** full base58 address */
  wallet: string | null;
  per_tx_limit_usd: number;
  /** unix timestamp in SECONDS; the payee can receive payments from then on */
  active_after: number;
}

/** GET /vault. All money in whole USD. */
export interface VaultState {
  rules: {
    agent_enabled: boolean;
    large_amount_usd: number;
    approvals_required_large: number;
    approvals_required_small: number;
    payee_timelock_secs: number;
  };
  /** registry order (pbx, aby), then any payee not in the registry */
  payees: VaultPayee[];
  balances: { vault_usd: number };
  /** always 0 for now: the daily cap is cut */
  spent_today_usd: number;
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

/** Story 3 "compromised agent": propose straight to a wallet, skipping the registry. */
export interface ProposePaymentToWalletArgs {
  /** base58 wallet address */
  wallet: string;
  /** whole USD */
  amountUsd: number;
  kind: PaymentKind;
  /** 64 hex characters */
  evidenceHash: string;
}

export interface ChainClient {
  proposePayment(args: ProposePaymentArgs): Promise<{ tx: string; proposalId: string }>;
  approve(proposalId: string, approverName: string): Promise<{ tx: string }>;
  execute(proposalId: string): Promise<{ tx: string }>;
  /** true = agent enabled; false = agent stopped (kill switch ON) */
  setAgentEnabled(enabled: boolean): Promise<{ tx: string }>;
  proposePaymentToWallet(args: ProposePaymentToWalletArgs): Promise<{ tx: string; proposalId: string }>;
  getVaultState(): Promise<VaultState>;
  /** Story 3: a (phished) approver adds a wallet as a payee; the program starts its timelock. tx null if already a payee. */
  addPayeeForWallet(args: { wallet: string; label: string }): Promise<{ tx: string | null; activeAfter: number }>;
  /** The evidence hash stored in a proposal account, as 64 hex characters. */
  getProposalEvidenceHash(proposalId: string): Promise<string>;
}
