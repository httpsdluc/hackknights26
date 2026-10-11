// Fresh demo vault so the stories can be re-run: new admin keypair → new vault PDA, new Test USDC
// mint, $10,000,000 in the vault, payees pbx + aby only (60s timelock), chain/deployment.json rewritten.
// The agent and approver keys are reused, so the server and teammates' copies keep working.
// The old admin key is kept as keys/admin-<timestamp>.json (not deleted); its leftover SOL goes back
// to the deployer. Does not redeploy the program.
//
// Run:  node scripts/reset-demo.ts      (then wait 60s for the payee timelock before Story 1)
// Env: SOLANA_RPC_URL, COSIGN_KEYS_DIR, COSIGN_DEPLOYMENT (same as setup-devnet.ts).
import { existsSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { keysDir, loadOrCreateKey, rpcUrl, setupVault } from "./setup-devnet.ts";

async function main() {
  console.log(`RPC: ${rpcUrl()}`);
  const conn = new Connection(rpcUrl(), "confirmed");
  const deployer = loadOrCreateKey("deployer");

  const adminFile = path.join(keysDir(), "admin.json");
  if (existsSync(adminFile)) {
    const old = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(adminFile, "utf8"))));
    const lamports = (await conn.getBalance(old.publicKey)) - 5000; // leave the fee
    if (lamports > 0) {
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: old.publicKey, toPubkey: deployer.publicKey, lamports }),
      );
      await sendAndConfirmTransaction(conn, tx, [old], { commitment: "confirmed" });
    }
    const archived = path.join(keysDir(), `admin-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    renameSync(adminFile, archived);
    console.log(`Old admin ${old.publicKey.toBase58()} archived as ${path.basename(archived)}`);
  }

  await setupVault(loadOrCreateKey("admin"), deployer);
  console.log("\nWait 60s (payee timelock) before running Story 1.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
