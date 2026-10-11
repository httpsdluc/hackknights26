// Parser outputs for the fixture emails, used by the tests only.
import type { ParsedRequest } from "../../shared/types.ts";

/** fixtures/emails/margin_call.txt */
export const marginParsed: ParsedRequest = {
  request_type: "margin_call",
  counterparty_name: "Prime Broker X",
  amount_requested_usd: 2_400_000,
  due: "2026-10-10T21:00:00Z",
  referenced_items: [
    { instrument_id: "BOND_A", haircut_claimed: 0.15 },
    { instrument_id: "LOAN_B", haircut_claimed: 0.15 },
  ],
  mentions_new_payment_details: false,
  suspicious_instructions_detected: false,
  quotes: ["Prime Broker X hereby issues a margin call in the amount of $2,400,000.", "Following our periodic review, Bond A haircut 15% now applies."],
};

/** fixtures/emails/loan_draw.txt */
export const loanParsed: ParsedRequest = {
  request_type: "loan_draw",
  counterparty_name: "Agent Bank Y",
  amount_requested_usd: 5_000_000,
  due: "2026-10-13T00:00:00Z",
  referenced_items: [],
  mentions_new_payment_details: false,
  suspicious_instructions_detected: false,
  quotes: ["We request a draw of $5,000,000 under your commitment."],
};
