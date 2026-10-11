// chain/client.ts against a local validator, called the way server/ calls it.
// Sets up a throwaway vault, writes test keypairs to a temp dir and points the client at them.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import idl from "../target/idl/policy_vault.json" with { type: "json" };
import registry from "../server/stubs/fixtures/registry.json" with { type: "json" };
import attack from "../server/stubs/fixtures/attack.json" with { type: "json" };
import type { PolicyVault } from "../target/types/policy_vault.ts";

const { AnchorProvider, BN, Program } = anchor;
// "confirmed" to match the client; with the default "processed", the client can read
// before the setup transactions are confirmed and see no payee yet.
const envProvider = AnchorProvider.env();
const provider = new AnchorProvider(
  new Connection(envProvider.connection.rpcEndpoint, "confirmed"),
  envProvider.wallet,
  { commitment: "confirmed", preflightCommitment: "confirmed" },
);
const program = new Program<PolicyVault>(idl as PolicyVault, provider);
const conn = provider.connection;
const payer = (provider.wallet as anchor.Wallet).payer;
const usd = (n: number) => new BN((BigInt(n) * 1_000_000n).toString());
const HASH = "ab".repeat(32);

let client: typeof import("../chain/client.ts");
let pbxAta: PublicKey;

async function expectCode(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: any) => {
    assert.equal(e.code, code);
    return true;
  });
}

describe("chain/client.ts", () => {
  before(async () => {
    const keys = { admin: Keypair.generate(), agent: Keypair.generate(), approver1: Keypair.generate(), approver2: Keypair.generate() };
    const tx = new Transaction();
    for (const k of Object.values(keys)) {
      tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: k.publicKey, lamports: 2 * LAMPORTS_PER_SOL }));
    }
    await provider.sendAndConfirm(tx);

    const mint = await createMint(conn, payer, payer.publicKey, null, 6);
    const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), keys.admin.publicKey.toBuffer()], program.programId)[0];
    await program.methods
      .initializeVault(keys.agent.publicKey, [keys.approver1.publicKey, keys.approver2.publicKey], usd(1_000_000), usd(5_000_000), new BN(0))
      .accounts({ admin: keys.admin.publicKey, mint })
      .signers([keys.admin])
      .rpc();
    await mintTo(conn, payer, mint, getAssociatedTokenAddressSync(mint, vault, true), payer, 10_000_000n * 1_000_000n);

    // Register pbx from the registry, by its wallet's associated token account.
    const pbx = registry.counterparties.find((c) => c.id === "pbx")!;
    pbxAta = await createAssociatedTokenAccount(conn, payer, mint, new PublicKey(pbx.wallet));
    const label = Buffer.alloc(32);
    label.write(pbx.name);
    await program.methods
      .addPayee([...label], usd(3_000_000))
      .accounts({ approver: keys.approver1.publicKey, vault, payeeTokenAccount: pbxAta })
      .signers([keys.approver1])
      .rpc();

    // Throwaway test keypairs + deployment file in a temp dir (never the real keys/).
    const dir = mkdtempSync(path.join(tmpdir(), "cosign-client-test-"));
    for (const [name, kp] of Object.entries(keys)) writeFileSync(path.join(dir, `${name}.json`), JSON.stringify([...kp.secretKey]));
    const deployment = { programId: program.programId.toBase58(), admin: keys.admin.publicKey.toBase58(), vault: vault.toBase58(), mint: mint.toBase58() };
    writeFileSync(path.join(dir, "deployment.json"), JSON.stringify(deployment));
    process.env.COSIGN_KEYS_DIR = dir;
    process.env.COSIGN_DEPLOYMENT = path.join(dir, "deployment.json");
    process.env.SOLANA_RPC_URL = conn.rpcEndpoint;

    client = await import("../chain/client.ts");
  });

  it("proposePayment($1.9M) → approve ×2 → execute pays pbx 1,900,000 USDC", async () => {
    const before = (await getAccount(conn, pbxAta)).amount;
    const { proposalId, tx } = await client.proposePayment({ counterpartyId: "pbx", amountUsd: 1_900_000, kind: "margin_call", evidenceHash: HASH });
    assert.ok(tx && proposalId);
    await client.approve(proposalId, "approver1");
    await client.approve(proposalId, "approver2");
    await client.execute(proposalId);
    assert.equal((await getAccount(conn, pbxAta)).amount, before + 1_900_000n * 1_000_000n);
  });

  it("errors carry the plain error name in .code", async () => {
    const { proposalId } = await client.proposePayment({ counterpartyId: "pbx", amountUsd: 1_900_000, kind: "margin_call", evidenceHash: HASH });
    await expectCode(client.execute(proposalId), "NotEnoughApprovals");
    await expectCode(client.approve(proposalId, "agent"), "Unauthorized");
    await client.approve(proposalId, "approver1");
    await expectCode(client.approve(proposalId, "approver1"), "AlreadyApproved");
  });

  it("proposePaymentToWallet to the phishing wallet → PayeeNotAllowed", async () => {
    await expectCode(
      client.proposePaymentToWallet({ wallet: attack.phishing_wallet, amountUsd: 2_000_000, kind: "other", evidenceHash: HASH }),
      "PayeeNotAllowed",
    );
  });

  it("setAgentEnabled(false) blocks the agent with AgentDisabled; setAgentEnabled(true) restores it", async () => {
    await client.setAgentEnabled(false);
    assert.equal((await client.getVaultState()).rules.agent_enabled, false);
    await expectCode(
      client.proposePayment({ counterpartyId: "pbx", amountUsd: 100_000, kind: "margin_call", evidenceHash: HASH }),
      "AgentDisabled",
    );
    await client.setAgentEnabled(true);
    assert.equal((await client.getVaultState()).rules.agent_enabled, true);
  });

  it("getVaultState returns USD figures and the registered payee", async () => {
    const s = await client.getVaultState();
    assert.equal(s.rules.large_amount_usd, 1_000_000);
    assert.equal(s.balances.vault_usd, 10_000_000 - 1_900_000);
    assert.deepEqual(s.payees.map((p) => p.counterparty_id), ["pbx"]);
    assert.equal(s.payees[0]!.label, "Prime Broker X");
  });
});
