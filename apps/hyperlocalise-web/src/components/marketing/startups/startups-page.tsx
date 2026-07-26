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
import Image from "next/image";
import Link from "next/link";

import { HomepageFaqSection } from "@/components/marketing/homepage-faq-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import {
  getStartupsFaqItems,
  getStartupsPageCopy,
  slatorUrl,
  startmateLogoSrc,
  startmateUrl,
  startupsHeroImageSrc,
  trustedByLogos,
} from "./startups-page-content";

type StartupsPageProps = {
  locale: string;
};

export function StartupsPage({ locale }: StartupsPageProps) {
  const copy = getStartupsPageCopy(locale);
  const faqItems = getStartupsFaqItems(locale);
  const logoAltById = {
    "heidi-health": copy.heidiHealthAlt,
    tourfinder: copy.tourfinderAlt,
    tourmatic: copy.tourmaticAlt,
  } as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="relative left-1/2 -mt-16 w-screen min-h-[100svh] -translate-x-1/2 overflow-hidden">
        <Image
          src={startupsHeroImageSrc}
          alt=""
          aria-hidden
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_40%]"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/45 to-black/85"
          aria-hidden
        />
        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-5xl flex-col items-center justify-center px-5 py-28 text-center sm:px-8 lg:px-10">
          <p className="font-heading text-sm font-semibold tracking-[0.22em] text-white/70 uppercase sm:text-base">
            {copy.brand}
          </p>
          <TypographyH1 className="mt-5 max-w-3xl text-balance text-white">
            {copy.headline}
          </TypographyH1>
          <p className="mt-5 font-heading text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {copy.offerLine}
          </p>
          <TypographyP className="mt-4 max-w-2xl text-lg text-white/80">{copy.subcopy}</TypographyP>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="bg-white text-neutral-950 hover:bg-white/90"
              nativeButton={false}
              render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
            >
              {copy.applyCta}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              nativeButton={false}
              render={<Link href="/pricing" />}
            >
              {copy.seePricingCta}
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl">
        <section className="border-t border-border" aria-labelledby="startups-why-heading">
          <div className="px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
            <div className="max-w-3xl space-y-4">
              <TypographyH2
                id="startups-why-heading"
                className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-5xl"
              >
                {copy.whyHeading}
              </TypographyH2>
              <TypographyP className="text-lg text-muted-foreground">{copy.whySubcopy}</TypographyP>
            </div>
            <ol className="mt-14 grid gap-10 border-t border-border pt-10 md:grid-cols-3 md:gap-8">
              {copy.benefits.map((benefit, index) => (
                <li key={benefit.id} className="space-y-3">
                  <p className="font-heading text-sm font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="font-heading text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {benefit.title}
                  </h3>
                  <p className="text-base leading-7 text-muted-foreground">{benefit.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-border" aria-labelledby="startups-proof-heading">
          <div className="px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
            <TypographyH2
              id="startups-proof-heading"
              className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-5xl"
            >
              {copy.proofHeading}
            </TypographyH2>

            <div className="mt-12 space-y-8">
              <p className="text-[0.7rem] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                {copy.trustedByLabel}
              </p>
              <ul className="flex flex-wrap items-center gap-2 sm:gap-3">
                {trustedByLogos.map((logo) => (
                  <li key={logo.id}>
                    <a
                      href={logo.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center rounded-lg px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <Image
                        src={logo.src}
                        alt={logoAltById[logo.id]}
                        width={logo.width}
                        height={logo.height}
                        unoptimized={logo.src.endsWith(".svg")}
                        className={cn(
                          "w-auto opacity-70 brightness-0 transition-[opacity,filter] duration-300 group-hover:opacity-100 dark:invert",
                          logo.className,
                        )}
                      />
                    </a>
                  </li>
                ))}
              </ul>
              <TypographyP className="max-w-2xl text-lg text-muted-foreground">
                {copy.tourfinderResult}
              </TypographyP>
            </div>

            <div className="mt-16 border-t border-border pt-10">
              <p className="text-[0.7rem] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                {copy.recognitionHeading}
              </p>
              <ul className="mt-6 grid gap-6 sm:grid-cols-2">
                <li>
                  <a
                    href={startmateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-36 flex-col items-start justify-center gap-4 rounded-xl bg-muted px-8 py-10 transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <Image
                      src={startmateLogoSrc}
                      alt={copy.startmateName}
                      width={220}
                      height={45}
                      unoptimized
                      className="h-9 w-auto opacity-60 brightness-0 dark:invert sm:h-10"
                    />
                    <span className="text-sm text-muted-foreground">
                      {copy.startmateDescription}
                    </span>
                  </a>
                </li>
                <li>
                  <a
                    href={slatorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-36 flex-col items-start justify-center gap-3 rounded-xl bg-muted px-8 py-10 transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span className="font-heading text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                      {copy.slatorName}
                    </span>
                    <span className="text-sm text-muted-foreground">{copy.slatorDescription}</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section
          id="startup-program"
          className="border-t border-border"
          aria-labelledby="startups-program-heading"
        >
          <div className="grid gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-16 lg:px-10">
            <div className="space-y-5">
              <TypographyH2
                id="startups-program-heading"
                className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-5xl"
              >
                {copy.programHeading}
              </TypographyH2>
              <TypographyP className="max-w-xl text-lg text-muted-foreground">
                {copy.programSubcopy}
              </TypographyP>
              <div className="pt-2">
                <Button
                  size="lg"
                  nativeButton={false}
                  render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
                >
                  {copy.applyCta}
                </Button>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 px-6 py-8 sm:px-8">
              <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {copy.eligibilityHeading}
              </h3>
              <ul className="mt-6 space-y-4">
                {copy.eligibility.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 border-t border-border pt-4 text-base text-muted-foreground first:border-t-0 first:pt-0"
                  >
                    <span
                      aria-hidden
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-border scroll-mt-24">
          <div className="px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
            <HomepageFaqSection items={faqItems} />
          </div>
        </section>

        <section className="border-t border-border" aria-labelledby="startups-final-cta-heading">
          <div className="px-5 py-20 text-center sm:px-8 sm:py-24 lg:px-10">
            <TypographyH2
              id="startups-final-cta-heading"
              className="pb-0 text-4xl leading-[1.04] font-semibold tracking-[-0.04em] normal-case sm:text-5xl"
            >
              {copy.finalHeading}
            </TypographyH2>
            <TypographyP className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              {copy.finalSubcopy}
            </TypographyP>
            <div className="mt-8 flex justify-center">
              <Button
                size="lg"
                nativeButton={false}
                render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
              >
                {copy.applyCta}
              </Button>
            </div>
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
