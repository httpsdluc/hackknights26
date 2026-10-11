// Margin call verification (BUILD_PLAN §7.2). Pure: no I/O.
import type { ParsedRequest, Verification, VerificationLine } from "../../shared/types.ts";
import { ceilDiv, sumHaircutUsd, toBps, wholeUsd } from "./money.ts";

export interface Positions {
  positions: { instrument_id: string; asset_class: string; market_value: number }[];
}

export interface MarginAgreement {
  haircuts: Record<string, { haircut: number; clause: string }>;
  minimum_transfer_amount: number;
  posted_collateral_usd: number;
}

export function verifyMarginCall(parsed: ParsedRequest, positions: Positions, agreement: MarginAgreement): Verification {
  const requested = wholeUsd(parsed.amount_requested_usd, "amount_requested_usd");
  const posted = wholeUsd(agreement.posted_collateral_usd, "posted_collateral_usd");
  const mta = wholeUsd(agreement.minimum_transfer_amount, "minimum_transfer_amount");
  if (mta === 0) throw new Error("minimum_transfer_amount must be positive");

  const claimed = new Map(parsed.referenced_items.map((i) => [i.instrument_id, i.haircut_claimed]));
  const lines: VerificationLine[] = [];
  const terms: { value: number; bps: number }[] = [];

  for (const p of positions.positions) {
    const rule = agreement.haircuts[p.asset_class];
    if (!rule) throw new Error(`no agreed haircut for asset class ${p.asset_class}`);
    const value = wholeUsd(p.market_value, `market_value of ${p.instrument_id}`);
    const agreedBps = toBps(rule.haircut, `haircut for ${p.asset_class}`);
    terms.push({ value, bps: agreedBps });

    // An instrument the email doesn't mention isn't disputed: show the agreed haircut as claimed.
    const haircutClaimed = claimed.get(p.instrument_id) ?? rule.haircut;
    lines.push({
      instrument_id: p.instrument_id,
      market_value: value,
      haircut_claimed: haircutClaimed,
      haircut_agreed: rule.haircut,
      clause: rule.clause,
      ok: toBps(haircutClaimed, `claimed haircut for ${p.instrument_id}`) === agreedBps,
    });
  }

  const required = sumHaircutUsd(terms);
  const call = ceilDiv(Math.max(0, required - posted), mta) * mta;
  const disputed = requested - call;

  const status = call === 0 ? "rejected" : disputed === 0 ? "verified" : "partial";
  return { status, verified_usd: call, disputed_usd: disputed, lines };
}
