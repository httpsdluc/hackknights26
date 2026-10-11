// STUB of chain/client.ts (owner: A). In-memory simulation of the policy_vault rules so the
// server works before the real client exists. Errors are thrown as { error_code } like the
// program's error names. Tx signatures are fake ("STUB_..."), never real.
//
// Implements the full ChainClient from CONTRACT.md §5 (checked at the bottom of this file).
// Like the real program, there is no daily cap: spent_today_usd stays 0.
import { randomBytes } from "node:crypto";
import type { ChainClient, ErrorCode, ProposePaymentArgs, ProposePaymentToWalletArgs, VaultState } from "../../shared/types.ts";
import { readFixtureJson } from "../src/fixtures.ts";

const LARGE_AMOUNT = 1_000_000;
const PER_TX_LIMIT = 5_000_000;
const APPROVERS = ["approver1", "approver2"];

const fail = (code: ErrorCode): never => {
  throw Object.assign(new Error(code), { error_code: code });
};
const fakeTx = () => "STUB_" + randomBytes(32).toString("hex");

let agentEnabled = true;
let paidOut = 0;
let nonce = 0;
const proposals = new Map<string, { wallet: string; amountUsd: number; approvals: Set<string>; executed: boolean }>();

function registry(): { counterparties: { id: string; name: string; wallet?: string }[] } {
  return readFixtureJson("registry.json");
}

function propose(wallet: string, amountUsd: number) {
  if (!agentEnabled) fail("AgentDisabled");
  if (!registry().counterparties.some((c) => c.wallet === wallet)) fail("PayeeNotAllowed");
  if (amountUsd > PER_TX_LIMIT) fail("OverPerTxLimit");
  const proposalId = `stub_prop_${++nonce}`;
  proposals.set(proposalId, { wallet, amountUsd, approvals: new Set(), executed: false });
  return { tx: fakeTx(), proposalId };
}

export async function proposePayment(args: ProposePaymentArgs): Promise<{ tx: string; proposalId: string }> {
  const cp = registry().counterparties.find((c) => c.id === args.counterpartyId);
  if (!cp?.wallet) return fail("PayeeNotAllowed");
  return propose(cp.wallet, args.amountUsd);
}

export async function proposePaymentToWallet(args: ProposePaymentToWalletArgs): Promise<{ tx: string; proposalId: string }> {
  return propose(args.wallet, args.amountUsd);
}

export async function approve(proposalId: string, approverName: string): Promise<{ tx: string }> {
  if (!APPROVERS.includes(approverName)) fail("Unauthorized");
  const p = proposals.get(proposalId) ?? fail("Unauthorized");
  if (p.executed) fail("AlreadyExecuted");
  if (p.approvals.has(approverName)) fail("AlreadyApproved");
  p.approvals.add(approverName);
  return { tx: fakeTx() };
}

export async function execute(proposalId: string): Promise<{ tx: string }> {
  const p = proposals.get(proposalId) ?? fail("Unauthorized");
  if (p.executed) fail("AlreadyExecuted");
  if (p.approvals.size < (p.amountUsd >= LARGE_AMOUNT ? 2 : 1)) fail("NotEnoughApprovals");
  paidOut += p.amountUsd;
  p.executed = true;
  return { tx: fakeTx() };
}

export async function setAgentEnabled(enabled: boolean): Promise<{ tx: string }> {
  agentEnabled = enabled;
  return { tx: fakeTx() };
}

export async function getVaultState(): Promise<VaultState> {
  return {
    rules: {
      agent_enabled: agentEnabled,
      large_amount_usd: LARGE_AMOUNT,
      approvals_required_large: 2,
      approvals_required_small: 1,
      payee_timelock_secs: 60,
    },
    payees: registry().counterparties.map((c) => ({
      counterparty_id: c.id,
      label: c.name,
      wallet: c.wallet ?? null,
      per_tx_limit_usd: PER_TX_LIMIT,
      active_after: 0,
    })),
    balances: { vault_usd: 10_000_000 - paidOut },
    spent_today_usd: 0,
  };
}

// Compile-time check that this stub matches the contract's ChainClient.
const _contract: ChainClient = { proposePayment, approve, execute, setAgentEnabled, proposePaymentToWallet, getVaultState };
void _contract;
