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

import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
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
    <section aria-labelledby="pricing-models-heading">
      <Rows spacing="6u">
        <div className="max-w-2xl">
          <Rows spacing="1.5u">
            <TypographyH2
              id="pricing-models-heading"
              className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-4xl"
            >
              {heading}
            </TypographyH2>
            <TypographyP className="sm:text-lg" tone="subtle">
              {subcopy}
            </TypographyP>
          </Rows>
        </div>

        <div className="border-t border-border pt-10">
          <Columns spacing="8u" collapseBelow="large">
            <Column width="1/2">
              <Rows spacing="3u">
                <Rows spacing="1u">
                  <TypographyH3 className="text-xl sm:text-2xl">{includedTitle}</TypographyH3>
                  <TypographyP className="text-sm sm:text-base" tone="subtle">
                    {includedDescription}
                  </TypographyP>
                </Rows>

                <ul className="divide-y divide-border border-y border-border">
                  {includedRows.map((row) => (
                    <li key={row.id} className="py-4">
                      <Columns spacing="3u" collapseBelow="small" alignY="baseline">
                        <Column width="fluid">
                          <Rows spacing="0.5u">
                            <p className="text-sm font-semibold text-foreground sm:text-base">
                              {row.capability}
                            </p>
                            {row.detail ? (
                              <p className="text-sm text-muted-foreground">{row.detail}</p>
                            ) : null}
                          </Rows>
                        </Column>
                        <Column width="content">
                          <Rows spacing="0.5u" align="end" aria-label={row.capability}>
                            {row.models.map((model) => (
                              <p
                                key={model}
                                className="font-mono text-xs text-foreground sm:text-sm"
                              >
                                {model}
                              </p>
                            ))}
                          </Rows>
                        </Column>
                      </Columns>
                    </li>
                  ))}
                </ul>
              </Rows>
            </Column>

            <Column width="1/2">
              <Rows spacing="3u">
                <Rows spacing="1u">
                  <TypographyH3 className="text-xl sm:text-2xl">{byokTitle}</TypographyH3>
                  <TypographyP className="text-sm sm:text-base" tone="subtle">
                    {byokDescription}
                  </TypographyP>
                </Rows>

                <ul
                  className="flex flex-col gap-4"
                  aria-label={byokProvidersAriaLabel(byokProviders)}
                >
                  {byokProviders.map((provider) => {
                    const logo = byokProviderLogos[provider.id];
                    return (
                      <li key={provider.id}>
                        <Box
                          background="muted"
                          border="standard"
                          borderRadius="standard"
                          padding="2u"
                        >
                          <Rows spacing="1u">
                            <Row spacing="1u" alignY="center">
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
                              <p className="text-sm font-medium text-foreground">{provider.name}</p>
                            </Row>
                            <Rows spacing="0.5u">
                              {provider.models.map((model) => (
                                <p
                                  key={model}
                                  className="font-mono text-xs text-muted-foreground sm:text-sm"
                                >
                                  {model}
                                </p>
                              ))}
                            </Rows>
                          </Rows>
                        </Box>
                      </li>
                    );
                  })}
                </ul>

                <ul className="flex flex-col gap-3">
                  {byokFeatures.map((feature) => (
                    <li key={feature.id}>
                      <Row spacing="2u" alignY="start">
                        <span
                          aria-hidden
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground"
                        />
                        <p className="text-sm text-muted-foreground sm:text-base">{feature.text}</p>
                      </Row>
                    </li>
                  ))}
                </ul>

                <TypographyP className="text-sm" tone="subtle">
                  {byokFootnote}
                </TypographyP>
              </Rows>
            </Column>
          </Columns>
        </div>
      </Rows>
    </section>
  );
}

function byokProvidersAriaLabel(providers: PricingModelsSectionContent["byokProviders"]): string {
  return providers.map((provider) => provider.name).join(", ");
}
