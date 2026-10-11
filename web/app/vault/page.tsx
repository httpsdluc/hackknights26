"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { VaultPayee } from "../../../shared/types.ts";
import { CheckIcon, ClockIcon, ExternalIcon } from "@/components/icons";
import { ErrorBanner, LoadFailed, PageTitle, Panel, Pill, Skeleton, Usd } from "@/components/ui";
import { getVault, setKillSwitch } from "@/lib/api";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/labels";
import { useLoad } from "@/lib/use-load";

/** Current time in ms, ticking once a second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function shortWallet(wallet: string): string {
  return wallet.length > 12 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
}

function countdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PayeeRow({ payee, now }: { payee: VaultPayee; now: number }) {
  // active_after is unix SECONDS (CONTRACT.md §4).
  const remaining = payee.active_after * 1000 - now;
  return (
    <tr className="border-t border-hairline">
      <td className="py-3 pr-3">
        <p className="font-medium">{payee.label}</p>
        {payee.counterparty_id === null ? <p className="text-small text-dispute">Not in registry</p> : null}
      </td>
      <td className="py-3 pr-3">
        {payee.wallet ? (
          <a
            href={explorerAddressUrl(payee.wallet)}
            target="_blank"
            rel="noopener noreferrer"
            title={payee.wallet}
            className="inline-flex min-h-11 items-center gap-1 font-mono text-small text-action underline underline-offset-4 hover:text-action-hover"
          >
            {shortWallet(payee.wallet)}
            <ExternalIcon className="h-3 w-3" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="py-3 pr-3 text-right">
        <Usd amount={payee.per_tx_limit_usd} />
      </td>
      <td className="py-3 text-right">
        {remaining > 0 ? (
          <Pill tone="held">
            <ClockIcon className="h-3.5 w-3.5" />
            Timelocked <span className="tabular-nums">{countdown(remaining)}</span>
          </Pill>
        ) : (
          <Pill tone="agree">
            <CheckIcon className="h-3.5 w-3.5" />
            Active
          </Pill>
        )}
      </td>
    </tr>
  );
}

export default function VaultPage() {
  const { state, reload, retry } = useLoad(getVault);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ code?: string; message?: string; tx?: string } | null>(null);
  const inFlight = useRef(false);
  const toggleId = useId();

  const vault = state.status === "ready" ? state.data : null;
  const anyLocked = vault?.payees.some((p) => p.active_after * 1000 > Date.now()) ?? false;
  const now = useNow(anyLocked);

  // Kill switch ON means agent_enabled is false. POST { enabled } means AGENT enabled (CONTRACT.md §4).
  const killOn = vault ? !vault.rules.agent_enabled : false;

  async function toggleKill(nextKillOn: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setResult(null);
    try {
      const res = await setKillSwitch(!nextKillOn);
      setResult(res.ok ? { tx: res.tx } : { code: res.error_code });
      await reload();
    } catch {
      setResult({ message: "The server didn't answer. Try again." });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <PageTitle>Vault</PageTitle>

      {state.status === "error" ? (
        <Panel className="mt-3">
          <LoadFailed what="the vault" detail={state.detail} onRetry={retry} />
        </Panel>
      ) : null}

      <div className="mt-3 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4 p-5">
            <div>
              <p className="text-small text-muted">Vault balance</p>
              {vault ? <Usd amount={vault.balances.vault_usd} className="text-title" /> : <Skeleton className="mt-2 h-8 w-40" />}
            </div>
            <div>
              <p className="text-small text-muted">Large payment from</p>
              {vault ? <Usd amount={vault.rules.large_amount_usd} className="text-title" /> : <Skeleton className="mt-2 h-8 w-32" />}
            </div>
            <div>
              <p className="text-small text-muted">Approvals required</p>
              {vault ? (
                <p className="text-body">
                  <span className="text-title tabular-nums">{vault.rules.approvals_required_large}</span> large ·{" "}
                  <span className="text-title tabular-nums">{vault.rules.approvals_required_small}</span> small
                </p>
              ) : (
                <Skeleton className="mt-2 h-8 w-32" />
              )}
            </div>
          </Panel>

          <Panel className="min-w-0 p-5">
            <h2 className="text-heading font-semibold">Allowlisted payees</h2>
            <p className="mt-1 text-small text-muted">
              A new payee can&apos;t be paid until its waiting period ends
              {vault ? ` (${vault.rules.payee_timelock_secs} seconds)` : ""}.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead>
                  <tr className="text-small text-muted">
                    <th className="pb-2 pr-3 font-medium">Payee</th>
                    <th className="pb-2 pr-3 font-medium">Wallet</th>
                    <th className="pb-2 pr-3 text-right font-medium">Per-payment limit</th>
                    <th className="pb-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vault
                    ? vault.payees.map((p, i) => <PayeeRow key={p.wallet ?? `${p.label}-${i}`} payee={p} now={now} />)
                    : [0, 1].map((i) => (
                        <tr key={i} className="border-t border-hairline">
                          <td colSpan={4} className="py-3">
                            <Skeleton className="h-5 w-full" />
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel className={`overflow-hidden p-5 ${killOn ? "border-dispute" : ""}`}>
          <h2 className="text-heading font-semibold">Kill switch</h2>
          <p className="mt-1 text-small text-muted">
            Stops the agent from proposing any payment. Payments already proposed still need human approvals.
          </p>

          <label htmlFor={toggleId} className="mt-5 flex min-h-11 items-center gap-4 text-heading font-semibold">
            <span className="relative inline-flex h-12 w-20 shrink-0 items-center">
              <input
                id={toggleId}
                type="checkbox"
                role="switch"
                aria-label="Kill switch: stop the agent"
                checked={killOn}
                disabled={!vault || pending}
                onChange={(e) => toggleKill(e.target.checked)}
                className="peer absolute inset-0 h-full w-full appearance-none rounded-full border-2 border-dispute bg-dispute-bg transition-colors duration-200 checked:bg-dispute disabled:opacity-60"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1.5 h-9 w-9 rounded-full border border-dispute bg-paper transition-transform duration-200 peer-checked:translate-x-8"
              />
            </span>
            <span className={killOn ? "text-dispute" : ""}>{pending ? "Sending..." : killOn ? "Agent stopped" : "Agent running"}</span>
          </label>

          <div aria-live="polite" className="mt-4">
            {result?.code || result?.message ? <ErrorBanner code={result.code} message={result.message} /> : null}
            {result?.tx ? (
              <a
                href={explorerTxUrl(result.tx)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 font-medium text-action underline underline-offset-4 hover:text-action-hover"
              >
                View transaction on Solana Explorer
                <ExternalIcon className="h-3.5 w-3.5" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        </Panel>
      </div>
    </>
  );
}
