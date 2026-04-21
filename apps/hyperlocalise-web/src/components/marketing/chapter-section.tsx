import Image from "next/image";

import { Button } from "@/components/ui/button";
import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { TypographyH2, TypographyP } from "@/components/ui/typography";

import { type MarketingChapter } from "./marketing-page-content";
import { ChapterPlaceholder } from "./chapter-placeholder";

type TmsLogo = { id: string; src: string };

const tmsLogos: readonly TmsLogo[] = [
  { id: "crowdin", src: "/images/tms/crowdin.png" },
  { id: "lokalise", src: "/images/tms/lokalise.webp" },
  { id: "phrase", src: "/images/tms/phrase.png" },
  { id: "smartling", src: "/images/tms/smartling.png" },
  { id: "transifex", src: "/images/tms/transifex.webp" },
  { id: "poeditor", src: "/images/tms/poeditor.png" },
] as const;

function TmsLogoMarquee() {
  return (
    <div className="mt-12 overflow-hidden">
      <InfiniteSlider gap={12} speed={60}>
          {[...Array(5)].map((_, i) =>
            tmsLogos.map((logo) => (
              <Image
                key={`${logo.id}-${i}`}
                alt={logo.id}
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
        <div className="mt-6 text-sm text-muted-foreground/60">
          {chapter.id} {chapter.label}
        </div>
        <TypographyH2 className="text-4xl sm:text-5xl">{chapter.title}</TypographyH2>
        <TypographyP className="mt-5 max-w-xl text-muted-foreground">
          {chapter.description}
        </TypographyP>
        {chapter.cta ? (
          <div className="mt-5">
            <Button
              variant="secondary"
              className="rounded-full border-border  px-4"
              nativeButton={false}
              render={<a href={chapter.cta.href} target="_blank" rel="noreferrer" />}
            >
              {chapter.cta.label}
            </Button>
          </div>
        ) : null}{" "}
      </div>

      <div className="mt-10">
        <ChapterPlaceholder chapter={chapter} />
      </div>

      <div className="mt-8 grid gap-4 text-sm text-muted-foreground/75 sm:grid-cols-2 lg:grid-cols-4">
        {chapter.links.map((link, index) => (
          <div key={link}>
            {chapter.id}.{index + 1} {link}
          </div>
        ))}
      </div>

      {chapter.id === "02" ? <TmsLogoMarquee /> : null}
    </section>
  );
}
