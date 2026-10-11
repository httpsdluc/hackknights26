// One small icon set: 16px grid, 1.75 stroke, inherits text colour.
import type { ReactNode } from "react";

function Icon({ children, className = "h-4 w-4" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

type P = { className?: string };

export const CheckIcon = (p: P) => <Icon {...p}><path d="M3 8.5l3.2 3.2L13 5" /></Icon>;
export const CrossIcon = (p: P) => <Icon {...p}><path d="M4 4l8 8M12 4l-8 8" /></Icon>;
export const ClockIcon = (p: P) => <Icon {...p}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2l2 1.3" /></Icon>;
export const ArrowRightIcon = (p: P) => <Icon {...p}><path d="M3 8h10M9 4l4 4-4 4" /></Icon>;
export const ExternalIcon = (p: P) => <Icon {...p}><path d="M6.5 3.5h-3v9h9v-3M9.5 3h3.5v3.5M13 3L7.5 8.5" /></Icon>;
export const ShieldIcon = (p: P) => <Icon {...p}><path d="M8 2l5 1.8v3.7c0 3-2.1 5.3-5 6.5-2.9-1.200-5-3.500-5-6.500V3.800z" /></Icon>;
export const BotIcon = (p: P) => <Icon {...p}><rect x="3" y="5.500" width="10" height="7" rx="1.5" /><path d="M8 3v2.500M6 8.500v1M10 8.500v1" /></Icon>;
export const WalletIcon = (p: P) => <Icon {...p}><path d="M2.500 5h10a1 1 0 011 1v6a1 1 0 01-1 1h-10zM2.500 5V4a1 1 0 011-1h8M10.500 9h1" /></Icon>;
export const AlertIcon = (p: P) => <Icon {...p}><path d="M8 2.500l6 10.500H2zM8 6.500v3M8 11.300v.2" /></Icon>;

export function Spinner({ className = "h-4 w-4" }: P) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={`shrink-0 animate-spin ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 2a6 6 0 106 6" />
    </svg>
  );
}

/** Two overlapping signatures: the "co" in Cosign. */
export function Logo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 28" className="h-7 w-7 shrink-0">
      <rect width="28" height="28" rx="6" className="fill-ink" />
      <path d="M6.500 14.500l3.500 3.500 6-7" fill="none" className="stroke-paper" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.500 17l1.500 1.500 6.500-7.500" fill="none" className="stroke-quote" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
