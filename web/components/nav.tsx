"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Inbox" },
  { href: "/vault", label: "Vault" },
  { href: "/attack", label: "Attack lab" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1">
      {NAV.map((item) => {
        // A request detail page belongs to the inbox.
        const current = item.href === "/" ? pathname === "/" || pathname.startsWith("/requests") : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={`inline-flex min-h-14 items-center border-b-2 px-3 font-medium transition-colors duration-150 hover:text-action-hover ${
              current ? "border-action text-action" : "border-transparent text-muted"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
