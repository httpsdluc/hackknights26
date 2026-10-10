// policy_vault tests. Run with `anchor test` (spins up a local validator).
// Plain node:test + node's built-in TypeScript stripping; no extra test deps.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import anchor from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import idl from "../target/idl/policy_vault.json" with { type: "json" };
import type { PolicyVault } from "../target/types/policy_vault.ts";

const { AnchorProvider, BN, Program } = anchor;

const USDC = 1_000_000n; // 6 decimals
const usd = (n: number) => new BN((BigInt(n) * USDC).toString());

const provider = AnchorProvider.env();
anchor.setProvider(provider);
const program = new Program<PolicyVault>(idl as PolicyVault, provider);
const conn = provider.connection;
const payer = (provider.wallet as anchor.Wallet).payer;

async function fund(...keys: PublicKey[]) {
  const tx = new Transaction();
  for (const k of keys) {
    tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: k, lamports: 2 * LAMPORTS_PER_SOL }));
  }
  await provider.sendAndConfirm(tx);
}

function label(s: string): number[] {
  const bytes = Buffer.alloc(32);
  bytes.write(s, "utf8");
  return [...bytes];
}

/** Assert a promise rejects with the given program error name. */
async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e: any) {
    const parsed = e?.error?.errorCode?.code ?? anchor.AnchorError.parse(e?.logs ?? e?.transactionLogs ?? [])?.error.errorCode.code;
    assert.equal(parsed, code, `expected ${code}, got: ${parsed ?? e}`);
    return;
  }
  assert.fail(`expected ${code}, but the transaction succeeded`);
}

let nonceCounter = BigInt(Date.now());
const nextNonce = () => new BN((nonceCounter++).toString());

interface Fixture {
  admin: Keypair;
  agent: Keypair;
  approver1: Keypair;
  approver2: Keypair;
  mint: PublicKey;
  vault: PublicKey;
  vaultAta: PublicKey;
  payeeTokenAccount: PublicKey;
  payee: PublicKey;
}

const vaultPda = (admin: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("vault"), admin.toBuffer()], program.programId)[0];
const payeePda = (vault: PublicKey, tokenAccount: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("payee"), vault.toBuffer(), tokenAccount.toBuffer()], program.programId)[0];
const proposalPda = (vault: PublicKey, nonce: InstanceType<typeof BN>) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), vault.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    program.programId,
  )[0];

/** New vault (fresh admin) with $10M in it and one registered payee. */
async function makeVault(timelockSecs: number): Promise<Fixture> {
  const admin = Keypair.generate();
  const agent = Keypair.generate();
  const approver1 = Keypair.generate();
  const approver2 = Keypair.generate();
  await fund(admin.publicKey, agent.publicKey, approver1.publicKey, approver2.publicKey);

  const mint = await createMint(conn, payer, payer.publicKey, null, 6);
  const vault = vaultPda(admin.publicKey);
  const vaultAta = getAssociatedTokenAddressSync(mint, vault, true);

  await program.methods
    .initializeVault(agent.publicKey, [approver1.publicKey, approver2.publicKey], usd(1_000_000), usd(5_000_000), new BN(timelockSecs))
    .accounts({ admin: admin.publicKey, mint })
    .signers([admin])
    .rpc();
  await mintTo(conn, payer, mint, vaultAta, payer, 10_000_000n * USDC);

  const payeeTokenAccount = await createAccount(conn, payer, mint, Keypair.generate().publicKey);
  await program.methods
    .addPayee(label("Prime Broker X"), usd(3_000_000))
    .accounts({ approver: approver1.publicKey, vault, payeeTokenAccount })
    .signers([approver1])
    .rpc();

  return { admin, agent, approver1, approver2, mint, vault, vaultAta, payeeTokenAccount, payee: payeePda(vault, payeeTokenAccount) };
}

async function propose(f: Fixture, amountUsd: number, payee = f.payee) {
  const nonce = nextNonce();
  await program.methods
    .proposePayment(usd(amountUsd), 0, new Array(32).fill(7), nonce)
    .accountsPartial({ agent: f.agent.publicKey, vault: f.vault, payee, proposal: proposalPda(f.vault, nonce) })
    .signers([f.agent])
    .rpc();
  return proposalPda(f.vault, nonce);
}

const approve = (f: Fixture, proposal: PublicKey, signer: Keypair) =>
  program.methods
    .approve()
    .accountsPartial({ approver: signer.publicKey, vault: f.vault, proposal })
    .signers([signer])
    .rpc();

const execute = (f: Fixture, proposal: PublicKey) =>
  program.methods
    .execute()
    .accountsPartial({
      vault: f.vault,
      proposal,
      payee: f.payee,
      mint: f.mint,
      vaultTokenAccount: f.vaultAta,
      payeeTokenAccount: f.payeeTokenAccount,
    })
    .rpc();

const balance = async (ata: PublicKey) => (await getAccount(conn, ata)).amount;

describe("policy_vault", () => {
  let f: Fixture; // timelock 0: payee is usable immediately

  before(async () => {
    f = await makeVault(0);
  });

  it("propose 1,900,000 → two approvals → execute moves the funds", async () => {
    const before = await balance(f.payeeTokenAccount);
    const p = await propose(f, 1_900_000);
    await approve(f, p, f.approver1);
    await approve(f, p, f.approver2);
    await execute(f, p);
    assert.equal(await balance(f.payeeTokenAccount), before + 1_900_000n * USDC);
    const prop = await program.account.proposal.fetch(p);
    assert.equal(prop.executed, true);
  });

  it("large payment with one approval fails with NotEnoughApprovals", async () => {
    const p = await propose(f, 1_900_000);
    await approve(f, p, f.approver1);
    await expectCode(execute(f, p), "NotEnoughApprovals");
  });
});
