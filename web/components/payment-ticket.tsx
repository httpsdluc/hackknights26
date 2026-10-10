"use client";

import { useId, useRef, useState } from "react";
import type { ProposeResult, Request as CosignRequest } from "../../shared/types.ts";
import { approveProposal, executeProposal, proposePayment } from "@/lib/api";
import { DEMO_SIGNERS, explorerTxUrl } from "@/lib/labels";
import { ProposalPill } from "./result";
import { Button, Check, ErrorBanner, Panel, Usd, Waiting } from "./ui";

type Action = "propose" | "approve" | "execute";
type Failure = { code: string } | { message: string };

const DONE_LABEL: Record<Action, string> = {
  propose: "Payment proposed",
  approve: "Approval recorded",
  execute: "Payment released",
};

function ExplorerLink({ tx, children }: { tx: string; children: React.ReactNode }) {
  return (
    <a
      href={explorerTxUrl(tx)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center font-medium text-action underline hover:text-action-hover"
    >
      {children}
    </a>
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
      // Show what the server now says, not what we assume happened.
      await onChanged();
    } catch {
      setFailure({ message: "The server didn't answer. Nothing was changed on screen; try again." });
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
    <Panel className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-heading font-semibold">Payment ticket</h2>
        <ProposalPill proposal={proposal} />
      </div>

      <p className="mt-1 text-small text-muted">
        Amount Cosign agrees to pay · requested <Usd amount={request.amount_requested_usd} />
      </p>
      <p className="font-serif text-amount">
        <Usd amount={verification.verified_usd} />
      </p>

      <dl className="mt-1 grid grid-cols-[96px_1fr] gap-y-1 text-small">
        <dt className="text-muted">Payee</dt>
        <dd className="flex items-center gap-2 whitespace-nowrap">
          <span className="font-mono">{request.counterparty_id}</span>
          <Waiting field="counterparty_name" />
        </dd>
        <dt className="text-muted">Approval rule</dt>
        <dd>
          {proposal
            ? `Needs ${proposal.required} ${proposal.required === 1 ? "approval" : "approvals"} before release`
            : "Set by the vault when the payment is proposed"}
        </dd>
      </dl>

      {failure ? (
        <div className="mt-3">
          <ErrorBanner {...failure} />
        </div>
      ) : null}

      {proposal ? (
        <>
          <p className="mt-3 font-medium">
            Approvals{" "}
            <span className="tabular-nums">
              {proposal.approvals}/{proposal.required}
            </span>
          </p>
          <ol className="mt-1">
            {Array.from({ length: proposal.required }, (_, i) =>
              i < proposal.approvals ? (
                <li key={i} className="flex min-h-10 flex-wrap items-center gap-2 border-b border-ink py-1 text-action">
                  <Check />
                  <span className="font-medium">Approved</span>
                  <Waiting field="approved_by" />
                </li>
              ) : (
                <li key={i} className="flex min-h-10 items-center border-b border-dashed border-strong py-1 text-muted">
                  Awaiting approval
                </li>
              ),
            )}
          </ol>
        </>
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        {!proposal ? (
          <>
            <Button disabled={busy || rejected} onClick={() => run("propose", () => proposePayment(request.id))}>
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
              <div className="flex-1">
                <label htmlFor={signerId} className="block text-small text-muted">
                  Approve as
                </label>
                <select
                  id={signerId}
                  value={signer}
                  disabled={busy}
                  onChange={(e) => setSigner(e.target.value)}
                  className="min-h-11 w-full rounded-control border border-strong bg-paper px-3 disabled:text-muted"
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
                onClick={() => run("approve", () => approveProposal(proposal.id, signer))}
              >
                {pending === "approve" ? "Approving..." : "Approve"}
              </Button>
            </div>
            <Button disabled={busy || !fullyApproved} onClick={() => run("execute", () => executeProposal(proposal.id))}>
              {pending === "execute" ? "Releasing..." : "Release payment"}
            </Button>
            {!fullyApproved ? (
              <p className="text-small text-muted">
                Release is locked: needs {missing} more {missing === 1 ? "approval" : "approvals"}.
              </p>
            ) : null}
          </>
        ) : null}

        {proposal?.executed && proposal.tx ? (
          <ExplorerLink tx={proposal.tx}>View payment on Solana Explorer ↗</ExplorerLink>
        ) : null}
      </div>

      <h3 className="mt-5 border-t border-hairline pt-4 font-semibold">Audit trail</h3>
      {sessionLog.length > 0 ? (
        <ol className="mt-1 text-small">
          {sessionLog.map((entry, i) => (
            <li key={i} className="flex items-center justify-between gap-3">
              <span>{DONE_LABEL[entry.action]}</span>
              <ExplorerLink tx={entry.tx}>
                <span className="font-mono">{entry.tx.slice(0, 8)}…</span>
              </ExplorerLink>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="mt-1 text-small text-muted">
        {sessionLog.length > 0 ? "Only actions taken in this browser tab are listed. " : ""}
        <Waiting field="proposal events (action, actor, time, tx)" />
      </p>

      <h3 className="mt-5 border-t border-hairline pt-4 font-semibold">Vault limits</h3>
      <p className="mt-1">
        <Waiting field="GET /vault response shape" />
      </p>
    </Panel>
  );
}
