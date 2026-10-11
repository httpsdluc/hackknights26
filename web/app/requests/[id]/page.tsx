"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import type { EvidenceCheck, Request as CosignRequest, VerificationLine } from "../../../../shared/types.ts";
import { PaymentTicket } from "@/components/payment-ticket";
import { CheckIcon, CrossIcon } from "@/components/icons";
import { ResultPill } from "@/components/result";
import { Button, ErrorBanner, LoadFailed, PageTitle, Panel, Pill, Skeleton, Usd } from "@/components/ui";
import { getRequest, verifyEvidence } from "@/lib/api";
import { formatPercent, formatUsd } from "@/lib/format";
import { REQUEST_TYPE_LABEL, counterpartyLabel, loanCheckLabel } from "@/lib/labels";
import { disputeNotice } from "@/lib/notice";
import { useLoad } from "@/lib/use-load";

const TWO_COLUMNS = "grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-hairline p-5 last:border-b-0">
      <h2 className="text-heading font-semibold">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function LineResult({ line, request }: { line: VerificationLine; request: CosignRequest }) {
  if (line.ok) {
    return (
      <Pill tone="agree">
        <CheckIcon className="h-3.5 w-3.5" />
        Agree
      </Pill>
    );
  }
  // The contract gives one disputed total, not one per line. With a single disputed line the
  // total is that line's amount; with several we can't split it without doing money math here.
  const disputedLines = request.verification.lines.filter((l) => !l.ok).length;
  if (disputedLines === 1) {
    return (
      <Pill tone="dispute">
        <CrossIcon className="h-3.5 w-3.5" />
        Dispute <Usd amount={request.verification.disputed_usd} />
      </Pill>
    );
  }
  return (
    <Pill tone="dispute">
      <CrossIcon className="h-3.5 w-3.5" />
      Dispute
    </Pill>
  );
}

/** A haircut as a number plus a bar, so 15% vs 10% reads from the back of the room. A full bar is 25%. */
function Haircut({ fraction, tone }: { fraction: number; tone: "ink" | "dispute" }) {
  const width = `${Math.max(0, Math.min(1, fraction / 0.25)) * 100}%`;
  return (
    <span className="inline-flex flex-col gap-1">
      <span className={`font-semibold tabular-nums ${tone === "dispute" ? "text-dispute" : ""}`}>{formatPercent(fraction)}</span>
      <span aria-hidden="true" className="block h-1 w-20 overflow-hidden rounded-pill bg-hairline">
        <span
          className={`block h-full origin-left animate-draw rounded-pill ${tone === "dispute" ? "bg-dispute" : "bg-ink"}`}
          style={{ width }}
        />
      </span>
    </span>
  );
}

/** Requested, agreed and disputed, with a bar split in the same proportion (the browser sizes it). */
function Totals({ request }: { request: CosignRequest }) {
  const v = request.verification;
  return (
    <div className="mb-4">
      <dl className="flex flex-wrap gap-x-10 gap-y-1">
        <div>
          <dt className="text-small text-muted">Requested</dt>
          <dd className="text-heading"><Usd amount={request.amount_requested_usd} /></dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-small text-muted">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-agree" />
            Cosign agrees
          </dt>
          <dd className="text-heading font-semibold"><Usd amount={v.verified_usd} /></dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-small text-muted">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-dispute" />
            Cosign disputes
          </dt>
          <dd className="text-heading font-semibold"><Usd amount={v.disputed_usd} /></dd>
        </div>
      </dl>
      <div aria-hidden="true" className="mt-2 flex h-2 origin-left animate-draw gap-0.5 overflow-hidden rounded-pill bg-hairline">
        <span className="bg-agree" style={{ flexGrow: Math.max(0, v.verified_usd) }} />
        <span className="bg-dispute" style={{ flexGrow: Math.max(0, v.disputed_usd) }} />
      </div>
    </div>
  );
}

const TH = "whitespace-nowrap py-2 pr-3 font-normal";

/** One plain sentence per failed loan check, e.g. "only $3,000,000 of the commitment is left". */
function loanFailureReason(line: VerificationLine, request: CosignRequest): string {
  const check = line.instrument_id.split(":").pop();
  if (check === "REMAINING_COMMITMENT") {
    return `The draw is ${formatUsd(request.amount_requested_usd)}, but only ${formatUsd(line.market_value)} of the commitment is left (clause ${line.clause}).`;
  }
  if (check === "MIN_DRAW") return `The draw is below the ${formatUsd(line.market_value)} minimum (clause ${line.clause}).`;
  return `${loanCheckLabel(line.instrument_id)} check failed (clause ${line.clause}).`;
}

