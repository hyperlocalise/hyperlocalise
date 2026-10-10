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
import { CheckIcon } from "@phosphor-icons/react";

import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TypographyH3, TypographyP } from "@/components/ui/typography";
import { trackMarketingCtaClick } from "@/lib/analytics/marketing-cta";
import { cn } from "@/lib/primitives/cn";

import type { PricingPlan } from "./pricing-page-content";

type PricingPlansSectionProps = {
  plans: readonly PricingPlan[];
  popularBadge: string;
};

const signUpHref = "/auth/sign-in";

function PlanCta({ plan }: { plan: PricingPlan }) {
  if (plan.cta.kind === "demo") {
    return (
      <Button
        className="mt-auto w-full"
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
      className="mt-auto w-full"
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
    <div className="grid border-t border-border md:grid-cols-2 xl:grid-cols-4 xl:border-t-0">
      {plans.map((plan, index) => (
        <article
          key={plan.id}
          className={cn(
            "flex flex-col border-border px-5 py-8 sm:px-6 sm:py-10",
            index > 0 && "border-t xl:border-t-0 xl:border-l",
            index === 1 && "md:border-t-0 md:border-l",
            index === 2 && "md:border-l-0 xl:border-l",
            plan.popular && "bg-muted/30",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <TypographyH3 className="pb-0 text-sm font-semibold text-foreground">
              {plan.cardHeading}
            </TypographyH3>
            {plan.badge ? <Badge variant="secondary">{plan.badge}</Badge> : null}
            {plan.popular ? <Badge variant="outline">{popularBadge}</Badge> : null}
          </div>

          <div className="mt-5 flex items-baseline gap-1.5" aria-hidden="true">
            <TypographyP className="m-0 font-heading text-5xl leading-none font-semibold tracking-tight text-foreground md:text-5xl">
              {plan.price}
            </TypographyP>
            {plan.priceSuffix ? (
              <span className="text-sm text-muted-foreground">{plan.priceSuffix}</span>
            ) : null}
          </div>

          <TypographyP className="mt-4" size="small" tone="subtle">
            {plan.description}
          </TypographyP>

          <div className="my-6 border-t border-border" />

          {plan.includesFrom ? (
            <p className="mb-3 text-sm text-muted-foreground">{plan.includesFrom}</p>
          ) : null}

          <ul className="mb-8 flex flex-col gap-3">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm text-muted-foreground">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <PlanCta plan={plan} />
        </article>
      ))}
    </div>
  );
}
