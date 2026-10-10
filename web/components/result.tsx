import type { Proposal, Verification } from "../../shared/types.ts";
import { Pill, Usd } from "./ui";

/** Cosign's verdict on the request as a whole. */
export function ResultPill({ verification }: { verification: Verification }) {
  if (verification.status === "verified") return <Pill tone="agree">Agree</Pill>;
  if (verification.status === "rejected") return <Pill tone="dispute">Rejected</Pill>;
  return (
    <Pill tone="dispute">
      Dispute <Usd amount={verification.disputed_usd} />
    </Pill>
  );
}

/** Where the payment stands on chain. Nothing is shown before a proposal exists. */
export function ProposalPill({ proposal }: { proposal: Proposal | null }) {
  if (!proposal) return null;
  return proposal.executed ? <Pill tone="agree">Released</Pill> : <Pill tone="held">Held for approval</Pill>;
}
