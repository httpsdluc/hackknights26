import type { Proposal, Verification } from "../../shared/types.ts";
import { CheckIcon, ClockIcon, CrossIcon } from "./icons";
import { Pill, Usd } from "./ui";

/** Cosign's verdict on the request as a whole. */
export function ResultPill({ verification }: { verification: Verification }) {
  if (verification.status === "verified") return (
      <Pill tone="agree">
        <CheckIcon className="h-3.5 w-3.5" />
        Agree
      </Pill>
    );
  if (verification.status === "rejected") return (
      <Pill tone="dispute">
        <CrossIcon className="h-3.5 w-3.5" />
        Rejected
      </Pill>
    );
  return (
    <Pill tone="dispute">
      <CrossIcon className="h-3.5 w-3.5" />
      Dispute <Usd amount={verification.disputed_usd} />
    </Pill>
  );
}

/** Where the payment stands on chain. Nothing is shown before a proposal exists. */
export function ProposalPill({ proposal }: { proposal: Proposal | null }) {
  if (!proposal) return null;
  return proposal.executed ? (
    <Pill tone="agree">
      <CheckIcon className="h-3.5 w-3.5" />
      Released
    </Pill>
  ) : (
    <Pill tone="held">
      <ClockIcon className="h-3.5 w-3.5" />
      Held for approval
    </Pill>
  );
}
