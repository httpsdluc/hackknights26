import { describe, expect, it } from "vitest";
import credit from "../../fixtures/credit_agreement.json" with { type: "json" };
import { verifyLoanDraw } from "./loan.ts";
import { loanParsed } from "./testdata.ts";

const failed = (v: ReturnType<typeof verifyLoanDraw>) => v.lines.filter((l) => !l.ok).map((l) => [l.instrument_id, l.clause]);

describe("verifyLoanDraw", () => {
  it("demo: 5,000,000 draw is rejected, remaining 3,000,000, clause 2.1", () => {
    const v = verifyLoanDraw(loanParsed, credit);
    expect(v.status).toBe("rejected");
    expect(v.verified_usd).toBe(0);
    expect(v.disputed_usd).toBe(5_000_000);
    expect(v.lines.find((l) => l.instrument_id === "FACILITY_Y:REMAINING_COMMITMENT")?.market_value).toBe(3_000_000);
    expect(failed(v)).toEqual([["FACILITY_Y:REMAINING_COMMITMENT", "2.1"]]);
  });

  it("a draw within all limits is verified", () => {
    const v = verifyLoanDraw({ ...loanParsed, amount_requested_usd: 3_000_000 }, credit);
    expect(v).toMatchObject({ status: "verified", verified_usd: 3_000_000, disputed_usd: 0 });
    expect(failed(v)).toEqual([]);
  });

  it("rejects below min draw (clause 2.2)", () => {
    const v = verifyLoanDraw({ ...loanParsed, amount_requested_usd: 499_999 }, credit);
    expect(v.status).toBe("rejected");
    expect(failed(v)).toEqual([["FACILITY_Y:MIN_DRAW", "2.2"]]);
  });

  it("rejects on event of default (clause 7.1)", () => {
    const v = verifyLoanDraw({ ...loanParsed, amount_requested_usd: 1_000_000 }, { ...credit, event_of_default: true });
    expect(v.status).toBe("rejected");
    expect(failed(v)).toEqual([["FACILITY_Y:NO_EVENT_OF_DEFAULT", "7.1"]]);
  });
});
