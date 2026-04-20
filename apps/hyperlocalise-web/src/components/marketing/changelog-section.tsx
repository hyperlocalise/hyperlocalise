import { cn } from "@/lib/utils";
import { TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";

import { changelog } from "./marketing-page-content";

export function ChangelogSection() {
  return (
    <section id="changelog">
      <TypographyH2 className="pb-0 text-4xl font-semibold tracking-[-0.04em] normal-case text-white sm:text-5xl">
        Changelog
      </TypographyH2>

      <div className="mt-10 grid gap-8 md:grid-cols-2 xl:grid-cols-3">
        {changelog.map((entry, index) => (
          <div key={entry.title} className="space-y-4">
            <div className="flex items-center gap-4">
              <span
                className={cn("size-2 rounded-full", index === 0 ? "bg-[#ef4444]" : "bg-white/30")}
              />
              <div className="h-px flex-1 bg-white/8" />
            </div>
            <TypographyH3 className="text-lg font-medium normal-case text-white">
              {entry.title}
            </TypographyH3>
            <TypographyP className="max-w-sm text-sm leading-6 text-white/55">
              {entry.body}
            </TypographyP>
            <div className="text-[0.68rem] uppercase tracking-[0.16em] text-white/30">
              {entry.meta}
            </div>
            {"href" in entry && entry.href ? (
              <div>
                <a
                  href={entry.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-white/75 transition-colors hover:text-white"
                >
                  {entry.ctaLabel}
                </a>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
