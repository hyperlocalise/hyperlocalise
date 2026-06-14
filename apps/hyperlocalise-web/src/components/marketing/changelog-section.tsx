"use client";

import { FormattedMessage } from "react-intl";

import { changelogEntryMessages, changelogSectionMessages } from "./changelog-section.messages";
import { githubReleasesUrl } from "./marketing-page-content";
import { TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

const changelogEntries = [
  {
    fields: {
      title: changelogEntryMessages.v1813Title,
      body: changelogEntryMessages.v1813Body,
      meta: changelogEntryMessages.v1813Meta,
    },
    href: `${githubReleasesUrl}/tag/v1.8.13`,
  },
  {
    fields: {
      title: changelogEntryMessages.v1812Title,
      body: changelogEntryMessages.v1812Body,
      meta: changelogEntryMessages.v1812Meta,
    },
    href: `${githubReleasesUrl}/tag/v1.8.12`,
  },
  {
    fields: {
      title: changelogEntryMessages.v1811Title,
      body: changelogEntryMessages.v1811Body,
      meta: changelogEntryMessages.v1811Meta,
    },
    href: `${githubReleasesUrl}/tag/v1.8.11`,
  },
  {
    fields: {
      title: changelogEntryMessages.v1810Title,
      body: changelogEntryMessages.v1810Body,
      meta: changelogEntryMessages.v1810Meta,
    },
    href: `${githubReleasesUrl}/tag/v1.8.10`,
  },
] as const;

export function ChangelogSection() {
  return (
    <section id="changelog" className="relative">
      <div className="max-w-2xl">
        <TypographyP className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <FormattedMessage {...changelogSectionMessages.eyebrow} />
        </TypographyP>
        <TypographyH2 className="pt-3 pb-0 text-4xl font-semibold tracking-[-0.04em] normal-case text-foreground sm:text-5xl md:text-5xl">
          <FormattedMessage {...changelogSectionMessages.heading} />
        </TypographyH2>
        <TypographyP className="mt-4 max-w-xl text-pretty text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
          <FormattedMessage {...changelogSectionMessages.description} />
        </TypographyP>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {changelogEntries.map((entry, index) => (
          <article
            key={entry.href}
            className={cn(
              "group flex h-full flex-col justify-between rounded-[1.75rem] border p-6 transition-all duration-300 ease-out",
              "bg-[color-mix(in_oklch,var(--background)_96%,var(--muted)_4%)]",
              "border-[color-mix(in_oklch,var(--border)_88%,var(--chart-1)_12%)]",
              "shadow-[inset_0_1px_0_color-mix(in_oklch,var(--background)_78%,transparent)]",
              "hover:-translate-y-0.5 hover:border-[color-mix(in_oklch,var(--border)_70%,var(--chart-2)_30%)]",
              "hover:bg-[color-mix(in_oklch,var(--background)_93%,var(--muted)_7%)]",
              index === 0 &&
                "bg-[color-mix(in_oklch,var(--background)_90%,var(--chart-1)_10%)] border-[color-mix(in_oklch,var(--border)_58%,var(--chart-2)_42%)]",
            )}
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]",
                    "bg-[color-mix(in_oklch,var(--muted)_82%,var(--chart-1)_18%)]",
                    "text-[color-mix(in_oklch,var(--foreground)_82%,var(--chart-4)_18%)]",
                    index === 0
                      ? "bg-[color-mix(in_oklch,var(--muted)_58%,var(--chart-2)_42%)] text-[color-mix(in_oklch,var(--foreground)_88%,var(--chart-4)_12%)]"
                      : "bg-[color-mix(in_oklch,var(--muted)_82%,var(--chart-1)_18%)]",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full bg-[color-mix(in_oklch,var(--chart-2)_78%,white_22%)] shadow-[0_0_0_4px_color-mix(in_oklch,var(--chart-1)_16%,transparent)]",
                      index === 0 &&
                        "bg-[color-mix(in_oklch,var(--chart-2)_84%,white_16%)] shadow-[0_0_0_5px_color-mix(in_oklch,var(--chart-2)_20%,transparent)]",
                    )}
                  />
                  {index === 0 ? (
                    <FormattedMessage {...changelogSectionMessages.latestBadge} />
                  ) : (
                    <FormattedMessage {...changelogSectionMessages.releaseBadge} />
                  )}
                </span>
                <span className="text-[0.68rem] uppercase tracking-[0.16em] text-[color-mix(in_oklch,var(--foreground)_68%,var(--muted-foreground)_32%)]">
                  <FormattedMessage {...entry.fields.meta} />
                </span>
              </div>
              <div className="h-px bg-[color-mix(in_oklch,var(--border)_84%,var(--chart-1)_16%)]" />
              <div className="space-y-3">
                <TypographyH3 className="text-lg font-medium normal-case text-foreground md:text-lg">
                  <FormattedMessage {...entry.fields.title} />
                </TypographyH3>
                <TypographyP className="max-w-sm text-sm leading-6 text-muted-foreground">
                  <FormattedMessage {...entry.fields.body} />
                </TypographyP>
              </div>
            </div>

            <div className="mt-6 pt-1">
              <a
                href={entry.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-full text-sm font-medium text-[color-mix(in_oklch,var(--foreground)_88%,var(--chart-4)_12%)] transition-colors duration-200 ease-out hover:text-[color-mix(in_oklch,var(--foreground)_68%,var(--chart-4)_32%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--ring)_55%,var(--chart-2)_45%)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <FormattedMessage {...changelogSectionMessages.readRelease} />
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
