import type { MarketingFooterColumn } from "@/components/marketing/marketing-page-content";
import Image from "next/image";
import Link from "next/link";

type MarketingFooterProps = {
  columns: MarketingFooterColumn[];
};

export function MarketingFooter({ columns }: MarketingFooterProps) {
  const isExternalHref = (href: string) =>
    href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:");

  return (
    <footer className="grid gap-12 lg:grid-cols-[160px_1fr]">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
          <Image src="/images/logo.png" width={32} height={32} alt="Hyperlocalise logo" />
        </div>
      </div>

      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {columns.map((column) => (
          <div key={column.title}>
            <div className="text-sm font-medium text-foreground">{column.title}</div>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {column.links.map((link) => (
                <li key={link.label}>
                  {isExternalHref(link.href) ? (
                    <a
                      href={link.href}
                      className="inline-flex rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="inline-flex rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
