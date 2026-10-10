import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const plexSerif = IBM_Plex_Serif({ subsets: ["latin"], weight: ["400"], variable: "--font-plex-serif" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Cosign",
  description: "Verify-then-cosign payments for credit funds",
};

const NAV = [
  { href: "/", label: "Inbox" },
  { href: "/vault", label: "Vault" },
  { href: "/attack", label: "Attack lab" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexSerif.variable} ${plexMono.variable}`}>
      <body className="min-h-screen antialiased">
        <header className="border-b border-hairline bg-paper">
          <div className="mx-auto flex max-w-[1280px] items-center gap-6 px-6">
            <Link href="/" className="inline-flex min-h-11 items-center text-heading font-semibold text-ink">
              Cosign
            </Link>
            <nav aria-label="Main" className="flex gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-control px-3 font-medium text-action hover:text-action-hover"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <p className="ml-auto text-small text-muted">
              Simulated counterparty data
              {process.env.NEXT_PUBLIC_USE_MOCKS === "true" ? " · mock API" : ""}
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-[1280px] px-6 py-5">{children}</main>
      </body>
    </html>
  );
}
