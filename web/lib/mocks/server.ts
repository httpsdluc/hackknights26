// In-browser stand-in for the server, used when NEXT_PUBLIC_USE_MOCKS=true.
// Shapes are CONTRACT.md §4 only. State lives in sessionStorage so a reload keeps the demo's place.
import type {
  AddPayeeResult, EvidenceCheck, ResultErrorCode, ProposeResult, Request as CosignRequest, VaultState,
} from "../../../shared/types.ts";
import seed from "./requests.json";

interface MockState {
  requests: CosignRequest[];
  approvers: Record<string, string[]>;
  agentEnabled: boolean;
  nonce: number;
  /** unix seconds the mock vault was "created"; payee timelocks count from here */
  createdAt?: number;
  /** unix seconds the phishing wallet becomes payable, once a "phished approver" added it */
  phishingActiveAfter?: number;
}

const PHISHING_WALLET = "AU4NQcZ8yEFKo5bx6BeBn89MJuVFPuTiys64FF5xZfna";

const KEY = "cosign-mock-state-v1";
const SIGNERS = ["approver1", "approver2"];
const LARGE_AMOUNT_USD = 1_000_000;
const PAYEE_TIMELOCK_SECS = 60;
const PER_TX_LIMIT_USD = 5_000_000;
// Same payees and wallets as the CONTRACT.md §4 example. Agent Bank Y is added later, so its timelock is visible.
const PAYEES = [
  { counterparty_id: "pbx", label: "Prime Broker X", wallet: "43utK3Q6iqC9MxkrvL9RRwd7v2F9ApxoqTi98iztEa2e", added_secs: -3600 },
  { counterparty_id: "aby", label: "Agent Bank Y", wallet: "BrDqpW74UceVDvwxQTxdAgxrii8rkyEWvoVGzTKaR3YU", added_secs: 0 },
];

function load(): MockState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    // fall through to a fresh state
  }
  return { requests: structuredClone(seed) as CosignRequest[], approvers: {}, agentEnabled: true, nonce: 0 };
}

function save(state: MockState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage unavailable: state just won't survive a reload
  }
}

const wait = () => new Promise((r) => setTimeout(r, 500));
const fail = (error_code: ResultErrorCode): ProposeResult => ({ ok: false, error_code });

function mockTx(state: MockState): string {
  state.nonce += 1;
  return `MOCK${String(state.nonce).padStart(4, "0")}${"x".repeat(40)}`;
}

export async function mockListRequests(): Promise<CosignRequest[]> {
  await wait();
  return load().requests;
}

export async function mockGetRequest(id: string): Promise<CosignRequest | null> {
  await wait();
  return load().requests.find((r) => r.id === id) ?? null;
}

export async function mockPropose(requestId: string): Promise<ProposeResult> {
  await wait();
  const state = load();
  const req = state.requests.find((r) => r.id === requestId);
  if (!req) return fail("Unauthorized");
  if (req.proposal) return { ok: true, tx: mockTx(state), proposal_id: req.proposal.id };
  if (req.verification.status === "rejected") return fail("AgentRefused");
  if (!state.agentEnabled) return fail("AgentDisabled");
  const id = `mock_prop_${state.nonce + 1}`;
  req.proposal = {
    id,
    approvals: 0,
    required: req.verification.verified_usd >= LARGE_AMOUNT_USD ? 2 : 1,
    executed: false,
    tx: null,
  };
  state.approvers[id] = [];
  const tx = mockTx(state);
  save(state);
  return { ok: true, tx, proposal_id: id };
}

export async function mockApprove(proposalId: string, approver: string): Promise<ProposeResult> {
  await wait();
  const state = load();
  const req = state.requests.find((r) => r.proposal?.id === proposalId);
  if (!req?.proposal || !SIGNERS.includes(approver)) return fail("Unauthorized");
  if (req.proposal.executed) return fail("AlreadyExecuted");
  const signed = (state.approvers[proposalId] ??= []);
  if (signed.includes(approver)) return fail("AlreadyApproved");
  signed.push(approver);
  req.proposal.approvals = signed.length;
  const tx = mockTx(state);
  save(state);
  return { ok: true, tx, proposal_id: proposalId };
}

export async function mockExecute(proposalId: string): Promise<ProposeResult> {
  await wait();
  const state = load();
  const req = state.requests.find((r) => r.proposal?.id === proposalId);
  if (!req?.proposal) return fail("Unauthorized");
  if (req.proposal.executed) return fail("AlreadyExecuted");
  if (req.proposal.approvals < req.proposal.required) return fail("NotEnoughApprovals");
  const tx = mockTx(state);
  req.proposal.executed = true;
  req.proposal.tx = tx;
  save(state);
  return { ok: true, tx, proposal_id: proposalId };
}

export async function mockKillSwitch(enabled: boolean): Promise<ProposeResult> {
  await wait();
  const state = load();
  state.agentEnabled = enabled;
  const tx = mockTx(state);
  save(state);
  return { ok: true, tx, proposal_id: "" };
}

export async function mockCompromisedAgent(): Promise<ProposeResult> {
  await wait();
  const state = load();
  if (!state.agentEnabled) return fail("AgentDisabled");
  if (state.phishingActiveAfter === undefined) return fail("PayeeNotAllowed");
  if (Date.now() / 1000 < state.phishingActiveAfter) return fail("PayeeTimelocked");
  const tx = mockTx(state);
  save(state);
  return { ok: true, tx, proposal_id: `mock_prop_${state.nonce}` };
}

export async function mockAddPhishingPayee(): Promise<AddPayeeResult> {
  await wait();
  const state = load();
  if (state.phishingActiveAfter !== undefined) return { ok: true, tx: null, active_after: state.phishingActiveAfter };
  state.phishingActiveAfter = Math.floor(Date.now() / 1000) + PAYEE_TIMELOCK_SECS;
  const tx = mockTx(state);
  save(state);
  return { ok: true, tx, active_after: state.phishingActiveAfter };
}

export async function mockVerifyEvidence(requestId: string): Promise<EvidenceCheck> {
  await wait();
  const req = load().requests.find((r) => r.id === requestId);
  const hash = req?.evidence_hash ?? "";
  return { recomputed_hash: hash, stored_hash: hash, on_chain_hash: req?.proposal ? hash : null, match: true };
}

export async function mockGetVault(): Promise<VaultState> {
  await wait();
  const state = load();
  state.createdAt ??= Math.floor(Date.now() / 1000);
  save(state);
  const created = state.createdAt;
  return {
    rules: {
      agent_enabled: state.agentEnabled,
      large_amount_usd: LARGE_AMOUNT_USD,
      approvals_required_large: 2,
      approvals_required_small: 1,
      payee_timelock_secs: PAYEE_TIMELOCK_SECS,
    },
    payees: [
      ...PAYEES.map(({ added_secs, ...p }) => ({
        ...p,
        per_tx_limit_usd: PER_TX_LIMIT_USD,
        active_after: created + added_secs + PAYEE_TIMELOCK_SECS,
      })),
      ...(state.phishingActiveAfter === undefined
        ? []
        : [{
            counterparty_id: null,
            label: "New wallet (phishing email)",
            wallet: PHISHING_WALLET,
            per_tx_limit_usd: PER_TX_LIMIT_USD,
            active_after: state.phishingActiveAfter,
          }]),
    ],
    balances: { vault_usd: 10_000_000 },
    spent_today_usd: 0,
  };
}
