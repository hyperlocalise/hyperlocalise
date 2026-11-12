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
import type { Icon } from "@phosphor-icons/react";
import {
  BrainIcon,
  ChatCircleTextIcon,
  CpuIcon,
  GitDiffIcon,
  ImageSquareIcon,
  LightningIcon,
  ListChecksIcon,
  SparkleIcon,
  TranslateIcon,
} from "@phosphor-icons/react/ssr";

import { TypographyH2, TypographyP } from "@/components/ui/typography";

import type { PricingAiFeature } from "./pricing-page-content";

const featureIcons: Record<string, Icon> = {
  "ask-about-any-string": ChatCircleTextIcon,
  "visual-context": ImageSquareIcon,
  "translate-in-chat": TranslateIcon,
  "recent-change-briefs": GitDiffIcon,
  "organization-memory": BrainIcon,
  "tms-aware-drafting-qa": ListChecksIcon,
  "agent-automations": LightningIcon,
  "bring-your-own-llm": CpuIcon,
};

type PricingAiFeaturesSectionProps = {
  heading: string;
  subcopy: string;
  features: readonly PricingAiFeature[];
};

export function PricingAiFeaturesSection({
  heading,
  subcopy,
  features,
}: PricingAiFeaturesSectionProps) {
  return (
    <section aria-labelledby="pricing-ai-features-heading" className="space-y-10">
      <div className="max-w-2xl">
        <TypographyH2
          id="pricing-ai-features-heading"
          className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-4xl"
        >
          {heading}
        </TypographyH2>
        <TypographyP className="mt-3 sm:text-lg" tone="subtle">
          {subcopy}
        </TypographyP>
      </div>

      <ul className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => {
          const FeatureIcon = featureIcons[feature.id] ?? SparkleIcon;

          return (
            <li
              key={feature.id}
              className="group flex flex-col gap-4 bg-background p-6 transition-colors hover:bg-primary/[0.03]"
            >
              <span
                aria-hidden
                className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:-translate-y-0.5"
              >
                <FeatureIcon className="size-5" weight="duotone" />
              </span>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-foreground sm:text-base">
                  {feature.title}
                </p>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
