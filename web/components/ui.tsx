import type { ButtonHTMLAttributes, ReactNode } from "react";
import { errorSentence } from "@/lib/errors";
import { formatUsd } from "@/lib/format";
import { AlertIcon, CheckIcon, Spinner } from "./icons";

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
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2 py-0.5 text-small font-medium ${TONE[tone]}`}>
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
  return <section className={`rounded-panel border border-hairline bg-paper shadow-panel ${className}`}>{children}</section>;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-serif text-title font-normal tracking-[-0.01em]">{children}</h1>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  /** Shows a spinner beside the label. The caller still sets `disabled` and the pending label. */
  pending?: boolean;
};

const VARIANT = {
  primary: "border-action bg-action text-paper shadow-button hover:border-action-hover hover:bg-action-hover",
  secondary: "border-action bg-paper text-action hover:border-action-hover hover:text-action-hover",
  danger: "border-dispute bg-dispute-bg text-dispute hover:bg-paper",
};

export function Button({ variant = "primary", pending = false, className = "", type = "button", children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-4 text-body font-medium transition-colors duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:border-strong disabled:bg-ground disabled:text-muted disabled:shadow-none disabled:active:translate-y-0 ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}

/** Red banner for `{ ok: false, error_code }` (code in mono plus its sentence) or a plain failure message. */
export function ErrorBanner({ code, message }: { code?: string; message?: string }) {
  const sentence = code ? errorSentence(code) : null;
  return (
    <div role="alert" className="flex animate-shake gap-2 rounded-control border border-dispute bg-dispute-bg px-3 py-2 text-dispute">
      <AlertIcon className="mt-1 h-4 w-4" />
      <div className="min-w-0">
      {code ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-small font-medium">Blocked by rule</span>
            <span className="break-all font-mono text-body font-medium">{code}</span>
          </p>
          {sentence ? <p className="text-small">{sentence}</p> : null}
        </>
      ) : (
        <p className="text-small font-medium">{message}</p>
      )}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-breathe rounded-pill bg-hairline ${className}`} />;
}

export function LoadFailed({ what, detail, onRetry }: { what: string; detail?: string | null; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-4 p-6">
      <div className="min-w-0 text-dispute">
        {detail ? (
          <>
            <p>The server&apos;s answer for {what} doesn&apos;t match CONTRACT.md.</p>
            <p className="break-words font-mono text-small">{detail}</p>
          </>
        ) : (
          <p>Couldn&apos;t load {what}. Check that the server is running.</p>
        )}
      </div>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function Check() {
  return <CheckIcon />;
}
