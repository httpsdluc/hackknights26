// STUB of engine/ (owner: D) with the CONTRACT.md §5 signatures. Used only while
// engine/src/index.ts doesn't export these yet. Logic follows BUILD_PLAN §7.2 / §7.3.
import { createHash } from "node:crypto";
import type { ParsedRequest, Verification, VerificationLine } from "../../shared/types.ts";

export const ENGINE_VERSION = "server-stub-0.1";

const statusOf = (verified: number, disputed: number): Verification["status"] =>
  verified <= 0 ? "rejected" : disputed === 0 ? "verified" : "partial";

export function verifyMarginCall(parsed: ParsedRequest, positions: any, agreement: any): Verification {
  const claimed = new Map(parsed.referenced_items.map((i) => [i.instrument_id, i.haircut_claimed]));
  const lines: VerificationLine[] = [];
  let required = 0;
  for (const p of positions.positions as any[]) {
    const rule = agreement.haircuts[p.asset_class];
    if (!rule) throw new Error(`no haircut for asset class ${p.asset_class}`);
    required += p.market_value * rule.haircut;
    const c = claimed.get(p.instrument_id);
    const haircut_claimed = c ?? rule.haircut;
    lines.push({
      instrument_id: p.instrument_id,
      market_value: p.market_value,
      haircut_claimed,
      haircut_agreed: rule.haircut,
      clause: rule.clause,
      ok: Math.abs(haircut_claimed - rule.haircut) < 1e-9,
    });
  }
  let call = Math.max(0, Math.round(required) - (positions.posted_collateral_usd ?? 0));
  const mta = agreement.minimum_transfer_amount ?? 1;
  call = Math.ceil(call / mta) * mta;
  const verified = Math.min(call, parsed.amount_requested_usd);
  const disputed = parsed.amount_requested_usd - verified;
  return { status: statusOf(verified, disputed), verified_usd: verified, disputed_usd: disputed, lines };
}

export function verifyLoanDraw(parsed: ParsedRequest, credit: any): Verification {
  const amount = parsed.amount_requested_usd;
  const remaining = credit.commitment_total - credit.drawn_to_date;
  const c = credit.clauses ?? {};
  // VerificationLine is margin-shaped; for a draw we reuse it: market_value = the limit being checked.
  const checks: VerificationLine[] = [
    { instrument_id: `${credit.facility_id}:REMAINING_COMMITMENT`, market_value: remaining, haircut_claimed: 0, haircut_agreed: 0, clause: c.availability ?? "", ok: amount <= remaining },
    { instrument_id: `${credit.facility_id}:MIN_DRAW`, market_value: credit.min_draw, haircut_claimed: 0, haircut_agreed: 0, clause: c.min_draw ?? "", ok: amount >= credit.min_draw },
    { instrument_id: `${credit.facility_id}:NO_DEFAULT`, market_value: 0, haircut_claimed: 0, haircut_agreed: 0, clause: c.default ?? "", ok: !credit.event_of_default },
  ];
  const pass = checks.every((l) => l.ok);
  return { status: pass ? "verified" : "rejected", verified_usd: pass ? amount : 0, disputed_usd: pass ? 0 : amount, lines: checks };
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function evidenceHash(bundle: unknown): string {
  return createHash("sha256").update(canonical(bundle)).digest("hex");
}
