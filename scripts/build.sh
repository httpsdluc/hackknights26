#!/usr/bin/env bash
# Builds policy_vault and refreshes chain/idl.json.
# Uses platform-tools v1.52 because anchor-spl 0.31's dependency tree needs Cargo >= 1.85
# (edition2024); the Solana CLI's default platform-tools ship an older Cargo.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
anchor build --no-idl -- --tools-version v1.52
mkdir -p target/idl target/types
anchor idl build -o target/idl/policy_vault.json -t target/types/policy_vault.ts
cp target/idl/policy_vault.json chain/idl.json
echo "built; IDL copied to chain/idl.json"
