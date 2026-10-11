// Evidence hash (BUILD_PLAN §7.3): canonical JSON (keys sorted recursively) → sha256 → 64 hex chars.
import { createHash } from "node:crypto";

/** JSON.stringify with object keys sorted at every depth. Same omission rules as JSON.stringify. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const s = JSON.stringify(value);
    if (s === undefined) throw new Error(`cannot hash a top-level ${typeof value}`);
    return s;
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined || typeof v === "function" ? "null" : canonicalJson(v))).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k];
    if (v === undefined || typeof v === "function") continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJson(v)}`);
  }
  return `{${parts.join(",")}}`;
}

export function evidenceHash(bundle: unknown): string {
  return createHash("sha256").update(canonicalJson(bundle), "utf8").digest("hex");
}
