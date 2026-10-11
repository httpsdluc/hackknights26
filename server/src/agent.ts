// Agent service: parse → verify (engine) → evidence hash → propose (chain).
// State is in memory only.
import { createHash } from "node:crypto";
import { AGENT_REFUSED, ERROR_CODES } from "../../shared/types.ts";
import type {
  AddPayeeResult, ErrorCode, EvidenceCheck, ParsedRequest, PaymentKind, ProposeResult, Proposal, Request, Verification,
} from "../../shared/types.ts";
import * as deps from "./deps.ts";
import { REQUEST_EMAILS, readFixtureJson, readFixtureText } from "./fixtures.ts";
import { parseEmail, type ParseResult } from "./parser.ts";

const LARGE_AMOUNT_USD = 1_000_000; // vault.large_amount (BUILD_PLAN §7.4): >= this needs 2 approvals

interface ProposalState extends Proposal {
  request_id: string;
  amount_usd: number;
  propose_tx: string;
}

const analyses = new Map<string, Promise<Analysis>>();
const proposals = new Map<string, ProposalState>();
const proposalByRequest = new Map<string, string>();

export type Analysis =
  | { ok: true; request: Omit<Request, "proposal">; parse: Extract<ParseResult, { ok: true }> }
  | { ok: false; id: string; error: string; detail: string };

/** Turns anything chain/ throws into a CONTRACT.md §3 code (Anchor errors, stub errors, plain messages). */
export function toErrorCode(err: unknown): ErrorCode | null {
  const e = err as any;
  const candidates = [e?.error_code, e?.code, e?.error?.errorCode?.code, e?.errorCode?.code, e?.message, String(e?.logs ?? "")];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const hit = ERROR_CODES.find((code) => c === code || c.includes(code));
    if (hit) return hit;
  }
  return null;
}

async function chainCall(fn: () => Promise<{ tx: string; proposalId?: string }>, proposalId: string): Promise<ProposeResult & { _raw?: { tx: string; proposalId?: string } }> {
  try {
    const r = await fn();
    return { ok: true, tx: r.tx, proposal_id: r.proposalId ?? proposalId, _raw: r };
  } catch (err) {
    const code = toErrorCode(err);
    if (!code) {
      // Unknown failure (RPC down etc). Log the message only; never the env or keys.
      console.error("chain call failed with no known error code:", (err as Error)?.message);
      throw err;
    }
    return { ok: false, error_code: code };
  }
}

const strip = ({ _raw, ...r }: ProposeResult & { _raw?: unknown }): ProposeResult => r as ProposeResult;

async function analyzeUncached(id: string): Promise<Analysis> {
  const emailFile = REQUEST_EMAILS[id];
  if (!emailFile) return { ok: false, id, error: "not_found", detail: id };

  const parse = await parseEmail(emailFile);
  if (!parse.ok) return { ok: false, id, error: parse.error, detail: parse.detail };
  const p = parse.parsed;
  const { verification, evidence_hash } = verifyAndHash(p, parse.email);

  return {
    ok: true,
    parse,
    request: {
      id,
      type: p.request_type,
      counterparty_id: parse.counterparty_id,
      amount_requested_usd: p.amount_requested_usd,
      quotes: p.quotes,
      verification,
      evidence_hash,
    },
  };
}

/**
 * Engine verification + evidence hash (BUILD_PLAN §7.3) for a parsed request. Reads the fixture
 * files fresh every call, so GET /requests/:id/evidence detects any change to them or the email.
 */
function verifyAndHash(p: ParsedRequest, email: string): { verification: Verification; evidence_hash: string } {
  let verification: Verification;
  let inputs: Record<string, unknown>;
  if (p.request_type === "margin_call") {
    const positions = readFixtureJson("positions.json");
    const agreement = readFixtureJson("margin_agreement.json");
    inputs = { positions, margin_agreement: agreement };
    verification = deps.verifyMarginCall(p, positions, agreement);
  } else if (p.request_type === "loan_draw") {
    const credit = readFixtureJson("credit_agreement.json");
    inputs = { credit_agreement: credit };
    verification = deps.verifyLoanDraw(p, credit);
  } else {
    // payment_instruction_change / other: never payable by the agent.
    inputs = {};
    verification = { status: "rejected", verified_usd: 0, disputed_usd: p.amount_requested_usd, lines: [] };
  }

  const evidence_hash = deps.evidenceHash({
    request: p,
    source_email_sha256: createHash("sha256").update(email).digest("hex"),
    inputs,
    result: verification,
    engine_version: deps.ENGINE_VERSION,
  });
  return { verification, evidence_hash };
}

export function analyze(id: string): Promise<Analysis> {
  let a = analyses.get(id);
  if (!a) {
    a = analyzeUncached(id);
    analyses.set(id, a);
    // Don't cache failures (e.g. Gemini blip): next call retries.
    a.then((r) => { if (!r.ok) analyses.delete(id); }, () => analyses.delete(id));
  }
  return a;
}

function publicProposal(requestId: string): Proposal | null {
  const pid = proposalByRequest.get(requestId);
  const s = pid ? proposals.get(pid) : undefined;
  if (!s) return null;
  return { id: s.id, approvals: s.approvals, required: s.required, executed: s.executed, tx: s.tx };
}

export async function getRequest(id: string): Promise<Request | Extract<Analysis, { ok: false }>> {
  const a = await analyze(id);
  if (!a.ok) return a;
  return { ...a.request, proposal: publicProposal(id) };
}

