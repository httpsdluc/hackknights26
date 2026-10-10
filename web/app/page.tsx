"use client";

import Link from "next/link";
import { ProposalPill, ResultPill } from "@/components/result";
import { LoadFailed, PageTitle, Panel, Pill, Skeleton, Usd, Waiting } from "@/components/ui";
import { listRequests } from "@/lib/api";
import { REQUEST_TYPE_LABEL } from "@/lib/labels";
import { useLoad } from "@/lib/use-load";

const COLUMNS = "grid grid-cols-[220px_1fr_180px_300px] items-center gap-4 px-5";

export default function InboxPage() {
  const { state, retry } = useLoad(listRequests);

  return (
    <>
      <PageTitle>Inbox</PageTitle>
      <Panel className="mt-4 overflow-x-auto">
        <div className="min-w-[960px]">
          <div className={`${COLUMNS} border-b border-hairline py-3 text-small text-muted`}>
            <span>Type</span>
            <span>Counterparty</span>
            <span className="text-right">Requested</span>
            <span>Cosign result</span>
          </div>

          {state.status === "loading" ? (
            <ul aria-busy="true" aria-label="Loading requests">
              {[0, 1, 2].map((i) => (
                <li key={i} className={`${COLUMNS} min-h-16 border-b border-hairline last:border-b-0`}>
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="ml-auto h-5 w-28" />
                  <Skeleton className="h-6 w-36" />
                </li>
              ))}
            </ul>
          ) : null}

          {state.status === "error" ? <LoadFailed what="the inbox" onRetry={retry} /> : null}

          {state.status === "ready" && state.data.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-heading">No payment requests yet</p>
              <p className="mt-1 text-muted">Margin calls and loan draws show up here once Cosign has checked them.</p>
            </div>
          ) : null}

          {state.status === "ready" && state.data.length > 0 ? (
            <ul>
              {state.data.map((r) => (
                <li key={r.id} className="border-b border-hairline last:border-b-0">
                  <Link href={`/requests/${encodeURIComponent(r.id)}`} className={`${COLUMNS} min-h-16 py-3 hover:bg-ground`}>
                    <span>
                      <Pill tone="neutral">{REQUEST_TYPE_LABEL[r.type]}</Pill>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-medium text-action">{r.counterparty_id}</span>
                      <Waiting field="counterparty_name" />
                    </span>
                    <Usd amount={r.amount_requested_usd} className="text-right text-heading font-medium" />
                    <span className="flex flex-wrap items-center gap-2">
                      <ResultPill verification={r.verification} />
                      <ProposalPill proposal={r.proposal} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
