import { cn } from "@/lib/utils";
import { TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";

import { changelog } from "./marketing-page-content";

export function ChangelogSection() {
  return (
    <section id="changelog" className="relative">
      <div className="max-w-2xl">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Recent releases
        </p>
        <TypographyH2 className="pt-3 pb-0 text-4xl font-semibold tracking-[-0.04em] normal-case text-foreground sm:text-5xl">
          Changelog
        </TypographyH2>
        <TypographyP className="mt-4 max-w-xl text-pretty text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
          Product updates that tighten release confidence, reduce localization drift, and make sync
          runs easier to trust.
        </TypographyP>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {changelog.map((entry, index) => (
          <article
            key={entry.title}
            className={cn(
              "group flex h-full flex-col justify-between rounded-[1.75rem] border p-6 transition-all duration-300 ease-out",
              "bg-[color:color-mix(in_oklch,var(--background)_96%,var(--muted)_4%)]",
              "border-[color:color-mix(in_oklch,var(--border)_88%,var(--chart-1)_12%)]",
              "shadow-[inset_0_1px_0_color-mix(in_oklch,var(--background)_78%,transparent)]",
              "hover:-translate-y-0.5 hover:border-[color:color-mix(in_oklch,var(--border)_70%,var(--chart-2)_30%)]",
              "hover:bg-[color:color-mix(in_oklch,var(--background)_93%,var(--muted)_7%)]",
              index === 0 &&
                "bg-[color:color-mix(in_oklch,var(--background)_90%,var(--chart-1)_10%)] border-[color:color-mix(in_oklch,var(--border)_58%,var(--chart-2)_42%)]",
            )}
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]",
                    "bg-[color:color-mix(in_oklch,var(--muted)_82%,var(--chart-1)_18%)]",
                    "text-[color:color-mix(in_oklch,var(--foreground)_82%,var(--chart-4)_18%)]",
                    index === 0
                      ? "bg-[color:color-mix(in_oklch,var(--muted)_58%,var(--chart-2)_42%)] text-[color:color-mix(in_oklch,var(--foreground)_88%,var(--chart-4)_12%)]"
                      : "bg-[color:color-mix(in_oklch,var(--muted)_82%,var(--chart-1)_18%)]",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full bg-[color:color-mix(in_oklch,var(--chart-2)_78%,white_22%)] shadow-[0_0_0_4px_color-mix(in_oklch,var(--chart-1)_16%,transparent)]",
                      index === 0 &&
                        "bg-[color:color-mix(in_oklch,var(--chart-2)_84%,white_16%)] shadow-[0_0_0_5px_color-mix(in_oklch,var(--chart-2)_20%,transparent)]",
                    )}
                  />
                  {index === 0 ? "Latest" : "Release"}
                </span>
                <span className="text-[0.68rem] uppercase tracking-[0.16em] text-[color:color-mix(in_oklch,var(--foreground)_68%,var(--muted-foreground)_32%)]">
                  {entry.meta}
                </span>
              </div>
              <div className="h-px bg-[color:color-mix(in_oklch,var(--border)_84%,var(--chart-1)_16%)]" />
              <div className="space-y-3">
                <TypographyH3 className="text-lg font-medium normal-case text-foreground">
                  {entry.title}
                </TypographyH3>
                <TypographyP className="max-w-sm text-sm leading-6 text-muted-foreground">
                  {entry.body}
                </TypographyP>
              </div>
            </div>

            {"href" in entry && entry.href ? (
              <div className="mt-6 pt-1">
                <a
                  href={entry.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-full text-sm font-medium text-[color:color-mix(in_oklch,var(--foreground)_88%,var(--chart-4)_12%)] transition-colors duration-200 ease-out hover:text-[color:color-mix(in_oklch,var(--foreground)_68%,var(--chart-4)_32%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklch,var(--ring)_55%,var(--chart-2)_45%)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {entry.ctaLabel}
                </a>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
