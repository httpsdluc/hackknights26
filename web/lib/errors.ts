import type { ErrorCode } from "../../shared/types.ts";

// One plain sentence per chain error code (CONTRACT.md §3).
const SENTENCES: Record<ErrorCode, string> = {
  AgentCannotApprove: "The agent's key can never be an approver.",
  Unauthorized: "This signer isn't allowed to do that.",
  AgentDisabled: "The agent has been switched off and can't propose payments.",
  PayeeNotAllowed: "This wallet is not on the approved payee list.",
  PayeeTimelocked: "This payee was added recently and can't be paid until its waiting period ends.",
  OverPerTxLimit: "This amount is above the payee's per-payment limit.",
  AlreadyApproved: "This signer has already approved.",
  NotEnoughApprovals: "This payment needs more approvals before it can be released.",
  DailyCapExceeded: "This payment would go over today's limit.",
  AlreadyExecuted: "This payment has already been released.",
};

/** Sentence for a code, or null for a code CONTRACT.md doesn't list (show the raw code alone). */
export function errorSentence(code: string): string | null {
  return Object.hasOwn(SENTENCES, code) ? SENTENCES[code as ErrorCode] : null;
}
