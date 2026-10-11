// One-time chain setup for the demo (BUILD_PLAN.md §6 "Setup"):
//   deploy policy_vault → agent + two approver keypairs → 6-decimal Test USDC mint →
//   vault (large $1M, cap $5M, payee timelock 60s) → mint $10,000,000 to the vault →
//   register payees "Prime Broker X" (pbx) and "Agent Bank Y" (aby) ONLY → write chain/deployment.json.
//
// Run:  scripts/build.sh && node scripts/setup-devnet.ts            (devnet)
//       node scripts/setup-devnet.ts --no-deploy                     (program already deployed)
// Env (same as chain/client.ts): SOLANA_RPC_URL, COSIGN_KEYS_DIR, COSIGN_DEPLOYMENT.
// Keypairs are created in keys/ (gitignored) if missing and never printed; only public keys are.
// Safe to re-run: existing keys, vault and payees are reused.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import idl from "../chain/idl.json" with { type: "json" };
import type { PolicyVault } from "../chain/policy_vault_types.ts";

const { AnchorProvider, BN, Program, Wallet } = anchor;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UNITS = 1_000_000n; // 6 decimals
const usd = (n: number) => new BN((BigInt(n) * UNITS).toString());

export const VAULT_RULES = {
  largeAmountUsd: 1_000_000,
  dailyCapUsd: 5_000_000, // stored only; the daily cap is not enforced
  payeeTimelockSecs: 60, // "72 hours in production"
  vaultFundingUsd: 10_000_000,
  perTxLimitUsd: 5_000_000,
};
/** The only counterparties ever registered as payees. Never the phishing wallet. */
export const PAYEE_IDS = ["pbx", "aby"] as const;

export const rpcUrl = () => process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
export const keysDir = () => process.env.COSIGN_KEYS_DIR ?? path.join(ROOT, "keys");
export const deploymentPath = () => process.env.COSIGN_DEPLOYMENT ?? path.join(ROOT, "chain/deployment.json");

/** Loads keys/<name>.json, creating it if missing. Never prints the secret key. */
export function loadOrCreateKey(name: string, opts: { fresh?: boolean } = {}): Keypair {
  const file = path.join(keysDir(), `${name}.json`);
  if (existsSync(file) && !opts.fresh) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8"))));
  }
  mkdirSync(keysDir(), { recursive: true });
  const kp = Keypair.generate();
  writeFileSync(file, JSON.stringify([...kp.secretKey]), { mode: 0o600 });
  console.log(`  created keypair ${name}: ${kp.publicKey.toBase58()}`);
  return kp;
}

function solanaEnv() {
  const bin = path.join(os.homedir(), ".local/share/solana/install/active_release/bin");
  return { ...process.env, PATH: `${bin}:${process.env.PATH}` };
}

/** Make sure `who` has at least `minSol`; airdrop first, then top up from `payer` if given. */
async function ensureSol(conn: Connection, who: PublicKey, minSol: number, payer?: Keypair) {
  const have = (await conn.getBalance(who)) / LAMPORTS_PER_SOL;
  if (have >= minSol) return;
  const need = minSol - have;
  if (payer && !payer.publicKey.equals(who)) {
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: who, lamports: Math.ceil(need * LAMPORTS_PER_SOL) }),
    );
    await anchor.web3.sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" });
    return;
  }
  try {
    // Faucets cap each airdrop (devnet: 2 SOL), so ask in chunks. Vary the amount by a few
    // lamports so identical airdrop transactions aren't dropped as duplicates.
    for (let i = 0; i < 4 && (await conn.getBalance(who)) / LAMPORTS_PER_SOL < minSol; i++) {
      const sig = await conn.requestAirdrop(who, 2 * LAMPORTS_PER_SOL - i);
      await conn.confirmTransaction(sig, "confirmed");
    }
  } catch (e) {
    throw new Error(
      `Need ${minSol} SOL in ${who.toBase58()} (has ${have.toFixed(2)}). Airdrop failed: ${(e as Error).message}\n` +
        `Fund it at https://faucet.solana.com (devnet) and re-run.`,
    );
  }
  if ((await conn.getBalance(who)) / LAMPORTS_PER_SOL < minSol) {
    throw new Error(`Still under ${minSol} SOL in ${who.toBase58()}. Fund it at https://faucet.solana.com and re-run.`);
  }
}

