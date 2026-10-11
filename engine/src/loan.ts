// Loan draw verification (BUILD_PLAN §7.2). Pure: no I/O.
// Verification lines are margin-shaped; for a draw each line is one check:
// instrument_id = "<facility>:<CHECK>", market_value = the limit checked against, haircuts = 0.
// notice_days is deliberately not checked: the parsed request has no sent-at date to measure from.
import type { ParsedRequest, Verification, VerificationLine } from "../../shared/types.ts";
import { wholeUsd } from "./money.ts";

export interface CreditAgreement {
  facility_id: string;
  commitment_total: number;
  drawn_to_date: number;
  min_draw: number;
  event_of_default: boolean;
  clauses: { availability: string; min_draw: string; default: string };
}

const check = (facility: string, name: string, limit: number, clause: string, ok: boolean): VerificationLine => ({
  instrument_id: `${facility}:${name}`,
  market_value: limit,
  haircut_claimed: 0,
  haircut_agreed: 0,
  clause,
  ok,
});

export function verifyLoanDraw(parsed: ParsedRequest, credit: CreditAgreement): Verification {
  const amount = wholeUsd(parsed.amount_requested_usd, "amount_requested_usd");
  const commitment = wholeUsd(credit.commitment_total, "commitment_total");
  const drawn = wholeUsd(credit.drawn_to_date, "drawn_to_date");
  const minDraw = wholeUsd(credit.min_draw, "min_draw");
  const remaining = Math.max(0, commitment - drawn);
  const f = credit.facility_id;

  const lines = [
    check(f, "REMAINING_COMMITMENT", remaining, credit.clauses.availability, amount <= remaining),
    check(f, "NO_EVENT_OF_DEFAULT", 0, credit.clauses.default, credit.event_of_default === false),
    check(f, "MIN_DRAW", minDraw, credit.clauses.min_draw, amount >= minDraw),
  ];

  const pass = lines.every((l) => l.ok);
  return { status: pass ? "verified" : "rejected", verified_usd: pass ? amount : 0, disputed_usd: pass ? 0 : amount, lines };
}
