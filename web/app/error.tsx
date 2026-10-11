"use client";

import { Button, PageTitle, Panel } from "@/components/ui";

// Last line of defence on stage: a rendering failure shows this instead of a blank page.
export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <PageTitle>Something went wrong</PageTitle>
      <Panel className="mt-4 flex flex-wrap items-center gap-4 p-6">
        <p>This page couldn&apos;t be shown. No payment was changed by this.</p>
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      </Panel>
    </>
  );
}
