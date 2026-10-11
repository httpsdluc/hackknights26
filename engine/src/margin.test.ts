import { describe, expect, it } from "vitest";
import positions from "../../fixtures/positions.json" with { type: "json" };
import agreement from "../../fixtures/margin_agreement.json" with { type: "json" };
import { verifyMarginCall } from "./margin.ts";
import { marginParsed } from "./testdata.ts";

describe("verifyMarginCall", () => {
  it("demo: 10M × 10% + 6M × 15% = 1.9M verified, 0.5M disputed, Bond A flagged", () => {
    const v = verifyMarginCall(marginParsed, positions, agreement);
    expect(v).toEqual({
      status: "partial",
      verified_usd: 1_900_000,
      disputed_usd: 500_000,
      lines: [
        { instrument_id: "BOND_A", market_value: 10_000_000, haircut_claimed: 0.15, haircut_agreed: 0.1, clause: "4.2", ok: false },
        { instrument_id: "LOAN_B", market_value: 6_000_000, haircut_claimed: 0.15, haircut_agreed: 0.15, clause: "4.3", ok: true },
      ],
    });
  });

  it("rounds the call up to the minimum transfer amount and subtracts posted collateral", () => {
    const v = verifyMarginCall(
      { ...marginParsed, amount_requested_usd: 1_900_000 },
      positions,
      { ...agreement, posted_collateral_usd: 250_001 }, // 1,900,000 − 250,001 = 1,649,999 → 1,700,000
    );
    expect(v.verified_usd).toBe(1_700_000);
    expect(v.disputed_usd).toBe(200_000);
  });

  it("call is never negative", () => {
    const v = verifyMarginCall(marginParsed, positions, { ...agreement, posted_collateral_usd: 5_000_000 });
    expect(v.verified_usd).toBe(0);
    expect(v.status).toBe("rejected");
  });
});
