/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";

import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";

import {
  companyHeroImageSrc,
  founders,
  getCompanyPageCopy,
  startmateLogoSrc,
  startmateUrl,
} from "./company-page-content";

type CompanyPageProps = {
  locale: string;
};

export function CompanyPage({ locale }: CompanyPageProps) {
  const copy = getCompanyPageCopy(locale);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <section className="px-5 pt-16 pb-16 sm:px-8 sm:pt-20 sm:pb-20 lg:px-10">
          <div className="max-w-4xl space-y-6">
            <TypographyH1>{copy.headline}</TypographyH1>
            <TypographyP className="max-w-2xl text-lg text-muted-foreground">
              {copy.subcopy}
            </TypographyP>
            <div className="pt-2">
              <Button
                size="lg"
                nativeButton={false}
                render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
              >
                {copy.requestDemo}
              </Button>
            </div>
          </div>
          <div className="relative mt-12 aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted sm:mt-14 sm:aspect-[16/7] sm:rounded-2xl">
            <Image
              src={companyHeroImageSrc}
              alt=""
              aria-hidden
              fill
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover object-center"
            />
          </div>
        </section>

        <section className="border-t border-border" aria-labelledby="company-backed-by-heading">
          <div className="px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
            <TypographyH2
              id="company-backed-by-heading"
              className="pb-0 text-3xl leading-tight tracking-[-0.03em] text-muted-foreground sm:text-4xl md:text-5xl"
            >
              {copy.backedByHeading}
            </TypographyH2>
            <div className="mt-8 border-t border-border pt-8">
              <a
                href={startmateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-36 max-w-md flex-col items-start justify-center gap-4 rounded-xl bg-muted px-8 py-10 transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Image
                  src={startmateLogoSrc}
                  alt={copy.startmateName}
                  width={220}
                  height={45}
                  unoptimized
                  className="h-9 w-auto opacity-60 brightness-0 dark:invert sm:h-10"
                />
                <span className="text-sm text-muted-foreground">{copy.startmateDescription}</span>
              </a>
            </div>
          </div>
        </section>

        <section className="border-t border-border" aria-labelledby="company-founders-note-heading">
          <div className="grid gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-16 lg:px-10">
            <TypographyH2
              id="company-founders-note-heading"
              className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-5xl lg:sticky lg:top-24"
            >
              {copy.foundersNoteHeading}
            </TypographyH2>
            <div className="space-y-5">
              {copy.foundersNoteParagraphs.map((paragraph) => (
                <TypographyP
                  key={paragraph}
                  className="text-base leading-7 text-muted-foreground sm:text-lg"
                >
                  {paragraph}
                </TypographyP>
              ))}
              <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-6">
                {founders.map((founder) => (
                  <span
                    key={founder.id}
                    className="font-heading text-lg font-semibold tracking-tight text-foreground"
                  >
                    {founder.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border" aria-labelledby="company-team-heading">
          <div className="px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
            <TypographyH2
              id="company-team-heading"
              className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-4xl"
            >
              {copy.teamHeading}
            </TypographyH2>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 sm:gap-6">
              {founders.map((founder) => (
                <li
                  key={founder.id}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-foreground text-background">
                    <div className="absolute inset-x-0 top-0 z-10 px-6 pt-8 text-center">
                      <p className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                        {founder.name}
                      </p>
                      <p className="mt-2 text-sm font-medium text-background/85 sm:text-base">
                        {copy.cofounderRole}
                      </p>
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%]">
                      <Image
                        src={founder.photoSrc}
                        alt={founder.name}
                        fill
                        sizes="(max-width: 640px) 100vw, 40vw"
                        className="object-cover object-top grayscale contrast-125"
                      />
                      <div
                        aria-hidden
                        className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-foreground/30 to-transparent"
                      />
                    </div>
                  </div>
                  <div className="border-t border-border px-5 py-4">
                    <a
                      href={founder.linkedInUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {copy.linkedInLabel}
                      <HugeiconsIcon
                        icon={ArrowUpRight01Icon}
                        strokeWidth={2}
                        className="size-3.5"
                      />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="px-5 pt-20 sm:px-8 sm:pt-24 lg:px-10">
            <MarketingFooter columns={footerColumns} />
          </div>
        </section>
      </div>
    </div>
  );
}
