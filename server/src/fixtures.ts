// Loads fixtures from the repo's fixtures/ (owner: D). Any file that doesn't exist there yet
// falls back to the placeholder in server/stubs/fixtures/.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.resolve(here, "../../fixtures");
const STUB = path.resolve(here, "../stubs/fixtures");

export function fixturePath(rel: string): string {
  const real = path.join(REAL, rel);
  return existsSync(real) ? real : path.join(STUB, rel);
}

export function readFixtureText(rel: string): string {
  return readFileSync(fixturePath(rel), "utf8");
}

export function readFixtureJson<T = any>(rel: string): T {
  return JSON.parse(readFixtureText(rel)) as T;
}

/** Inbox: request ID → email file under fixtures/emails/. Edit here if D names files differently. */
export const REQUEST_EMAILS: Record<string, string> = {
  req_margin_1: "emails/margin_call.txt",
  req_loan_1: "emails/loan_draw.txt",
  req_phish_1: "emails/phishing.txt",
};

export interface Counterparty {
  id: string;
  name: string;
  aliases?: string[];
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Exact (case/whitespace-insensitive) match on name or alias. No fuzzy matching. */
export function lookupCounterparty(name: string): Counterparty | null {
  const reg = readFixtureJson<{ counterparties: Counterparty[] }>("registry.json");
  const n = norm(name);
  return reg.counterparties.find((c) => norm(c.name) === n || (c.aliases ?? []).some((a) => norm(a) === n)) ?? null;
}
