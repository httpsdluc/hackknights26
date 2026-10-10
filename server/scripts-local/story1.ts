// Story 1 end to end without HTTP: parse → verify → evidence hash → proposePayment.
// Usage: USE_CACHED_LLM=true node --env-file-if-exists=../.env scripts-local/story1.ts
import { DEPS_SUMMARY } from "../src/deps.ts";
import { getRequest, proposeForRequest } from "../src/agent.ts";

console.log("deps:", DEPS_SUMMARY);
const r = await getRequest("req_margin_1");
if ("ok" in r) throw new Error(`analysis failed: ${r.error} ${r.detail}`);
const v = r.verification;
console.log(`requested ${r.amount_requested_usd}  verified ${v.verified_usd}  disputed ${v.disputed_usd}  (${v.status})`);
for (const l of v.lines) console.log(`  ${l.instrument_id}: claimed ${l.haircut_claimed} agreed ${l.haircut_agreed} clause ${l.clause} ${l.ok ? "OK" : "DIFF"}`);
console.log("evidence_hash", r.evidence_hash);

const res = await proposeForRequest("req_margin_1");
if (!res.ok) throw new Error(`propose failed: ${res.error_code}`);
console.log(`proposed ${v.verified_usd} → proposal ${res.proposal_id}`);
console.log("tx", res.tx);

// Guardrails: these two must NOT propose.
for (const id of ["req_loan_1", "req_phish_1"]) console.log(id, "→", JSON.stringify(await proposeForRequest(id)));