function readRegistry(): { id: string; name: string; wallet?: string }[] {
  const real = path.join(ROOT, "fixtures/registry.json");
  const file = existsSync(real) ? real : path.join(ROOT, "server/stubs/fixtures/registry.json");
  return JSON.parse(readFileSync(file, "utf8")).counterparties;
}

/**
 * SOL the deployer needs: a temporary upload buffer the size of the .so (refunded after), plus the
 * program data account on a first deploy, or a small top-up on an upgrade. +0.5 SOL for fees and setup.
 */
export async function solNeededToDeploy(conn: Connection): Promise<number> {
  const soSize = statSync(path.join(ROOT, "target/deploy/policy_vault.so")).size;
  const rent = (bytes: number) => conn.getMinimumBalanceForRentExemption(bytes);
  const programId = new PublicKey((idl as { address: string }).address);
  const alreadyDeployed = (await conn.getAccountInfo(programId)) !== null;
  const lamports = (await rent(soSize + 45)) + (alreadyDeployed ? 0.3 * LAMPORTS_PER_SOL : await rent(soSize + 45)) + 0.5 * LAMPORTS_PER_SOL;
  return Math.ceil((lamports / LAMPORTS_PER_SOL) * 100) / 100;
}

const PROGRAMDATA_HEADER = 45; // upgradeable-loader metadata before the program bytes
const MIN_EXTEND_BYTES = 10_240; // the loader rejects smaller ExtendProgram requests

/**
 * On an upgrade, the program data account must already fit the new .so. Solana CLI 2.1 auto-extends
 * by only the missing bytes, which current clusters reject (< 10,240), so extend it ourselves first.
 */
async function extendProgramIfNeeded(conn: Connection, deployer: string) {
  const programId = new PublicKey((idl as { address: string }).address);
  const program = await conn.getAccountInfo(programId);
  if (!program) return; // first deploy: the CLI sizes it
  const programData = new PublicKey(program.data.subarray(4, 36));
  const info = await conn.getAccountInfo(programData);
  if (!info) return;
  const capacity = info.data.length - PROGRAMDATA_HEADER;
  const soSize = statSync(path.join(ROOT, "target/deploy/policy_vault.so")).size;
  if (soSize <= capacity) return;
  const extra = Math.max(soSize - capacity, MIN_EXTEND_BYTES);
  console.log(`Extending program storage by ${extra} bytes (${capacity} → ${capacity + extra})…`);
  execFileSync(
    "solana",
    ["program", "extend", programId.toBase58(), String(extra), "--keypair", deployer, "--url", rpcUrl()],
    { stdio: "inherit", env: solanaEnv() },
  );
}

/** Deploys (or upgrades) the program from target/deploy with keys/deployer.json. */
export async function deployProgram(deployer: string) {
  await extendProgramIfNeeded(new Connection(rpcUrl(), "confirmed"), deployer);
  console.log("Deploying policy_vault…");
  execFileSync(
    "solana",
    [
      "program", "deploy", path.join(ROOT, "target/deploy/policy_vault.so"),
      "--program-id", path.join(ROOT, "target/deploy/policy_vault-keypair.json"),
      "--keypair", deployer,
      "--url", rpcUrl(),
    ],
    { stdio: "inherit", env: solanaEnv() },
  );
}

/**
 * Creates (or reuses) a vault for `admin` with the demo rules, $10M of Test USDC and the two payees,
 * then writes the deployment file chain/client.ts reads. Used by setup-devnet and reset-demo.
 */
