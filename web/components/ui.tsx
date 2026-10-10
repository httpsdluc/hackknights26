import type { ButtonHTMLAttributes, ReactNode } from "react";
import { errorSentence } from "@/lib/errors";
import { formatUsd } from "@/lib/format";

type Tone = "agree" | "dispute" | "held" | "neutral";

const TONE: Record<Tone, string> = {
  agree: "border-agree bg-agree-bg text-agree",
  dispute: "border-dispute bg-dispute-bg text-dispute",
  held: "border-held bg-held-bg text-held",
  neutral: "border-strong bg-paper text-ink",
};

/** Status pill: always a border and a word, never colour alone. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-pill border px-2 py-0.5 text-small font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** Marks a part of the design that CONTRACT.md has no field for yet. */
export function Waiting({ field }: { field: string }) {
  return (
    <span className="inline-block rounded-pill border border-dashed border-held bg-held-bg px-2 py-0.5 text-fine text-held">
      Waiting on contract: {field}
    </span>
  );
}

export function Usd({ amount, className = "" }: { amount: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatUsd(amount)}</span>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-panel border border-hairline bg-paper ${className}`}>{children}</section>;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-serif text-title font-normal">{children}</h1>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" };

const VARIANT = {
  primary: "border-action bg-action text-paper hover:border-action-hover hover:bg-action-hover",
  secondary: "border-action bg-paper text-action hover:border-action-hover hover:text-action-hover",
  danger: "border-dispute bg-dispute-bg text-dispute",
};

export function Button({ variant = "primary", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-control border px-4 text-body font-medium disabled:cursor-not-allowed disabled:border-strong disabled:bg-ground disabled:text-muted ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

/** Red banner for `{ ok: false, error_code }` (code in mono plus its sentence) or a plain failure message. */
export function ErrorBanner({ code, message }: { code?: string; message?: string }) {
  const sentence = code ? errorSentence(code) : null;
  return (
    <div role="alert" className="rounded-control border border-dispute bg-dispute-bg px-3 py-2 text-dispute">
      {code ? (
        <>
          <p className="text-small font-medium">Blocked by rule</p>
          <p className="break-all font-mono text-body font-medium">{code}</p>
          {sentence ? <p className="text-small">{sentence}</p> : null}
        </>
      ) : (
        <p className="text-small font-medium">{message}</p>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-pill bg-hairline ${className}`} />;
}

export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-6">
      <p className="text-dispute">Couldn&apos;t load {what}. Check that the server is running.</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
