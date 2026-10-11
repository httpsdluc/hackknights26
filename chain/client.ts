// Solana client for the policy_vault program (owner: A).
// Exports match the chain → server boundary in CONTRACT.md §5, plus two the server asked for:
// proposePaymentToWallet (Story 3 compromised agent) and getVaultState (GET /vault).
// Amounts arrive in whole USD; converted to 6 decimals here and only here.
// On a program error, throws an Error whose `.code` is the plain error name (e.g. "PayeeTimelocked").
//
// Config (all read lazily on first call, so importing this file never fails):
//   SOLANA_RPC_URL     RPC endpoint (default: devnet)
//   COSIGN_DEPLOYMENT  deployment file written by scripts/setup-devnet.ts (default: chain/deployment.json)
//   COSIGN_KEYS_DIR    keypair folder (default: keys/), with admin/agent/approver1/approver2.json
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { ErrorCode, PaymentKind, ProposePaymentArgs } from "../shared/types.ts";
import { ERROR_CODES } from "../shared/types.ts";
import idl from "./idl.json" with { type: "json" };
import type { PolicyVault } from "./policy_vault_types.ts";

const { AnchorProvider, BN, Program, Wallet } = anchor;

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const USDC_DECIMALS = 6;
const KIND: Record<PaymentKind, number> = { margin_call: 0, loan_draw: 1, other: 2 };
export const APPROVER_NAMES = ["approver1", "approver2"] as const;

export interface Deployment {
  programId: string;
  admin: string;
  vault: string;
  mint: string;
}

// ---------- config ----------

let cached: { conn: Connection; dep: Deployment; vault: PublicKey; mint: PublicKey; mtime: number } | null = null;

/** Re-read when the deployment file changes, so scripts/reset-demo.ts takes effect without a server restart. */
function config() {
  const depPath = process.env.COSIGN_DEPLOYMENT ?? path.join(here, "deployment.json");
  if (!existsSync(depPath)) {
    throw new Error(`chain: no deployment file at ${depPath}. Run scripts/setup-devnet.ts first.`);
  }
  const mtime = statSync(depPath).mtimeMs;
  if (cached && cached.mtime === mtime) return cached;
  const dep = JSON.parse(readFileSync(depPath, "utf8")) as Deployment;
  const conn = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
  cached = { conn, dep, vault: new PublicKey(dep.vault), mint: new PublicKey(dep.mint), mtime };
  return cached;
}

function keypair(name: string): Keypair {
  const dir = process.env.COSIGN_KEYS_DIR ?? path.join(ROOT, "keys");
  const file = path.join(dir, `${name}.json`);
  if (!existsSync(file)) throw new Error(`chain: missing keypair ${name}.json in ${dir}`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8"))));
}

function program(signer: Keypair) {
  const { conn } = config();
  const provider = new AnchorProvider(conn, new Wallet(signer), { commitment: "confirmed" });
  return new Program<PolicyVault>(idl as PolicyVault, provider);
}

/** Counterparty registry, same lookup as server/: fixtures/ first, then server/stubs/fixtures/. */
function readRegistry(): { id: string; wallet?: string }[] {
  const real = path.join(ROOT, "fixtures/registry.json");
  const file = existsSync(real) ? real : path.join(ROOT, "server/stubs/fixtures/registry.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { counterparties: { id: string; wallet?: string }[] }).counterparties;
}

function registryWallet(counterpartyId: string): PublicKey | null {
  const wallet = readRegistry().find((c) => c.id === counterpartyId)?.wallet;
  return wallet ? new PublicKey(wallet) : null;
}

// ---------- helpers ----------

class ChainError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.name = "ChainError";
    this.code = code;
  }
}

