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

import { TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";

import type { PricingModelsSectionContent } from "./pricing-page-content";

type PricingModelsSectionProps = PricingModelsSectionContent;

const byokProviderLogos: Record<string, { src: string; width: number; height: number }> = {
  openai: { src: "/images/openai-old-logo.webp", width: 32, height: 32 },
  anthropic: { src: "/images/claude.png", width: 32, height: 32 },
  gemini: { src: "/images/gemini.webp", width: 32, height: 32 },
};

export function PricingModelsSection({
  heading,
  subcopy,
  includedTitle,
  includedDescription,
  includedRows,
  byokTitle,
  byokDescription,
  byokProviders,
  byokFeatures,
  byokFootnote,
}: PricingModelsSectionProps) {
  return (
    <section aria-labelledby="pricing-models-heading" className="space-y-10">
      <div className="max-w-2xl">
        <TypographyH2
          id="pricing-models-heading"
          className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-4xl"
        >
          {heading}
        </TypographyH2>
        <TypographyP className="mt-3 sm:text-lg" tone="subtle">
          {subcopy}
        </TypographyP>
      </div>

      <div className="grid gap-10 border-t border-border pt-10 lg:grid-cols-2 lg:gap-16">
        <div className="space-y-6">
          <div>
            <TypographyH3 className="text-xl sm:text-2xl">{includedTitle}</TypographyH3>
            <TypographyP className="mt-2 text-sm sm:text-base" tone="subtle">
              {includedDescription}
            </TypographyP>
          </div>

          <ul className="divide-y divide-border border-y border-border">
            {includedRows.map((row) => (
              <li
                key={row.id}
                className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-6"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground sm:text-base">
                    {row.capability}
                  </p>
                  {row.detail ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{row.detail}</p>
                  ) : null}
                </div>
                <p className="font-mono text-xs text-foreground sm:text-right sm:text-sm">
                  {row.model}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-6">
          <div>
            <TypographyH3 className="text-xl sm:text-2xl">{byokTitle}</TypographyH3>
            <TypographyP className="mt-2 text-sm sm:text-base" tone="subtle">
              {byokDescription}
            </TypographyP>
          </div>

          <ul className="flex flex-wrap gap-3" aria-label={byokProvidersAriaLabel(byokProviders)}>
            {byokProviders.map((provider) => {
              const logo = byokProviderLogos[provider.id];
              return (
                <li
                  key={provider.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium text-foreground"
                >
                  {logo ? (
                    <Image
                      alt=""
                      aria-hidden
                      className="size-5 rounded-full object-cover"
                      height={logo.height}
                      src={logo.src}
                      unoptimized
                      width={logo.width}
                    />
                  ) : null}
                  {provider.name}
                </li>
              );
            })}
          </ul>

          <ul className="space-y-3">
            {byokFeatures.map((feature) => (
              <li
                key={feature.id}
                className="flex gap-2 text-sm text-muted-foreground sm:text-base"
              >
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground" />
                <span>{feature.text}</span>
              </li>
            ))}
          </ul>

          <TypographyP className="text-sm" tone="subtle">
            {byokFootnote}
          </TypographyP>
        </div>
      </div>
    </section>
  );
}

function byokProvidersAriaLabel(providers: PricingModelsSectionContent["byokProviders"]): string {
  return providers.map((provider) => provider.name).join(", ");
}
