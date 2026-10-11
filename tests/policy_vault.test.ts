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

const setAgentEnabled = (f: Fixture, enabled: boolean, signer: Keypair) =>
  program.methods
    .setAgentEnabled(enabled)
    .accountsPartial({ authority: signer.publicKey, vault: f.vault })
    .signers([signer])
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

  it("agent calling approve → Unauthorized", async () => {
    const p = await propose(f, 500_000);
    await expectCode(approve(f, p, f.agent), "Unauthorized");
  });

  it("same approver twice → AlreadyApproved; execute twice → AlreadyExecuted", async () => {
    const p = await propose(f, 500_000); // under large_amount: one approval is enough
    await approve(f, p, f.approver1);
    await expectCode(approve(f, p, f.approver1), "AlreadyApproved");
    await execute(f, p);
    await expectCode(execute(f, p), "AlreadyExecuted");
    await expectCode(approve(f, p, f.approver2), "AlreadyExecuted");
  });

  it("amount over the payee's per-tx limit → OverPerTxLimit", async () => {
    await expectCode(propose(f, 3_000_001), "OverPerTxLimit");
  });

  it("non-approver adding a payee → Unauthorized", async () => {
    const tokenAccount = await createAccount(conn, payer, f.mint, Keypair.generate().publicKey);
    await expectCode(
      program.methods
        .addPayee(label("Mallory"), usd(1))
        .accounts({ approver: f.agent.publicKey, vault: f.vault, payeeTokenAccount: tokenAccount })
        .signers([f.agent])
        .rpc(),
      "Unauthorized",
    );
  });

  it("kill switch: approver disables → AgentDisabled; only admin re-enables", async () => {
    await expectCode(setAgentEnabled(f, false, f.agent), "Unauthorized");
    await setAgentEnabled(f, false, f.approver2);
    await expectCode(propose(f, 500_000), "AgentDisabled");
    await expectCode(setAgentEnabled(f, true, f.approver1), "Unauthorized");
    await setAgentEnabled(f, true, f.admin);
    await propose(f, 500_000);
  });

  it("initialize_vault with the agent as an approver → AgentCannotApprove", async () => {
    const admin = Keypair.generate();
    await fund(admin.publicKey);
    await expectCode(
      program.methods
        .initializeVault(admin.publicKey, [admin.publicKey], usd(1), usd(1), new BN(0))
        .accounts({ admin: admin.publicKey, mint: f.mint })
        .signers([admin])
        .rpc(),
      "AgentCannotApprove",
    );
  });
});

describe("policy_vault PayeeNotAllowed", () => {
  let f: Fixture;
  before(async () => {
    f = await makeVault(0);
  });

  /** Asserts the exact custom error: name PayeeNotAllowed, number 6003 (not AccountNotInitialized, 3012). */
  async function expectPayeeNotAllowed(p: Promise<unknown>) {
    try {
      await p;
    } catch (e: any) {
      const err = e?.error?.errorCode ?? anchor.AnchorError.parse(e?.logs ?? [])?.error.errorCode;
      assert.deepEqual({ code: err?.code, number: err?.number }, { code: "PayeeNotAllowed", number: 6003 });
      return;
    }
    assert.fail("expected PayeeNotAllowed, but the transaction succeeded");
  }

  it("wallet with no Payee account → PayeeNotAllowed (6003), not AccountNotInitialized", async () => {
    const stranger = await createAccount(conn, payer, f.mint, Keypair.generate().publicKey);
    await expectPayeeNotAllowed(propose(f, 500_000, payeePda(f.vault, stranger)));
  });

  it("a Payee registered to a different vault → PayeeNotAllowed", async () => {
    const other = await makeVault(0);
    await expectPayeeNotAllowed(propose(f, 500_000, other.payee));
  });

  it("a program account that isn't a Payee (the vault itself) → PayeeNotAllowed", async () => {
    await expectPayeeNotAllowed(propose(f, 500_000, f.vault));
  });
});

describe("policy_vault timelock", () => {
  it("proposing to a just-added payee → PayeeTimelocked", async () => {
    const f = await makeVault(60);
    await expectCode(propose(f, 500_000), "PayeeTimelocked");
  });
});
