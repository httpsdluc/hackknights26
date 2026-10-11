import type { RequestType } from "../../shared/types.ts";

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  margin_call: "Margin call",
  loan_draw: "Loan draw",
  payment_instruction_change: "Payment details change",
  other: "Other",
};

// Display names for fixtures/registry.json. The API only sends counterparty_id; the vault's
// on-chain payee labels match these.
const COUNTERPARTY_LABEL: Record<string, string> = {
  pbx: "Prime Broker X",
  aby: "Agent Bank Y",
};

export function counterpartyLabel(id: string): string {
  return COUNTERPARTY_LABEL[id] ?? id;
}

// Loan draw checks arrive as VerificationLines whose instrument_id is "<facility>:<CHECK>".
const LOAN_CHECK_LABEL: Record<string, string> = {
  REMAINING_COMMITMENT: "Remaining commitment",
  MIN_DRAW: "Minimum draw",
  NO_EVENT_OF_DEFAULT: "No event of default",
  NO_DEFAULT: "No event of default",
};

export function loanCheckLabel(instrumentId: string): string {
  const check = instrumentId.split(":").pop() ?? instrumentId;
  return LOAN_CHECK_LABEL[check] ?? instrumentId;
}

// Values sent as `approver` to POST /proposals/:id/approve. CONTRACT.md doesn't list the
// allowed strings; these match the names the server's chain stub accepts.
export const DEMO_SIGNERS = [
  { value: "approver1", label: "Demo signer 1" },
  { value: "approver2", label: "Demo signer 2" },
] as const;

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=devnet`;
}