/** Loan draws arrive as the same line shape as margin calls, with the haircut fields unused. */
function LoanDrawLines({ request }: { request: CosignRequest }) {
  const failed = request.verification.lines.filter((l) => !l.ok);
  return (
    <>
      {failed.length > 0 ? (
        <div className="mb-3 rounded-control border border-dispute bg-dispute-bg px-3 py-2 text-dispute">
          {failed.map((l, i) => (
            <p key={i} className="font-medium">{loanFailureReason(l, request)}</p>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-strong text-small text-muted">
              <th scope="col" className={TH}>Check</th>
              <th scope="col" className={`${TH} text-right`}>Amount</th>
              <th scope="col" className={TH}>Clause</th>
              <th scope="col" className="whitespace-nowrap py-2 font-normal">Result</th>
            </tr>
          </thead>
          <tbody>
            {request.verification.lines.map((line, i) => (
              <tr key={i} className="border-b border-hairline align-middle last:border-b-0">
                <th scope="row" className="max-w-[320px] py-3 pr-4 font-medium">{loanCheckLabel(line.instrument_id)}</th>
                <td className="py-3 pr-4 text-right">
                  {line.market_value > 0 ? <Usd amount={line.market_value} /> : <span className="text-muted">—</span>}
                </td>
                <td className="whitespace-nowrap py-3 pr-4">Clause {line.clause}</td>
                <td className="py-3"><LineResult line={line} request={request} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Reconciliation({ request }: { request: CosignRequest }) {
  const v = request.verification;
  return (
    <>
      <Totals request={request} />
      {request.type === "loan_draw" && v.lines.length > 0 ? (
        <LoanDrawLines request={request} />
      ) : v.lines.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left">
            <thead>
              <tr className="border-b border-strong text-small text-muted">
                <th scope="col" className={TH}>Instrument</th>
                <th scope="col" className={`${TH} text-right`}>Market value</th>
                <th scope="col" className={TH}>Broker&apos;s haircut</th>
                <th scope="col" className={TH}>Agreed haircut</th>
                <th scope="col" className={`${TH} text-right`}>Required margin</th>
                <th scope="col" className="whitespace-nowrap py-2 font-normal">Result</th>
              </tr>
            </thead>
            <tbody>
              {v.lines.map((line, i) => (
                <tr key={i} className="border-b border-hairline align-middle last:border-b-0">
                  <th scope="row" className="max-w-[200px] break-all py-3 pr-3 font-mono font-medium">{line.instrument_id}</th>
                  <td className="py-3 pr-3 text-right"><Usd amount={line.market_value} /></td>
                  <td className="py-3 pr-3 align-top">
                    <Haircut fraction={line.haircut_claimed} tone={line.ok ? "ink" : "dispute"} />
                  </td>
                  <td className="py-3 pr-3 align-top">
                    <Haircut fraction={line.haircut_agreed} tone="ink" />
                    <span className="mt-1 block whitespace-nowrap text-small text-muted">Clause {line.clause}</span>
                  </td>
                  <td className="py-3 pr-3 text-right">
                    {/* Display only: the engine's verified total is the number that gets paid. */}
                    <Usd amount={Math.round(line.market_value * line.haircut_agreed)} />
                  </td>
                  <td className="py-3"><LineResult line={line} request={request} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted">Cosign has no line items to recompute for this kind of request.</p>
      )}
    </>
  );
}

function DisputeNotice({ request }: { request: CosignRequest }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  if (request.verification.status !== "partial") {
    return (
      <p className="text-muted">
        {request.verification.status === "verified"
          ? "No notice needed: Cosign agrees with the full amount."
          : "No notice drafted: Cosign rejected this request in full."}
      </p>
    );
  }
  const text = disputeNotice(request);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 2500);
  }
  return (
    <>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-control border border-hairline bg-ground p-3 font-sans text-small">{text}</pre>
      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" onClick={copy}>
          Copy notice
        </Button>
        <span aria-live="polite" className={`text-small ${copyState === "failed" ? "text-dispute" : "text-agree"}`}>
          {copyState === "copied" ? "Copied to clipboard" : copyState === "failed" ? "Couldn't copy. Select the text and copy it by hand." : ""}
        </span>
      </div>
    </>
  );
}

/** The hash drawn as a strip of cells, one per byte, so two fingerprints can be compared at a glance. */
function Fingerprint({ hash }: { hash: string }) {
  const bytes = (hash.match(/[0-9a-f]{2}/gi) ?? []).slice(0, 32).map((pair) => parseInt(pair, 16));
  return (
    <div className="flex flex-wrap items-center gap-4">
      {bytes.length > 0 ? (
        <div aria-hidden="true" className="grid shrink-0 grid-cols-[repeat(16,10px)] gap-0.5">
          {bytes.map((b, i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-[2px] bg-ink" style={{ opacity: 0.08 + (b / 255) * 0.92 }} />
          ))}
        </div>
      ) : null}
      <p className="min-w-0 break-all font-mono text-small">{hash}</p>
    </div>
  );
}

function HashRow({ label, hash, expected }: { label: string; hash: string | null; expected: string }) {
  const same = hash === expected;
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline py-2 last:border-b-0">
      <span className="text-small text-muted">{label}</span>
      <span className="min-w-0 truncate font-mono text-small" title={hash ?? undefined}>
        {hash ?? "No proposal on-chain yet"}
      </span>
      {hash === null ? (
        <span />
      ) : same ? (
        <span className="text-agree"><CheckIcon className="h-4 w-4" /><span className="sr-only">matches</span></span>
      ) : (
        <span className="text-dispute"><CrossIcon className="h-4 w-4" /><span className="sr-only">differs</span></span>
      )}
    </div>
  );
}

/**
 * "Verify evidence" (BUILD_PLAN §7.3): the server recomputes the hash from the email, fixtures and engine,
 * and reads the one stored in the proposal on Solana. All three must be equal.
 */
function VerifyEvidence({ request }: { request: CosignRequest }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<EvidenceCheck | null>(null);
  const [failed, setFailed] = useState(false);

  async function run() {
    setPending(true);
    setFailed(false);
    setResult(null);
    try {
      setResult(await verifyEvidence(request.id));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" pending={pending} disabled={pending} onClick={run}>
          {pending ? "Recomputing..." : "Verify evidence"}
        </Button>
        {result ? (
          result.match ? (
            <Pill tone="agree">
              <CheckIcon className="h-3.5 w-3.5" />
              {result.on_chain_hash ? "Matches the on-chain record" : "Matches (not proposed yet)"}
            </Pill>
          ) : (
            <Pill tone="dispute">
              <CrossIcon className="h-3.5 w-3.5" />
              Evidence changed
            </Pill>
          )
        ) : null}
      </div>
      {result ? (
        <div aria-live="polite" className="mt-3 rounded-control border border-hairline bg-ground px-3 py-1">
          <HashRow label="Recomputed now" hash={result.recomputed_hash} expected={result.recomputed_hash} />
          <HashRow label="Shown on this page" hash={result.stored_hash} expected={result.recomputed_hash} />
          <HashRow label="Stored on Solana" hash={result.on_chain_hash} expected={result.recomputed_hash} />
        </div>
      ) : null}
      {failed ? (
        <div className="mt-3">
          <ErrorBanner message="Couldn't verify the evidence right now. Try again." />
        </div>
      ) : null}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading request" className={`mt-3 ${TWO_COLUMNS}`}>
      <Panel className="space-y-4 p-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Panel>
      <Panel className="space-y-4 p-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-14 w-64" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-11 w-full" />
      </Panel>
    </div>
  );
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCallback(() => getRequest(id), [id]);
  const { state, reload, retry } = useLoad(load, id);
  const request = state.status === "ready" ? state.data : null;

  const backLink = (
    <Link
      href="/"
      className="ml-auto inline-flex min-h-11 items-center font-medium text-action underline decoration-action/40 underline-offset-4 transition-colors duration-150 hover:text-action-hover"
    >
      Back to inbox
    </Link>
  );

  return (
    <>
      {request ? null : <div className="flex">{backLink}</div>}

      {state.status === "loading" ? (
        <>
          <Skeleton className="h-11 w-96 max-w-full" />
          <DetailSkeleton />
        </>
      ) : null}

      {state.status === "error" ? (
        <Panel>
          <LoadFailed what="this request" detail={state.detail} onRetry={retry} />
        </Panel>
      ) : null}

      {state.status === "ready" && !request ? (
        <Panel className="p-6">
          <p>
            There is no request with the ID <span className="break-all font-mono">{id}</span>.
          </p>
        </Panel>
      ) : null}

      {request ? (
        <>
          <div className="flex flex-wrap items-center gap-x-3">
            <div className="min-w-0 max-w-full [overflow-wrap:anywhere]">
              <PageTitle>
                {REQUEST_TYPE_LABEL[request.type]} from {counterpartyLabel(request.counterparty_id)}
              </PageTitle>
            </div>
            <ResultPill verification={request.verification} />
            {backLink}
          </div>

          <div className={`mt-3 ${TWO_COLUMNS}`}>
            <Panel className="min-w-0 animate-rise">
              <Section title="Request">
                <p className="text-small text-muted">Sentences the parser quoted from the email</p>
                {request.quotes.length > 0 ? (
                  <ul className="mt-1 max-h-56 space-y-1.5 overflow-y-auto">
                    {request.quotes.map((q, i) => (
                      <li key={i} className="break-words">
                        <mark className="box-decoration-clone rounded-[2px] bg-quote px-1 py-0.5 text-ink">{q}</mark>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted">The parser quoted nothing from this email.</p>
                )}
              </Section>
              <Section title="Reconciliation">
                <Reconciliation request={request} />
              </Section>
              <Section title="Dispute notice">
                <DisputeNotice request={request} />
              </Section>
              <Section title="Evidence fingerprint">
                <p className="mb-2 text-small text-muted">
                  SHA-256 of the parsed request, source email, inputs and result. It is stored on-chain with the proposal.
                </p>
                <Fingerprint hash={request.evidence_hash} />
                {/* Keyed on the proposal so a stale result clears once the payment is proposed. */}
                <VerifyEvidence key={request.proposal?.id ?? "none"} request={request} />
              </Section>
            </Panel>

            <div className="min-w-0 animate-rise lg:sticky lg:top-[72px]" style={{ animationDelay: "80ms" }}>
              <PaymentTicket request={request} onChanged={reload} />
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
