import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";

import { type MarketingChapter } from "./marketing-page-content";
import { ChapterPlaceholder } from "./chapter-placeholder";

const tmsLogos = [
  "Crowdin",
  "Lokalise",
  "Phrase",
  "Smartling",
  "Transifex",
  "Memsource",
  "POEditor",
] as const;

function TmsLogoMarquee() {
  return (
    <div className="mt-8 overflow-hidden">
      <div className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Works with your TMS
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-24" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-24" />
        <div
          className="marketing-marquee flex w-max items-center [--marquee-duration:24s] [--marquee-gap:2rem] motion-reduce:transform-none motion-reduce:animate-none"
          aria-hidden="true"
        >
          {[0, 1].map((track) => (
            <div key={track} className="flex shrink-0 items-center gap-8 pr-8">
              {tmsLogos.map((logo) => (
                <span
                  key={`${track}-${logo}`}
                  className="text-sm font-medium tracking-[0.14em] whitespace-nowrap uppercase text-muted-foreground"
                >
                  {logo}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChapterSection({ chapter }: { chapter: MarketingChapter }) {
  return (
    <section>
      <div className="max-w-2xl">
        <TypographyH2 className="text-4xl sm:text-5xl">{chapter.title}</TypographyH2>
        <TypographyP className="mt-5 max-w-xl text-muted-foreground">
          {chapter.description}
        </TypographyP>
        {chapter.cta ? (
          <div className="mt-5">
            <Button
              variant="outline"
              className="rounded-full border-border bg-muted/40 px-4 text-foreground hover:bg-muted"
              nativeButton={false}
              render={<a href={chapter.cta.href} target="_blank" rel="noreferrer" />}
            >
              {chapter.cta.label}
            </Button>
          </div>
        ) : null}{" "}
        <div className="mt-6 text-sm text-muted-foreground">
          {chapter.id}.0 {chapter.label} <span className="text-foreground/70">→</span>
        </div>
      </div>

      <div className="mt-10">
        <ChapterPlaceholder chapter={chapter} />
      </div>

      <div className="mt-8 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
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
