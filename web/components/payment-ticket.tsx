"use client";

import { useId, useRef, useState } from "react";
import type { Proposal, ProposeResult, Request as CosignRequest } from "../../shared/types.ts";
import { approveProposal, executeProposal, proposePayment } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import { DEMO_SIGNERS, counterpartyLabel, explorerTxUrl } from "@/lib/labels";
import { useCountUp } from "@/lib/use-count-up";
import { CheckIcon, ExternalIcon } from "./icons";
import { ProposalPill } from "./result";
import { Button, ErrorBanner } from "./ui";

type Action = "propose" | "approve" | "execute";
type Failure = { code: string } | { message: string };

const DONE_LABEL: Record<Action, string> = {
  propose: "Payment proposed",
  approve: "Approval recorded",
  execute: "Payment released",
};

function ExplorerLink({ tx, children, className = "" }: { tx: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={explorerTxUrl(tx)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center gap-1.5 font-medium text-action underline decoration-action/40 underline-offset-4 transition-colors duration-150 hover:text-action-hover hover:decoration-action-hover ${className}`}
    >
      {children}
      <ExternalIcon className="h-3.5 w-3.5" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** Checked → Proposed → Approved → Released. Blue marks a completed step. */
function Steps({ proposal, rejected }: { proposal: Proposal | null; rejected: boolean }) {
  const steps = [
    { label: rejected ? "Rejected" : "Checked", done: !rejected },
    { label: "Proposed", done: proposal !== null },
    { label: "Approved", done: proposal !== null && proposal.approvals >= proposal.required },
    { label: "Released", done: proposal?.executed === true },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="mt-3 grid grid-cols-4" aria-label="Payment progress">
      {steps.map((s, i) => (
        <li key={i} className="relative flex flex-col items-center gap-1 text-center" aria-current={i === current ? "step" : undefined}>
          {i > 0 ? (
            <span aria-hidden="true" className="absolute right-1/2 top-[9px] h-0.5 w-full bg-hairline">
              {s.done ? <span className="block h-full origin-left animate-draw bg-action" /> : null}
            </span>
          ) : null}
          <span
            className={`relative z-[1] flex h-5 w-5 items-center justify-center rounded-full border-2 ${
              s.done ? "border-action bg-action text-paper" : i === current ? "border-action bg-paper" : "border-strong bg-paper"
            }`}
          >
            {s.done ? <CheckIcon className="h-3 w-3 animate-pop" /> : null}
          </span>
          <span className={`text-fine ${s.done || i === current ? "font-medium text-ink" : "text-muted"}`}>
            {s.label}
            <span className="sr-only">{s.done ? " (done)" : ""}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function PaymentTicket({ request, onChanged }: { request: CosignRequest; onChanged: () => Promise<void> }) {
  const { verification, proposal } = request;
  const [pending, setPending] = useState<Action | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [signer, setSigner] = useState<string>(DEMO_SIGNERS[0].value);
  const [sessionLog, setSessionLog] = useState<{ action: Action; tx: string }[]>([]);
  const inFlight = useRef(false);
  const signerId = useId();
  const shownAmount = useCountUp(verification.verified_usd);
  // Twelve-figure sums drop a size so they stay inside the ticket.
  const headline = formatUsd(verification.verified_usd);

  async function run(action: Action, send: () => Promise<ProposeResult>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(action);
    setFailure(null);
    try {
      const result = await send();
      if (result.ok) {
        setSessionLog((log) => [...log, { action, tx: result.tx }]);
        if (action === "approve") {
          const next = DEMO_SIGNERS.find((s) => s.value !== signer);
          if (next) setSigner(next.value);
        }
      } else {
        setFailure({ code: result.error_code });
      }
    } catch {
      setFailure({ message: "The server didn't answer, so this may not have gone through. Check the status below before trying again." });
    }
    try {
      // Show what the server now says, not what we assume happened.
      await onChanged();
    } catch {
      setFailure((f) => f ?? { message: "Couldn't refresh this payment. The status shown may be out of date." });
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  const busy = pending !== null;
  const rejected = verification.status === "rejected";
  const missing = proposal ? proposal.required - proposal.approvals : 0;
  const fullyApproved = proposal !== null && missing <= 0;

  return (
    <section className="relative rounded-panel border border-hairline bg-paper shadow-raised">
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-heading font-semibold">Payment ticket</h2>
          <ProposalPill proposal={proposal} />
        </div>

        <p className="mt-1 text-small text-muted">
          Amount Cosign agrees to pay · requested <span className="tabular-nums">{formatUsd(request.amount_requested_usd)}</span>
        </p>
        <p
          className={`break-all font-serif tracking-[-0.02em] ${headline.length > 13 ? "text-title" : "text-amount"}`}
          aria-label={headline}
        >
          <span aria-hidden="true" className="tabular-nums">
            {formatUsd(shownAmount)}
          </span>
        </p>

        <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-small">
          <dt className="text-muted">Payee</dt>
          <dd className="min-w-0 truncate font-medium">{counterpartyLabel(request.counterparty_id)}</dd>
          <dt className="text-muted">Rule</dt>
          <dd>
            {proposal
              ? `Needs ${proposal.required} ${proposal.required === 1 ? "approval" : "approvals"} before release`
              : "Set by the vault when the payment is proposed"}
          </dd>
        </dl>

        <Steps proposal={proposal} rejected={rejected} />
      </div>

      {/* Perforation: the stub above, the signatures below. */}
      <div aria-hidden="true" className="relative mt-3 border-t border-dashed border-strong">
        <span className="absolute -left-px top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline bg-ground [clip-path:inset(0_0_0_50%)]" />
        <span className="absolute -right-px top-0 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full border border-hairline bg-ground [clip-path:inset(0_50%_0_0)]" />
      </div>

      <div className="px-5 pb-5 pt-3">
        {failure ? (
          <div className="mb-3">
            <ErrorBanner {...failure} />
          </div>
        ) : null}

        {proposal ? (
          <>
            <p className="font-medium">
              Approvals{" "}
              <span className="tabular-nums">
                {proposal.approvals}/{proposal.required}
              </span>
            </p>
            <ol className="mt-1 max-h-40 overflow-y-auto">
              {Array.from({ length: Math.max(0, Math.min(proposal.required, 12)) }, (_, i) =>
                i < proposal.approvals ? (
                  <li key={`signed-${i}`} className="relative flex min-h-10 flex-wrap items-center gap-2 py-1 text-action">
                    <CheckIcon className="h-4 w-4 animate-pop" />
                    <span className="font-medium">Approved</span>
                    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px origin-left animate-draw bg-ink" />
                  </li>
                ) : (
                  <li key={`open-${i}`} className="flex min-h-10 items-center border-b border-dashed border-strong py-1 text-muted">
                    Awaiting approval
                  </li>
                ),
              )}
            </ol>
          </>
        ) : null}

        <div className={`flex flex-col gap-2 ${proposal ? "mt-4" : ""}`}>
          {!proposal ? (
            <>
              <Button
                disabled={busy || rejected}
                pending={pending === "propose"}
                onClick={() => run("propose", () => proposePayment(request.id))}
              >
                {pending === "propose" ? "Proposing..." : "Propose payment"}
              </Button>
              {rejected ? (
                <p className="text-small text-muted">Cosign rejected this request, so there is nothing to propose.</p>
              ) : null}
            </>
          ) : null}

          {proposal && !proposal.executed ? (
            <>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={signerId} className="block text-small text-muted">
                    Approve as
                  </label>
                  <select
                    id={signerId}
                    value={signer}
                    disabled={busy}
                    onChange={(e) => setSigner(e.target.value)}
                    className="min-h-11 w-full rounded-control border border-strong bg-paper px-3 transition-colors duration-150 hover:border-action disabled:text-muted"
                  >
                    {DEMO_SIGNERS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant={fullyApproved ? "secondary" : "primary"}
                  disabled={busy}
                  pending={pending === "approve"}
                  onClick={() => run("approve", () => approveProposal(proposal.id, signer))}
                >
                  {pending === "approve" ? "Approving..." : "Approve"}
                </Button>
              </div>
              <Button
                disabled={busy || !fullyApproved}
                pending={pending === "execute"}
                onClick={() => run("execute", () => executeProposal(proposal.id))}
              >
                {pending === "execute" ? "Releasing..." : "Release payment"}
              </Button>
              {!fullyApproved ? (
                <p className="text-small text-muted">
                  Release is locked: needs {missing} more {missing === 1 ? "approval" : "approvals"}.
                </p>
              ) : null}
            </>
          ) : null}

          {proposal?.executed ? (
            <div className="animate-pop rounded-control border border-agree bg-agree-bg px-3 py-2 text-agree">
              <p className="flex items-center gap-2 font-semibold">
                <CheckIcon /> Released
              </p>
              <p className="text-small">The vault paid this on Solana after every required approval.</p>
              {proposal.tx ? <ExplorerLink tx={proposal.tx}>View payment on Solana Explorer</ExplorerLink> : null}
            </div>
          ) : null}
        </div>

        <h3 className="mt-5 border-t border-hairline pt-4 font-semibold">Audit trail</h3>
        {sessionLog.length > 0 ? (
          <ol className="mt-1 text-small">
            {sessionLog.map((entry, i) => (
              <li key={i} className="flex animate-rise items-center justify-between gap-3">
                <span>{DONE_LABEL[entry.action]}</span>
                <ExplorerLink tx={entry.tx}>
                  <span className="font-mono">{entry.tx.slice(0, 8)}…</span>
                </ExplorerLink>
              </li>
            ))}
          </ol>
        ) : null}
        <p className="mt-1 text-small text-muted">
          {sessionLog.length > 0 ? "Only actions taken in this browser tab are listed." : "No on-chain actions yet."}
        </p>
      </div>
    </section>
  );
}
