"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import Image from "next/image";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { TypographyH2, TypographyP } from "@/components/ui/typography";

import { ChapterPlaceholder } from "./chapter-placeholder";
import { chapterSectionMessages } from "./chapter-section.messages";
import { type MarketingChapter } from "./marketing-page-content";
import { marketingPageMessages } from "./marketing-page-content.messages";

type TmsLogo = { id: string; src: string; altKey: keyof typeof chapterSectionMessages };

const tmsLogos: readonly TmsLogo[] = [
  { id: "crowdin", src: "/images/tms/crowdin.png", altKey: "crowdinAlt" },
  { id: "lokalise", src: "/images/tms/lokalise.webp", altKey: "lokaliseAlt" },
  { id: "phrase", src: "/images/tms/phrase.png", altKey: "phraseAlt" },
  { id: "smartling", src: "/images/tms/smartling.png", altKey: "smartlingAlt" },
] as const;

function TmsLogoMarquee() {
  const intl = useIntl();

  return (
    <div className="mt-12 overflow-hidden">
      <InfiniteSlider gap={12} speed={60}>
        {[...Array(5)].map((_, i) =>
          tmsLogos.map((logo) => (
            <Image
              key={`${logo.id}-${i}`}
              alt={intl.formatMessage(chapterSectionMessages[logo.altKey])}
              className="h-8 md:h-12 w-auto rounded object-cover"
              height={32}
              src={logo.src}
              unoptimized
              width={80}
            />
          )),
        )}
      </InfiniteSlider>
    </div>
  );
}

export function ChapterSection({ chapter }: { chapter: MarketingChapter }) {
  return (
    <section>
      <div className="max-w-2xl space-y-1.5">
        <div className="mt-6 text-sm text-muted-foreground">
          <FormattedMessage {...marketingPageMessages[chapter.labelKey]} />
        </div>
        <TypographyH2 className="text-4xl sm:text-5xl">
          <FormattedMessage {...marketingPageMessages[chapter.titleKey]} />
        </TypographyH2>
        <TypographyP className="mt-5 max-w-xl text-muted-foreground">
          <FormattedMessage {...marketingPageMessages[chapter.descriptionKey]} />
        </TypographyP>
        {"cta" in chapter && chapter.cta ? (
          <div className="mt-5">
            <Button
              variant="secondary"
              className="rounded-full border-border px-4"
              nativeButton={false}
              render={<a href={chapter.cta.href} target="_blank" rel="noopener noreferrer" />}
            >
              <FormattedMessage {...marketingPageMessages[chapter.cta.labelKey]} />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-10">
        <ChapterPlaceholder chapter={chapter} />
      </div>

      <div className="mt-8 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        {chapter.linkKeys.map((linkKey) => (
          <div key={linkKey}>
            <FormattedMessage {...marketingPageMessages[linkKey]} />
          </div>
        ))}
      </div>

      {chapter.id === "02" ? <TmsLogoMarquee /> : null}
    </section>
  );
}
