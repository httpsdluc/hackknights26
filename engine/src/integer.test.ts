// Every USD number the engine returns must be a whole-dollar integer.
import { describe, expect, it } from "vitest";
import type { Verification } from "../../shared/types.ts";
import positions from "../../fixtures/positions.json" with { type: "json" };
import margin from "../../fixtures/margin_agreement.json" with { type: "json" };
import credit from "../../fixtures/credit_agreement.json" with { type: "json" };
import { verifyMarginCall } from "./margin.ts";
import { verifyLoanDraw } from "./loan.ts";
import { marginParsed, loanParsed } from "./testdata.ts";

function expectWholeUsd(v: Verification) {
  const usd = [v.verified_usd, v.disputed_usd, ...v.lines.map((l) => l.market_value)];
  for (const n of usd) expect(Number.isSafeInteger(n), `${n} is not a whole-dollar integer`).toBe(true);
}

// Inputs where float math drifts (e.g. 0.07 × 1,234,567 = 86419.69000000001).
const awkward = {
  positions: [
    { instrument_id: "X", asset_class: "hy_bond", market_value: 1_234_567 },
    { instrument_id: "Y", asset_class: "senior_loan", market_value: 3_333_333 },
  ],
};
const awkwardAgreement = {
  haircuts: { hy_bond: { haircut: 0.07, clause: "4.2" }, senior_loan: { haircut: 0.0333, clause: "4.3" } },
  minimum_transfer_amount: 1,
  posted_collateral_usd: 0,
};

describe("integer money", () => {
  it("demo results are integers", () => {
    expectWholeUsd(verifyMarginCall(marginParsed, positions, margin));
    expectWholeUsd(verifyLoanDraw(loanParsed, credit));
  });

  it("non-round haircuts round UP to the exact whole dollar", () => {
    // 1,234,567 × 700 + 3,333,333 × 333 = 864,196,900 + 1,109,999,889 = 1,974,196,789 → /10,000 = 197,419.6789 → 197,420
    const v = verifyMarginCall({ ...marginParsed, amount_requested_usd: 200_000, referenced_items: [] }, awkward, awkwardAgreement);
    expectWholeUsd(v);
    expect(v.verified_usd).toBe(197_420);
    expect(v.disputed_usd).toBe(2_580);
  });

  it("rejects non-integer dollar inputs and sub-basis-point haircuts", () => {
    expect(() => verifyMarginCall({ ...marginParsed, amount_requested_usd: 2_400_000.5 }, positions, margin)).toThrow();
    expect(() => verifyLoanDraw({ ...loanParsed, amount_requested_usd: 1e6 + 0.01 }, credit)).toThrow();
    expect(() =>
      verifyMarginCall(marginParsed, positions, { ...margin, haircuts: { ...margin.haircuts, hy_bond: { haircut: 0.12345, clause: "4.2" } } }),
    ).toThrow();
  });
});
