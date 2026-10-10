"use client";

import { useId, useRef, useState } from "react";
import { Button, ErrorBanner, LoadFailed, PageTitle, Panel, Pill, Skeleton } from "@/components/ui";
import { fireCompromisedAgent, listRequests } from "@/lib/api";
import { errorSentence } from "@/lib/errors";
import { explorerTxUrl, REQUEST_TYPE_LABEL } from "@/lib/labels";
import { useLoad } from "@/lib/use-load";

type Outcome = { kind: "blocked"; code: string } | { kind: "accepted"; tx: string } | { kind: "failed" };

export default function AttackLabPage() {
  const { state, retry } = useLoad(listRequests);
  const [compromised, setCompromised] = useState(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const inFlight = useRef(false);
  const toggleId = useId();

  // The phishing email is the request Cosign refuses to pay and that isn't a margin call or loan draw.
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
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <PageTitle>Attack lab</PageTitle>
      <div className="mt-4 grid grid-cols-[400px_minmax(0,1fr)] items-start gap-5">
        <Panel className="p-5">
          <h2 className="text-heading font-semibold">Simulate a hacked agent</h2>
          <p className="mt-1 text-small text-muted">
            With the switch on, the agent skips every check and proposes the phishing payment anyway. Only the vault
            program on Solana can stop it.
          </p>

          <label htmlFor={toggleId} className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 font-medium">
            <input
              id={toggleId}
              type="checkbox"
              role="switch"
              checked={compromised}
              disabled={pending}
              onChange={(e) => setCompromised(e.target.checked)}
              className="h-6 w-6 accent-dispute"
            />
            Compromised agent
            <Pill tone={compromised ? "dispute" : "neutral"}>{compromised ? "On" : "Off"}</Pill>
          </label>

          <div className="mt-3 border-t border-hairline pt-3 text-small">
            <p className="text-muted">Phishing request</p>
            {state.status === "loading" ? <Skeleton className="mt-1 h-5 w-48" /> : null}
            {state.status === "error" ? <LoadFailed what="the requests" onRetry={retry} /> : null}
            {state.status === "ready" && target ? (
              <p>
                {REQUEST_TYPE_LABEL[target.type]} · <span className="font-mono">{target.id}</span>
              </p>
            ) : null}
            {state.status === "ready" && !target ? <p className="text-dispute">No phishing request is in the inbox.</p> : null}
          </div>

          <Button variant="danger" className="mt-4 w-full" disabled={!compromised || !target || pending} onClick={fire}>
            {pending ? "Firing..." : "Fire phishing payment"}
          </Button>
          {!compromised ? (
            <p className="mt-2 text-small text-muted">Turn on &quot;Compromised agent&quot; to arm this button.</p>
          ) : null}
        </Panel>

        <Panel className="flex min-h-[360px] flex-col justify-center p-8" >
          <div aria-live="assertive">
            {outcome === null ? (
              <p className="text-muted">{pending ? "Waiting for the vault program..." : "The vault program's answer will show here."}</p>
            ) : null}

            {outcome?.kind === "blocked" ? (
              <>
                <Pill tone="dispute">Blocked by rule</Pill>
                <p className="mt-3 break-all font-mono text-code-xl font-medium text-dispute">{outcome.code}</p>
                {errorSentence(outcome.code) ? <p className="mt-2 text-heading">{errorSentence(outcome.code)}</p> : null}
              </>
            ) : null}

            {outcome?.kind === "accepted" ? (
              <>
                <Pill tone="held">Held for approval</Pill>
                <p className="mt-3 text-heading">
                  The vault accepted this proposal. It still can&apos;t be released without human approvals.
                </p>
                <a
                  href={explorerTxUrl(outcome.tx)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center font-medium text-action underline hover:text-action-hover"
                >
                  View transaction on Solana Explorer ↗
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