/** Runs a chain call; program errors become ChainError with `.code`, anything else is rethrown. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof ChainError) throw e;
    const name = e?.error?.errorCode?.code ?? anchor.AnchorError.parse(e?.logs ?? e?.transactionLogs ?? [])?.error.errorCode.code;
    if (ERROR_CODES.includes(name)) throw new ChainError(name);
    throw e;
  }
}

function usdToUnits(amountUsd: number) {
  if (!Number.isSafeInteger(amountUsd) || amountUsd <= 0) {
    throw new Error(`chain: amountUsd must be a positive whole number, got ${amountUsd}`);
  }
  return new BN((BigInt(amountUsd) * 10n ** BigInt(USDC_DECIMALS)).toString());
}

const unitsToUsd = (units: { toString(): string } | bigint) => Number(BigInt(units.toString()) / 10n ** BigInt(USDC_DECIMALS));

function hashBytes(evidenceHash: string): number[] {
  if (!/^[0-9a-fA-F]{64}$/.test(evidenceHash)) throw new Error("chain: evidenceHash must be 64 hex characters");
  return [...Buffer.from(evidenceHash, "hex")];
}

function payeePda(programId: PublicKey, vault: PublicKey, tokenAccount: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("payee"), vault.toBuffer(), tokenAccount.toBuffer()], programId)[0];
}

function randomNonce() {
  return new BN(Buffer.from(crypto.getRandomValues(new Uint8Array(8))), "le");
}

// ---------- CONTRACT.md §5 ----------

export async function proposePayment(args: ProposePaymentArgs): Promise<{ tx: string; proposalId: string }> {
  const wallet = registryWallet(args.counterpartyId);
  if (!wallet) throw new ChainError("PayeeNotAllowed");
  return proposePaymentToWallet({ wallet: wallet.toBase58(), amountUsd: args.amountUsd, kind: args.kind, evidenceHash: args.evidenceHash });
}

export async function approve(proposalId: string, approverName: string): Promise<{ tx: string }> {
  const { vault } = config();
  let signer: Keypair;
  try {
    signer = keypair(approverName);
  } catch {
    throw new ChainError("Unauthorized"); // unknown approver name
  }
  const tx = await run(() =>
    program(signer)
      .methods.approve()
      .accountsPartial({ approver: signer.publicKey, vault, proposal: new PublicKey(proposalId) })
      .rpc(),
  );
  return { tx };
}

export async function execute(proposalId: string): Promise<{ tx: string }> {
  const { vault, mint } = config();
  const payer = keypair("admin"); // execute is permissionless; admin just pays the fee
  const p = program(payer);
  const proposalKey = new PublicKey(proposalId);
  const proposal = await p.account.proposal.fetch(proposalKey);
  const payee = await p.account.payee.fetch(proposal.payee);
  const tx = await run(() =>
    p.methods
      .execute()
      .accountsPartial({
        vault,
        proposal: proposalKey,
        payee: proposal.payee,
        mint,
        vaultTokenAccount: getAssociatedTokenAddressSync(mint, vault, true),
        payeeTokenAccount: payee.tokenAccount,
      })
      .rpc(),
  );
  return { tx };
}

/** Disabling: an approver signs. Re-enabling: only the admin can. */
export async function setAgentEnabled(enabled: boolean): Promise<{ tx: string }> {
  const { vault } = config();
  const signer = keypair(enabled ? "admin" : "approver1");
  const tx = await run(() =>
    program(signer).methods.setAgentEnabled(enabled).accountsPartial({ authority: signer.publicKey, vault }).rpc(),
  );
  return { tx };
}

// ---------- extras requested by server/ (not in CONTRACT.md §5 yet) ----------

/**
 * Story 3 "compromised agent": propose straight to a wallet, skipping the registry.
 * The program rejects it (PayeeNotAllowed / PayeeTimelocked); that's the point.
 */
export async function proposePaymentToWallet(args: {
  wallet: string;
  amountUsd: number;
  kind: PaymentKind;
  evidenceHash: string;
}): Promise<{ tx: string; proposalId: string }> {
  const { vault, mint } = config();
  const agent = keypair("agent");
  const p = program(agent);
  const tokenAccount = getAssociatedTokenAddressSync(mint, new PublicKey(args.wallet), true);
  const nonce = randomNonce();
  const proposal = PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), vault.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    p.programId,
  )[0];
  const tx = await run(() =>
    p.methods
      .proposePayment(usdToUnits(args.amountUsd), KIND[args.kind], hashBytes(args.evidenceHash), nonce)
      .accountsPartial({ agent: agent.publicKey, vault, payee: payeePda(p.programId, vault, tokenAccount), proposal })
      .rpc(),
  );
  return { tx, proposalId: proposal.toBase58() };
}

/** For GET /vault: rules, payees, balances, today's spend. All USD. */
export async function getVaultState() {
  const { conn, vault, mint } = config();
  const p = program(Keypair.generate()); // read-only, no signing
  const v = await p.account.vault.fetch(vault);
  const payees = await p.account.payee.all([{ memcmp: { offset: 8, bytes: vault.toBase58() } }]);
  const vaultBalance = await getAccount(conn, getAssociatedTokenAddressSync(mint, vault, true));

  const byTokenAccount = new Map(
    readRegistry()
      .filter((c) => c.wallet)
      .map((c) => [getAssociatedTokenAddressSync(mint, new PublicKey(c.wallet!), true).toBase58(), c]),
  );

  return {
    rules: {
      agent_enabled: v.agentEnabled,
      large_amount_usd: unitsToUsd(v.largeAmount),
      approvals_required_large: 2,
      approvals_required_small: 1,
      daily_cap_usd: unitsToUsd(v.dailyCap),
      payee_timelock_secs: v.payeeTimelockSecs.toNumber(),
    },
    payees: payees.map(({ account }) => {
      const cp = byTokenAccount.get(account.tokenAccount.toBase58());
      return {
        counterparty_id: cp?.id ?? null,
        label: Buffer.from(account.label).toString("utf8").replace(/\0+$/, ""),
        wallet: cp?.wallet ?? null,
        per_tx_limit_usd: unitsToUsd(account.perTxLimit),
        active_after: account.activeAfter.toNumber(),
      };
    }),
    balances: { vault_usd: unitsToUsd(vaultBalance.amount) },
    spent_today_usd: unitsToUsd(v.spentToday),
  };
}
