"use client";

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

import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import {
  BookOpenTextIcon,
  BuildingsIcon,
  CoinsIcon,
  FlowArrowIcon,
  FolderSimpleIcon,
  HandshakeIcon,
  HeadsetIcon,
  KanbanIcon,
  KeyIcon,
  LeafIcon,
  LightningIcon,
  PlugsConnectedIcon,
  RobotIcon,
  RocketLaunchIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  TranslateIcon,
  TrendUpIcon,
  UsersIcon,
} from "@phosphor-icons/react";

import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { TypographyH3, TypographyP } from "@/components/ui/typography";
import { trackMarketingCtaClick } from "@/lib/analytics/marketing-cta";
import { cn } from "@/lib/primitives/cn";

import type { PricingFeatureIcon, PricingPlan, PricingPlanId } from "./pricing-page-content";

type PricingPlansSectionProps = {
  plans: readonly PricingPlan[];
  popularBadge: string;
};

const signUpHref = "/auth/sign-in";

const planIcons: Record<PricingPlanId, Icon> = {
  free: LeafIcon,
  starter: RocketLaunchIcon,
  growth: TrendUpIcon,
  enterprise: BuildingsIcon,
};

const featureIcons: Record<PricingFeatureIcon, Icon> = {
  projects: FolderSimpleIcon,
  seats: UsersIcon,
  integrations: PlugsConnectedIcon,
  ai: SparkleIcon,
  queries: KanbanIcon,
  credit: CoinsIcon,
  automations: LightningIcon,
  "agent-runs": RobotIcon,
  translation: TranslateIcon,
  workflow: FlowArrowIcon,
  limits: SlidersHorizontalIcon,
  sso: KeyIcon,
  sla: HandshakeIcon,
  support: HeadsetIcon,
  security: ShieldCheckIcon,
  guidelines: BookOpenTextIcon,
  "guideline-checks": SealCheckIcon,
};

/** Primary-tinted dot grid for the featured plan, faded toward the bottom. */
const DOT_GRID_STYLE = {
  backgroundImage:
    "radial-gradient(color-mix(in oklab, var(--primary) 26%, transparent) 1px, transparent 1px)",
  backgroundSize: "12px 12px",
  maskImage: "linear-gradient(to bottom, black, transparent 60%)",
  WebkitMaskImage: "linear-gradient(to bottom, black, transparent 60%)",
} as const;

function PlanCta({ plan }: { plan: PricingPlan }) {
  if (plan.cta.kind === "demo") {
    return (
      <Button
        className="w-full"
        size="lg"
        variant="outline"
        nativeButton={false}
        render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
        onClick={() => trackMarketingCtaClick("request_demo", "pricing")}
      >
        {plan.cta.label}
      </Button>
    );
  }

  return (
    <Button
      className="w-full"
      size="lg"
      variant={plan.popular ? "default" : "outline"}
      nativeButton={false}
      render={<Link href={signUpHref} prefetch={false} />}
      onClick={() => trackMarketingCtaClick("sign_up", "pricing")}
    >
      {plan.cta.label}
    </Button>
  );
}

export function PricingPlansSection({ plans, popularBadge }: PricingPlansSectionProps) {
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => {
        const PlanIcon = planIcons[plan.id];

        return (
          <article
            key={plan.id}
            className={cn(
              "relative isolate flex flex-col bg-background p-6 sm:p-7",
              plan.popular && "bg-[color-mix(in_oklab,var(--primary)_5%,var(--background))]",
            )}
          >
            {plan.popular ? (
              <div aria-hidden className="absolute inset-0 -z-10" style={DOT_GRID_STYLE} />
            ) : null}

            <div className="flex min-h-7 items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <PlanIcon
                  aria-hidden
                  className={cn("size-5", plan.popular ? "text-primary" : "text-muted-foreground")}
                  weight="fill"
                />
                <TypographyH3 size="xsmall" className="pb-0 text-lg font-medium text-foreground">
                  <span aria-hidden>{plan.name}</span>
                  <span className="sr-only">{plan.cardHeading}</span>
                </TypographyH3>
              </div>
              {plan.popular ? (
                <span className="rounded-md border border-primary/40 bg-background/70 px-2 py-0.5 text-xs font-medium text-primary">
                  {popularBadge}
                </span>
              ) : plan.badge ? (
                <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {plan.badge}
                </span>
              ) : null}
            </div>

            <div className="mt-6 flex items-baseline gap-1.5" aria-hidden="true">
              <span className="font-heading text-5xl leading-none font-medium tracking-tight text-foreground">
                {plan.price}
              </span>
              {plan.priceSuffix ? (
                <span className="text-sm text-muted-foreground">{plan.priceSuffix}</span>
              ) : null}
            </div>

            <TypographyP className="mt-3 min-h-10" size="small" tone="subtle">
              {plan.description}
            </TypographyP>

            {plan.includesFrom ? (
              <p className="mt-6 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {plan.includesFrom}
              </p>
            ) : null}

            <ul className={cn("mb-8 border-b border-border", plan.includesFrom ? "mt-3" : "mt-6")}>
              {plan.features.map((feature, featureIndex) => {
                const iconKey = plan.featureIcons[featureIndex];
                const FeatureIcon = iconKey ? featureIcons[iconKey] : SparkleIcon;

                return (
                  <li
                    key={feature}
                    className="flex items-center gap-3 border-t border-border py-3 text-sm text-foreground"
                  >
                    <FeatureIcon
                      aria-hidden
                      className="size-[1.125rem] shrink-0 text-primary"
                      weight="duotone"
                    />
                    <span>{feature}</span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-auto">
              <PlanCta plan={plan} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
