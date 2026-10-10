import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