export async function listRequests(): Promise<Request[]> {
  // In parallel: a live Gemini call can take ~10s, and the web app gives up after 20s.
  const ids = Object.keys(REQUEST_EMAILS);
  const results = await Promise.all(ids.map((id) => getRequest(id)));
  const out: Request[] = [];
  results.forEach((r, i) => {
    if ("ok" in r) console.error(`request ${ids[i]} skipped: ${r.error} (${r.detail})`);
    else out.push(r);
  });
  return out;
}

/** Parse every inbox email at startup so the first page load doesn't wait on Gemini. */
export function warmUp(): void {
  for (const id of Object.keys(REQUEST_EMAILS)) {
    analyze(id).then(
      (a) => console.log(`warm-up ${id}: ${a.ok ? "ok" : `${a.error} (${a.detail})`}`),
      (e) => console.error(`warm-up ${id} failed: ${(e as Error)?.message}`),
    );
  }
}

/** Why the agent refuses to propose, or null if it may. */
function refusal(a: Analysis): string | null {
  if (!a.ok) return `${a.error}: ${a.detail}`;
  const { request: r, parse } = a;
  if (r.type === "payment_instruction_change" || r.type === "other") return `request type ${r.type} is never paid by the agent`;
  if (parse.parsed.mentions_new_payment_details) return "email mentions new payment details";
  if (r.verification.status === "rejected" || r.verification.verified_usd <= 0) return "verification rejected";
  return null;
}

export async function proposeForRequest(id: string): Promise<ProposeResult> {
  const existing = proposalByRequest.get(id);
  if (existing) {
    const s = proposals.get(existing)!;
    return { ok: true, tx: s.propose_tx, proposal_id: s.id };
  }

  const a = await analyze(id);
  const why = refusal(a);
  if (why || !a.ok) {
    console.warn(`agent refused to propose for ${id}: ${why}`);
    return { ok: false, error_code: AGENT_REFUSED };
  }

  const r = a.request;
  const amount = r.verification.verified_usd;
  const res = await chainCall(
    () => deps.proposePayment({ counterpartyId: r.counterparty_id, amountUsd: amount, kind: r.type as PaymentKind, evidenceHash: r.evidence_hash }),
    "",
  );
  if (res.ok) {
    proposals.set(res.proposal_id, {
      id: res.proposal_id,
      request_id: id,
      amount_usd: amount,
      approvals: 0,
      required: amount >= LARGE_AMOUNT_USD ? 2 : 1,
      executed: false,
      tx: null,
      propose_tx: res.tx,
    });
    proposalByRequest.set(id, res.proposal_id);
  }
  return strip(res);
}

export async function approveProposal(proposalId: string, approver: string): Promise<ProposeResult> {
  const res = await chainCall(() => deps.approve(proposalId, approver), proposalId);
  const s = proposals.get(proposalId);
  if (res.ok && s) s.approvals += 1;
  return strip(res);
}

export async function executeProposal(proposalId: string): Promise<ProposeResult> {
  const res = await chainCall(() => deps.execute(proposalId), proposalId);
  const s = proposals.get(proposalId);
  if (res.ok && s) {
    s.executed = true;
    s.tx = res.tx;
  }
  return strip(res);
}

export async function setKillSwitch(enabled: boolean): Promise<ProposeResult> {
  return strip(await chainCall(() => deps.setAgentEnabled(enabled), ""));
}

/**
 * Story 3 "compromised agent": skips EVERY check (no parse, no verification, no registry) and
 * proposes straight to the phishing wallet from the fixture, so only the chain can stop it.
 */
export async function compromisedAgentPropose(requestId: string): Promise<ProposeResult> {
  const attack = readFixtureJson<{ phishing_wallet: string; amount_usd?: number }>("attack.json");
  const emailFile = REQUEST_EMAILS[requestId] ?? REQUEST_EMAILS.req_phish_1!;
  const evidenceHash = createHash("sha256").update(readFixtureText(emailFile)).digest("hex");
  return strip(
    await chainCall(
      () => deps.proposePaymentToWallet({ wallet: attack.phishing_wallet, amountUsd: attack.amount_usd ?? 2_000_000, kind: "other", evidenceHash }),
      "",
    ),
  );
}

/**
 * Story 3, second beat: a phished approver adds the phishing wallet as a payee. The program starts
 * its timelock, so the compromised agent's next proposal fails with PayeeTimelocked.
 */
export async function addPhishingPayee(): Promise<AddPayeeResult> {
  const attack = readFixtureJson<{ phishing_wallet: string }>("attack.json");
  try {
    const r = await deps.addPayeeForWallet({ wallet: attack.phishing_wallet, label: "New wallet (phishing email)" });
    return { ok: true, tx: r.tx, active_after: r.activeAfter };
  } catch (err) {
    const code = toErrorCode(err);
    if (!code) {
      console.error("add payee failed with no known error code:", (err as Error)?.message);
      throw err;
    }
    return { ok: false, error_code: code };
  }
}

/**
 * "Verify evidence": recompute the hash from the email file, fixtures and engine as they are now
 * (only the parsed request is reused), and compare with the request's hash and the on-chain one.
 */
export async function checkEvidence(id: string): Promise<EvidenceCheck | Extract<Analysis, { ok: false }>> {
  const a = await analyze(id);
  if (!a.ok) return a;
  const { evidence_hash: recomputed } = verifyAndHash(a.parse.parsed, readFixtureText(REQUEST_EMAILS[id]!));
  const pid = proposalByRequest.get(id);
  const onChain = pid ? await deps.getProposalEvidenceHash(pid) : null;
  return {
    recomputed_hash: recomputed,
    stored_hash: a.request.evidence_hash,
    on_chain_hash: onChain,
    match: recomputed === a.request.evidence_hash && (onChain === null || onChain === recomputed),
  };
}

export const getVault = () => deps.getVaultState();
