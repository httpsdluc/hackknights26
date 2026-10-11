import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, evidenceHash } from "./evidence.ts";

describe("evidenceHash", () => {
  const a = { request: { b: 1, a: [{ y: 2, x: 1 }] }, engine_version: "1", result: { verified_usd: 1_900_000 } };
  const b = { result: { verified_usd: 1_900_000 }, engine_version: "1", request: { a: [{ x: 1, y: 2 }], b: 1 } };

  it("same bundle with keys in a different order gives the same hash", () => {
    expect(evidenceHash(a)).toBe(evidenceHash(b));
  });

  it("is 64 lowercase hex characters: sha256 of the canonical JSON", () => {
    expect(canonicalJson(a)).toBe('{"engine_version":"1","request":{"a":[{"x":1,"y":2}],"b":1},"result":{"verified_usd":1900000}}');
    expect(evidenceHash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(evidenceHash(a)).toBe(createHash("sha256").update(canonicalJson(a)).digest("hex"));
  });

  it("changes when any value changes, and array order matters", () => {
    expect(evidenceHash({ ...a, result: { verified_usd: 1_900_001 } })).not.toBe(evidenceHash(a));
    expect(evidenceHash([1, 2])).not.toBe(evidenceHash([2, 1]));
  });
});
