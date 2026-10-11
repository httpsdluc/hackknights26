"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRightIcon, BotIcon, CrossIcon, ExternalIcon, ShieldIcon, WalletIcon } from "@/components/icons";
import { Button, ErrorBanner, LoadFailed, PageTitle, Panel, Pill, Skeleton } from "@/components/ui";
import { addPhishingPayee, fireCompromisedAgent, listRequests } from "@/lib/api";
import { errorSentence } from "@/lib/errors";
import { explorerTxUrl, REQUEST_TYPE_LABEL } from "@/lib/labels";
import { useLoad } from "@/lib/use-load";

// The toggle survives a trip to the Vault page (kill switch) and back. Per-tab convenience only.
const COMPROMISED_KEY = "cosign-attack-compromised";

/** mm:ss until a unix-seconds time, ticking every second; null once it has passed. */
function useCountdown(untilSecs: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (untilSecs === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [untilSecs]);
  if (untilSecs === null) return null;
  const left = Math.ceil(untilSecs - now / 1000);
  if (left <= 0) return null;
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

type Added = { kind: "added"; tx: string | null; activeAfter: number } | { kind: "blocked"; code: string } | { kind: "failed" };

type Outcome = { kind: "blocked"; code: string } | { kind: "accepted"; tx: string } | { kind: "failed" };

function Node({ icon, label, tone }: { icon: React.ReactNode; label: string; tone: "idle" | "bad" | "guard" }) {
  const style = {
    idle: "border-strong bg-paper text-muted",
    bad: "border-dispute bg-dispute-bg text-dispute",
    guard: "border-action bg-paper text-action",
  }[tone];
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-control border px-3 py-2 text-small font-medium transition-colors duration-300 ${style}`}>
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

/** Agent → vault program → wallet. Shows where the payment stopped. */
function Path({ compromised, outcome }: { compromised: boolean; outcome: Outcome | null }) {
  const blocked = outcome?.kind === "blocked";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2" aria-hidden="true">
      <Node icon={<BotIcon />} label={compromised ? "Compromised agent" : "Agent"} tone={compromised ? "bad" : "idle"} />
      <ArrowRightIcon className={`h-5 w-5 ${outcome ? "text-ink" : "text-strong"}`} />
      <Node icon={<ShieldIcon />} label="Vault program" tone={outcome ? "guard" : "idle"} />
      {blocked ? <CrossIcon className="h-5 w-5 animate-pop text-dispute" /> : <ArrowRightIcon className="h-5 w-5 text-strong" />}
      <Node icon={<WalletIcon />} label="Attacker's wallet" tone="idle" />
    </div>
  );
}

export default function AttackLabPage() {
  const { state, retry } = useLoad(listRequests);
  const [compromised, setCompromisedState] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<Added | null>(null);
  const countdown = useCountdown(added?.kind === "added" ? added.activeAfter : null);

  useEffect(() => {
    try {
      setCompromisedState(sessionStorage.getItem(COMPROMISED_KEY) === "on");
    } catch {
      // storage unavailable: the toggle just starts off
    }
  }, []);

  function setCompromised(on: boolean) {
    setCompromisedState(on);
    try {
      sessionStorage.setItem(COMPROMISED_KEY, on ? "on" : "off");
    } catch {
      // storage unavailable
    }
  }

  async function addPayee() {
    setAdding(true);
    setAdded(null);
    try {
      const r = await addPhishingPayee();
      setAdded(r.ok ? { kind: "added", tx: r.tx, activeAfter: r.active_after } : { kind: "blocked", code: r.error_code });
    } catch {
      setAdded({ kind: "failed" });
    } finally {
      setAdding(false);
    }
  }
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [shot, setShot] = useState(0);
  const inFlight = useRef(false);
  const toggleId = useId();

  // The phishing email is the request that isn't a margin call or loan draw.
  const target =
    state.status === "ready"
      ? (state.data.find((r) => r.type === "payment_instruction_change") ?? state.data.find((r) => r.type === "other") ?? null)
      : null;

  async function fire() {
    if (!target || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setOutcome(null);
    try {
      const result = await fireCompromisedAgent(target.id);
      setOutcome(result.ok ? { kind: "accepted", tx: result.tx } : { kind: "blocked", code: result.error_code });
    } catch {
      setOutcome({ kind: "failed" });
    } finally {
      setShot((n) => n + 1);
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <PageTitle>Attack lab</PageTitle>
      <div className="mt-3 grid grid-cols-1 items-start gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
        <Panel className={`overflow-hidden transition-colors duration-300 ${compromised ? "border-dispute" : ""}`}>
          <div aria-hidden="true" className={`h-1.5 transition-opacity duration-300 ${compromised ? "hazard-edge opacity-100" : "opacity-0"}`} />
          <div className="p-5 pt-3.5">
            <h2 className="text-heading font-semibold">Simulate a hacked agent</h2>
            <p className="mt-1 text-small text-muted">
              With the switch on, the agent skips every check and proposes the phishing payment anyway. Only the vault
              program on Solana can stop it.
            </p>

            <label htmlFor={toggleId} className="mt-4 flex min-h-11 items-center gap-3 font-medium">
              <span className="relative inline-flex h-7 w-12 shrink-0 items-center">
                <input
                  id={toggleId}
                  type="checkbox"
                  role="switch"
                  checked={compromised}
                  disabled={pending}
                  onChange={(e) => setCompromised(e.target.checked)}
                  className="peer absolute inset-0 h-full w-full appearance-none rounded-full border border-strong bg-ground transition-colors duration-200 checked:border-dispute checked:bg-dispute"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1 h-5 w-5 rounded-full border border-strong bg-paper transition-transform duration-200 peer-checked:translate-x-5 peer-checked:border-paper"
                />
              </span>
              Compromised agent
              <Pill tone={compromised ? "dispute" : "neutral"}>{compromised ? "On" : "Off"}</Pill>
            </label>

            <div className="mt-3 border-t border-hairline pt-3 text-small">
              <p className="text-muted">Phishing request</p>
              {state.status === "loading" ? <Skeleton className="mt-1 h-5 w-48" /> : null}
              {state.status === "error" ? <LoadFailed what="the requests" detail={state.detail} onRetry={retry} /> : null}
              {state.status === "ready" && target ? (
                <p className="break-all">
                  {REQUEST_TYPE_LABEL[target.type]} · <span className="font-mono">{target.id}</span>
                </p>
              ) : null}
              {state.status === "ready" && !target ? <p className="text-dispute">No phishing request is in the inbox.</p> : null}
            </div>

            <Button variant="danger" className="mt-4 w-full" disabled={!compromised || !target || pending} pending={pending} onClick={fire}>
              {pending ? "Firing..." : "Fire phishing payment"}
            </Button>
            {!compromised ? (
              <p className="mt-2 text-small text-muted">Turn on &quot;Compromised agent&quot; to arm this button.</p>
            ) : null}

            <div className="mt-5 border-t border-hairline pt-4">
              <h2 className="text-heading font-semibold">Phish an approver too</h2>
              <p className="mt-1 text-small text-muted">
                The attacker tricks an approver into adding the new wallet as a payee. The vault starts a waiting period before
                it can be paid (60 seconds here, 72 hours in production). Then fire again.
              </p>
              <Button variant="secondary" className="mt-3 w-full" disabled={adding} pending={adding} onClick={addPayee}>
                {adding ? "Adding..." : "Approver adds the new wallet"}
              </Button>
              <div aria-live="polite" className="mt-2 text-small">
                {added?.kind === "added" ? (
                  <p className="flex flex-wrap items-center gap-2">
                    <Pill tone="held">{countdown ? `Payable in ${countdown}` : "Waiting period over"}</Pill>
                    <span className="text-muted">
                      {added.tx ? "Added to the allowlist on Solana." : "Already on the allowlist."}
                    </span>
                    {added.tx ? (
                      <a
                        href={explorerTxUrl(added.tx)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-action underline underline-offset-4 hover:text-action-hover"
                      >
                        View
                        <ExternalIcon className="h-3 w-3" />
                        <span className="sr-only">transaction on Solana Explorer (opens in a new tab)</span>
                      </a>
                    ) : null}
                  </p>
                ) : null}
                {added?.kind === "blocked" ? <ErrorBanner code={added.code} /> : null}
                {added?.kind === "failed" ? <ErrorBanner message="The server didn't answer. Try again." /> : null}
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          key={shot}
          className={`flex min-h-[380px] min-w-0 flex-col gap-8 p-8 ${outcome?.kind === "blocked" ? "animate-flash border-dispute" : ""}`}
        >
          <Path compromised={compromised} outcome={outcome} />

          <div aria-live="assertive" className="flex flex-1 flex-col justify-center">
            {outcome === null ? (
              <p className="text-muted">{pending ? "Waiting for the vault program..." : "The vault program's answer will show here."}</p>
            ) : null}

            {outcome?.kind === "blocked" ? (
              <>
                <div>
                  <Pill tone="dispute">
                    <CrossIcon className="h-3.5 w-3.5" />
                    Blocked by rule
                  </Pill>
                </div>
                <p className="mt-3 origin-left animate-slam font-mono text-code-xl font-medium text-dispute [overflow-wrap:anywhere]">
                  {/* Wrap only between words of the code ("Payee|Not|Allowed"), never mid-word. */}
                  {outcome.code.split(/(?=[A-Z])/).map((part, i) => (
                    <span key={i}>
                      {i > 0 ? <wbr /> : null}
                      {part}
                    </span>
                  ))}
                </p>
                {errorSentence(outcome.code) ? <p className="mt-2 text-heading">{errorSentence(outcome.code)}</p> : null}
                <p className="mt-1 text-muted">No money moved. The agent&apos;s key alone can never release a payment.</p>
              </>
            ) : null}

            {outcome?.kind === "accepted" ? (
              <>
                <div>
                  <Pill tone="held">Held for approval</Pill>
                </div>
                <p className="mt-3 text-heading">
                  The vault accepted this proposal. It still can&apos;t be released without human approvals.
                </p>
                <a
                  href={explorerTxUrl(outcome.tx)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 font-medium text-action underline underline-offset-4 hover:text-action-hover"
                >
                  View transaction on Solana Explorer
                  <ExternalIcon className="h-3.5 w-3.5" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </>
            ) : null}

            {outcome?.kind === "failed" ? <ErrorBanner message="The server didn't answer. Try again." /> : null}
          </div>
        </Panel>
      </div>
    </>
  );
}
