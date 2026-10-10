import type { Request as CosignRequest } from "../../shared/types.ts";
import { formatPercent, formatUsd } from "./format";
import { REQUEST_TYPE_LABEL } from "./labels";

/** Plain-text dispute notice for a partly agreed request, built only from CONTRACT.md fields. */
export function disputeNotice(r: CosignRequest): string {
  const v = r.verification;
  const disputed = v.lines
    .filter((l) => !l.ok)
    .map(
      (l) =>
        `- ${l.instrument_id}: you applied a ${formatPercent(l.haircut_claimed)} haircut. ` +
        `Clause ${l.clause} of our agreement sets ${formatPercent(l.haircut_agreed)}.`,
    );
  return [
    `To: ${r.counterparty_id}`,
    `Re: ${REQUEST_TYPE_LABEL[r.type]} for ${formatUsd(r.amount_requested_usd)}`,
    "",
    `We recomputed this request against our agreement and dispute ${formatUsd(v.disputed_usd)} of it.`,
    ...disputed,
    "",
    `We agree ${formatUsd(v.verified_usd)} and are processing that amount.`,
  ].join("\n");
}
