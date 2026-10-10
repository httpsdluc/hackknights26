import { PageTitle, Panel, Waiting } from "@/components/ui";

// Step 4 is on hold: CONTRACT.md §4 lists GET /vault but gives it no response shape.
export default function VaultPage() {
  return (
    <>
      <PageTitle>Vault</PageTitle>
      <Panel className="mt-4 p-6">
        <p>Allowlisted payees, limits, today&apos;s spend and the kill switch will show here.</p>
        <p className="mt-2">
          <Waiting field="GET /vault response shape" />
        </p>
      </Panel>
    </>
  );
}
