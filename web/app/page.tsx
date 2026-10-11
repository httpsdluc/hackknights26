"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { ProposalPill, ResultPill } from "@/components/result";
import { LoadFailed, PageTitle, Panel, Pill, Skeleton, Usd, Waiting } from "@/components/ui";
import { listRequests } from "@/lib/api";
import { REQUEST_TYPE_LABEL } from "@/lib/labels";
import { useLoad } from "@/lib/use-load";

const COLUMNS = "grid grid-cols-[190px_minmax(0,1fr)_140px_140px_250px_20px] items-center gap-4 px-5";

function Tile({ label, value }: { label: string; value: number | null }) {
  return (
    <Panel className="px-5 py-3">
      <p className="text-small text-muted">{label}</p>
      {value === null ? (
        <Skeleton className="mt-2 h-8 w-10" />
      ) : (
        <p className="text-title font-medium tabular-nums tracking-[-0.02em]">{value}</p>
      )}
    </Panel>
  );
}

export default function InboxPage() {
  const { state, retry } = useLoad(listRequests);
  const rows = state.status === "ready" ? state.data : null;
  const count = (test: (r: NonNullable<typeof rows>[number]) => boolean) => (rows ? rows.filter(test).length : null);

  return (
    <>
      <PageTitle>Inbox</PageTitle>

      <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Requests checked" value={rows ? rows.length : null} />
        <Tile label="Held for approval" value={count((r) => r.proposal !== null && !r.proposal.executed)} />
        <Tile label="Released" value={count((r) => r.proposal?.executed === true)} />
        <Tile label="Rejected" value={count((r) => r.verification.status === "rejected")} />
      </div>

      <Panel className="mt-4 overflow-x-auto">
        <div className="min-w-[1040px]">
          <div className={`${COLUMNS} border-b border-hairline py-3 text-small text-muted`}>
            <span>Type</span>
            <span>Counterparty</span>
            <span className="text-right">Requested</span>
            <span className="text-right">Cosign agrees</span>
            <span>Cosign result</span>
            <span />
          </div>

          {state.status === "loading" ? (
            <ul aria-busy="true" aria-label="Loading requests">
              {[0, 1, 2].map((i) => (
                <li key={i} className={`${COLUMNS} min-h-16 border-b border-hairline last:border-b-0`}>
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="ml-auto h-5 w-24" />
                  <Skeleton className="ml-auto h-5 w-24" />
                  <Skeleton className="h-6 w-36" />
                  <span />
                </li>
              ))}
            </ul>
          ) : null}

          {state.status === "error" ? <LoadFailed what="the inbox" detail={state.detail} onRetry={retry} /> : null}

          {rows && rows.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-heading font-medium">No payment requests yet</p>
              <p className="mt-1 text-muted">Margin calls and loan draws show up here once Cosign has checked them.</p>
            </div>
          ) : null}

          {rows && rows.length > 0 ? (
            <ul>
              {rows.map((r, i) => (
                <li
                  key={r.id}
                  className="animate-rise border-b border-hairline last:border-b-0"
                  style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                >
                  <Link
                    href={`/requests/${encodeURIComponent(r.id)}`}
                    className={`${COLUMNS} group min-h-16 py-3 transition-[background-color] duration-150 hover:bg-ground focus-visible:-outline-offset-2`}
                  >
                    <span>
                      <Pill tone="neutral">{REQUEST_TYPE_LABEL[r.type]}</Pill>
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="max-w-full truncate font-mono font-medium text-action group-hover:text-action-hover">
                        {r.counterparty_id}
                      </span>
                      <Waiting field="counterparty_name" />
                    </span>
                    <Usd amount={r.amount_requested_usd} className="text-right text-muted" />
                    <Usd amount={r.verification.verified_usd} className="text-right text-heading font-medium" />
                    <span className="flex flex-wrap items-center gap-2">
                      <ResultPill verification={r.verification} />
                      <ProposalPill proposal={r.proposal} />
                    </span>
                    <ArrowRightIcon className="h-4 w-4 text-action opacity-0 transition duration-150 group-hover:translate-x-1 group-hover:opacity-100 group-focus-visible:opacity-100" />
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
