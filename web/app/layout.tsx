import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/icons";
import { Nav } from "@/components/nav";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const plexSerif = IBM_Plex_Serif({ subsets: ["latin"], weight: ["400"], variable: "--font-plex-serif" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Cosign",
  description: "Verify-then-cosign payments for credit funds",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexSerif.variable} ${plexMono.variable}`}>
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-hairline bg-paper/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1280px] items-center gap-6 overflow-x-auto whitespace-nowrap px-6">
            <Link href="/" className="inline-flex min-h-14 items-center gap-2.5 text-heading font-semibold tracking-[-0.01em] text-ink">
              <Logo />
              Cosign
            </Link>
            <Nav />
            <p className="ml-auto flex items-center gap-2 text-small text-muted">
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-paper px-2 py-0.5 font-medium text-ink">
                <span aria-hidden="true" className="h-2 w-2 animate-breathe rounded-full bg-agree" />
                {process.env.NEXT_PUBLIC_USE_MOCKS === "true" ? "Mock API" : "Solana devnet"}
              </span>
              Simulated counterparty data
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-[1280px] px-6 py-5">{children}</main>
      </body>
    </html>
  );
}
