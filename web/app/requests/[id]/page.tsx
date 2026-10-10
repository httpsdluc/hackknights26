"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import type { Request as CosignRequest, VerificationLine } from "../../../../shared/types.ts";
import { PaymentTicket } from "@/components/payment-ticket";
import { ResultPill } from "@/components/result";
import { Button, LoadFailed, PageTitle, Panel, Pill, Skeleton, Usd, Waiting } from "@/components/ui";
import { getRequest } from "@/lib/api";
import { formatPercent } from "@/lib/format";
import { REQUEST_TYPE_LABEL } from "@/lib/labels";
import { disputeNotice } from "@/lib/notice";
import { useLoad } from "@/lib/use-load";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-hairline p-5 last:border-b-0">
      <h2 className="text-heading font-semibold">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function LineResult({ line, request }: { line: VerificationLine; request: CosignRequest }) {
  if (line.ok) return <Pill tone="agree">Agree</Pill>;
  // The contract gives one disputed total, not one per line. With a single disputed line the
  // total is that line's amount; with several we can't split it without doing money math here.
  const disputedLines = request.verification.lines.filter((l) => !l.ok).length;
  if (disputedLines === 1) {
    return (
      <Pill tone="dispute">
        Dispute <Usd amount={request.verification.disputed_usd} />
      </Pill>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Pill tone="dispute">Dispute</Pill>
      <Waiting field="VerificationLine disputed_usd" />
    </span>
  );
}

/** Loan draws arrive as the same line shape as margin calls, with the haircut fields unused. */
function LoanDrawLines({ request }: { request: CosignRequest }) {
  return (
    <>
      <p className="mb-2">
        <Waiting field="loan draw checks" />
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-strong text-small text-muted">
              <th scope="col" className="whitespace-nowrap py-2 pr-4 font-normal">Check</th>
              <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right font-normal">Amount</th>
              <th scope="col" className="whitespace-nowrap py-2 pr-4 font-normal">Clause</th>
              <th scope="col" className="whitespace-nowrap py-2 font-normal">Result</th>
            </tr>
          </thead>
          <tbody>
            {request.verification.lines.map((line) => (
              <tr key={line.instrument_id} className="border-b border-hairline align-middle">
                <th scope="row" className="py-3 pr-4 font-mono font-medium">{line.instrument_id}</th>
                <td className="py-3 pr-4 text-right"><Usd amount={line.market_value} /></td>
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
      {request.type === "loan_draw" && v.lines.length > 0 ? (
        <LoanDrawLines request={request} />
      ) : v.lines.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-strong text-small text-muted">
                <th scope="col" className="whitespace-nowrap py-2 pr-4 font-normal">Instrument</th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right font-normal">Market value</th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 font-normal">Broker&apos;s haircut</th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 font-normal">Agreed haircut</th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 font-normal">Required margin</th>
                <th scope="col" className="py-2 font-normal">Result</th>
              </tr>
            </thead>
            <tbody>
              {v.lines.map((line) => (
                <tr key={line.instrument_id} className="border-b border-hairline align-middle">
                  <th scope="row" className="py-3 pr-4 font-mono font-medium">{line.instrument_id}</th>
                  <td className="py-3 pr-4 text-right"><Usd amount={line.market_value} /></td>
                  <td className={`py-3 pr-4 tabular-nums ${line.ok ? "" : "font-semibold text-dispute"}`}>
                    {formatPercent(line.haircut_claimed)}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-4">
                    <span className="font-semibold tabular-nums">{formatPercent(line.haircut_agreed)}</span>
                    <span className="text-small text-muted"> · Clause {line.clause}</span>
                  </td>
                  <td className="py-3 pr-4"><Waiting field="required_usd" /></td>
                  <td className="py-3"><LineResult line={line} request={request} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : request.type === "loan_draw" ? (
        <Waiting field="loan draw checks" />
      ) : (
        <p className="text-muted">Cosign has no line items to recompute for this kind of request.</p>
      )}
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1">
        <div>
          <dt className="text-small text-muted">Requested</dt>
          <dd className="text-heading"><Usd amount={request.amount_requested_usd} /></dd>
        </div>
        <div>
          <dt className="text-small text-muted">Cosign agrees</dt>
          <dd className="text-heading"><Usd amount={v.verified_usd} /></dd>
        </div>
        <div>
          <dt className="text-small text-muted">Cosign disputes</dt>
          <dd className="text-heading"><Usd amount={v.disputed_usd} /></dd>
        </div>
      </dl>
    </>
  );
}

function DisputeNotice({ request }: { request: CosignRequest }) {
  const [copied, setCopied] = useState(false);
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-control border border-hairline bg-ground p-3 font-sans text-small">{text}</pre>
      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" onClick={copy}>
          Copy notice
        </Button>
        <span aria-live="polite" className="text-small text-muted">
          {copied ? "Copied to clipboard" : ""}
        </span>
      </div>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading request" className="mt-4 grid grid-cols-[minmax(0,1fr)_420px] items-start gap-5">
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
  const { state, reload, retry } = useLoad(load);
  const request = state.status === "ready" ? state.data : null;

  const backLink = (
    <Link href="/" className="ml-auto inline-flex min-h-11 items-center font-medium text-action underline hover:text-action-hover">
      Back to inbox
    </Link>
  );

  return (
    <>
      {request ? null : <div className="flex">{backLink}</div>}

      {state.status === "loading" ? (
        <>
          <Skeleton className="h-11 w-96" />
          <DetailSkeleton />
        </>
      ) : null}

      {state.status === "error" ? (
        <Panel>
          <LoadFailed what="this request" onRetry={retry} />
        </Panel>
      ) : null}

      {state.status === "ready" && !request ? (
        <Panel className="p-6">
          <p>
            There is no request with the ID <span className="font-mono">{id}</span>.
          </p>
        </Panel>
      ) : null}

      {request ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <PageTitle>
              {REQUEST_TYPE_LABEL[request.type]} from {request.counterparty_id}
            </PageTitle>
            <ResultPill verification={request.verification} />
            {backLink}
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_420px] items-start gap-5">
            <Panel className="min-w-0">
              <Section title="Request">
                <p className="mb-2 flex flex-wrap gap-2">
                  <Waiting field="email (from, subject, received_at, body)" />
                  <Waiting field="due" />
                  <Waiting field="parser flags" />
                </p>
                <p className="text-small text-muted">Sentences the parser quoted from the email</p>
                <ul className="mt-1 space-y-1">
                  {request.quotes.map((q, i) => (
                    <li key={i}>
                      <mark className="bg-quote px-1 text-ink">{q}</mark>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Reconciliation">
                <Reconciliation request={request} />
              </Section>
              <Section title="Dispute notice">
                <DisputeNotice request={request} />
              </Section>
              <Section title="Evidence fingerprint">
                <p className="break-all font-mono text-small">{request.evidence_hash}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Button variant="secondary" disabled>
                    Verify evidence
                  </Button>
                  <Waiting field="route that recomputes the evidence hash" />
                </div>
              </Section>
            </Panel>

            <PaymentTicket request={request} onChanged={reload} />
          </div>
        </>
      ) : null}
    </>
  );
}
