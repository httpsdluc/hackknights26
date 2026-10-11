import type { RequestType } from "../../shared/types.ts";

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  margin_call: "Margin call",
  loan_draw: "Loan draw",
  payment_instruction_change: "Payment details change",
  other: "Other",
};

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