export async function setupVault(admin: Keypair, funder: Keypair) {
  const conn = new Connection(rpcUrl(), "confirmed");
  const agent = loadOrCreateKey("agent");
  const approver1 = loadOrCreateKey("approver1");
  const approver2 = loadOrCreateKey("approver2");

  console.log("Funding fee accounts…");
  await ensureSol(conn, funder.publicKey, 0.5);
  await ensureSol(conn, admin.publicKey, 0.1, funder);
  await ensureSol(conn, agent.publicKey, 0.2, funder);
  await ensureSol(conn, approver1.publicKey, 0.1, funder);
  await ensureSol(conn, approver2.publicKey, 0.05, funder);

  const provider = new AnchorProvider(conn, new Wallet(admin), { commitment: "confirmed", preflightCommitment: "confirmed" });
  const program = new Program<PolicyVault>(idl as PolicyVault, provider);
  const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), admin.publicKey.toBuffer()], program.programId)[0];

  let mint: PublicKey;
  const existing = await program.account.vault.fetchNullable(vault);
  if (existing) {
    mint = existing.mint;
    console.log(`Vault already exists: ${vault.toBase58()} (reusing)`);
  } else {
    console.log("Creating Test USDC mint (6 decimals)…");
    mint = await createMint(conn, funder, admin.publicKey, null, 6, undefined, { commitment: "confirmed" });
    console.log("Initializing vault…");
    await program.methods
      .initializeVault(
        agent.publicKey,
        [approver1.publicKey, approver2.publicKey],
        usd(VAULT_RULES.largeAmountUsd),
        usd(VAULT_RULES.dailyCapUsd),
        new BN(VAULT_RULES.payeeTimelockSecs),
      )
      .accounts({ admin: admin.publicKey, mint })
      .rpc();
  }

  const vaultAta = await getOrCreateAssociatedTokenAccount(conn, funder, mint, vault, true, "confirmed");
  if (vaultAta.amount === 0n) {
    console.log(`Minting $${VAULT_RULES.vaultFundingUsd.toLocaleString()} Test USDC to the vault…`);
    await mintTo(conn, funder, mint, vaultAta.address, admin, BigInt(VAULT_RULES.vaultFundingUsd) * UNITS, [], { commitment: "confirmed" });
  }

  const registry = readRegistry();
  const approverProgram = new Program<PolicyVault>(
    idl as PolicyVault,
    new AnchorProvider(conn, new Wallet(approver1), { commitment: "confirmed", preflightCommitment: "confirmed" }),
  );
  for (const id of PAYEE_IDS) {
    const cp = registry.find((c) => c.id === id);
    if (!cp?.wallet) throw new Error(`registry.json has no wallet for "${id}"`);
    const tokenAccount = (await getOrCreateAssociatedTokenAccount(conn, funder, mint, new PublicKey(cp.wallet), true, "confirmed")).address;
    const payee = PublicKey.findProgramAddressSync(
      [Buffer.from("payee"), vault.toBuffer(), tokenAccount.toBuffer()],
      program.programId,
    )[0];
    if (await conn.getAccountInfo(payee)) {
      console.log(`Payee ${cp.name} already registered`);
      continue;
    }
    const label = Buffer.alloc(32);
    label.write(cp.name.slice(0, 32));
    await approverProgram.methods
      .addPayee([...label], usd(VAULT_RULES.perTxLimitUsd))
      .accounts({ approver: approver1.publicKey, vault, payeeTokenAccount: tokenAccount })
      .rpc();
    console.log(`Registered payee ${cp.name} (${id}); usable after the ${VAULT_RULES.payeeTimelockSecs}s timelock`);
  }

  const deployment = {
    programId: program.programId.toBase58(),
    admin: admin.publicKey.toBase58(),
    vault: vault.toBase58(),
    mint: mint.toBase58(),
  };
  writeFileSync(deploymentPath(), JSON.stringify(deployment, null, 2) + "\n");

  const balance = (await getAccount(conn, vaultAta.address, "confirmed")).amount / UNITS;
  console.log("\nDone.");
  console.log(`  program   ${deployment.programId}`);
  console.log(`  vault     ${deployment.vault}  ($${balance.toLocaleString()} Test USDC)`);
  console.log(`  mint      ${deployment.mint}`);
  console.log(`  admin     ${deployment.admin}`);
  console.log(`  agent     ${agent.publicKey.toBase58()}`);
  console.log(`  approvers ${approver1.publicKey.toBase58()}, ${approver2.publicKey.toBase58()}`);
  console.log(`  wrote     ${path.relative(ROOT, deploymentPath())}`);
  return deployment;
}

async function main() {
  console.log(`RPC: ${rpcUrl()}`);
  const deployerFile = path.join(keysDir(), "deployer.json");
  const deployer = loadOrCreateKey("deployer");
  if (!process.argv.includes("--no-deploy")) {
    const conn = new Connection(rpcUrl(), "confirmed");
    await ensureSol(conn, deployer.publicKey, await solNeededToDeploy(conn));
    await deployProgram(deployerFile);
  }
  await setupVault(loadOrCreateKey("admin"), deployer);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
