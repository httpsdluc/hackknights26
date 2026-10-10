#!/usr/bin/env bash
# Builds (with the right platform-tools, see build.sh) and runs the program tests on a local validator.
# Needs keys/deployer.json: solana-keygen new --no-bip39-passphrase -o keys/deployer.json
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
scripts/build.sh
anchor test --skip-build
