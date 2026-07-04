"use client";

import { ArrowRightIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";

import { marketingPageMessages } from "./marketing-page-content.messages";
import { principles } from "./marketing-page-content";

export function PrinciplesSection() {
  return (
    <section id="overview">
      <div className="max-w-5xl">
        <TypographyH2>
          A localization operating system in AI era.{" "}
          <span className="text-muted-foreground">
            Built for modern teams with translation, review, sync, and quality control in one
            workflow.
          </span>
        </TypographyH2>
      </div>

      <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-border bg-background shadow-[0_20px_48px_rgba(0,0,0,0.22)] sm:mt-12 sm:rounded-[2rem] sm:shadow-[0_32px_80px_rgba(0,0,0,0.28)]">
        <div className="grid divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {principles.map((item, index) => {
            const chapterNumber = `0${index + 1}.0`;
            const anchorIds = ["translate-task", "providers", "evaluations"] as const;
            const href = `#${anchorIds[index]}`;

            return (
              <article
                key={item.titleKey}
                className="flex flex-col gap-8 px-6 py-7 text-foreground sm:px-7 sm:py-8 lg:min-h-112 lg:justify-between lg:gap-16 lg:px-8 lg:py-9"
              >
                <div className="space-y-8 sm:space-y-12 lg:space-y-16">
                  <TypographyP className="text-[0.95rem] tracking-[-0.02em] text-muted-foreground">
                    {chapterNumber}
                  </TypographyP>

                  <div className="max-w-none space-y-4 sm:max-w-[21ch]">
                    <TypographyH3 className="max-w-none text-balance text-[1.55rem] font-medium leading-[0.98] tracking-[-0.045em] text-foreground sm:max-w-[11ch] sm:text-[2.05rem] sm:tracking-[-0.05em] md:text-[2.05rem] lg:max-w-[10ch] lg:text-[2.15rem] lg:leading-[1.02]">
                      <FormattedMessage {...marketingPageMessages[item.titleKey]} />
                    </TypographyH3>
                    <TypographyP className="max-w-none text-pretty text-[0.95rem] leading-[1.75] text-muted-foreground sm:max-w-[30ch] sm:text-[1rem] sm:leading-7">
                      <FormattedMessage {...marketingPageMessages[item.descriptionKey]} />
                    </TypographyP>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-muted-foreground">
                  <a
                    href={href}
                    className="inline-flex items-center gap-2 text-[1rem] tracking-[-0.02em] transition-colors duration-300 hover:text-subtle-foreground sm:text-[1.05rem]"
                  >
                    <span>Learn more</span>
                    <HugeiconsIcon icon={ArrowRightIcon} className="size-4" strokeWidth={1.7} />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
