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
import { CheckIcon, GaugeIcon, LayersIcon, ShieldCheckIcon, type LucideIcon } from "lucide-react";

import { TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import type {
  PricingMatrixCell,
  PricingMatrixSection,
  PricingPlan,
  PricingPlanId,
} from "./pricing-page-content";
import { pricingPlanOrder } from "./pricing-page-content";

type PricingComparisonMatrixProps = {
  plans: readonly PricingPlan[];
  sections: readonly PricingMatrixSection[];
  heading: string;
  subcopy: string;
  includedAriaLabel: string;
  notIncludedAriaLabel: string;
};

const sectionIcons: Record<string, { icon: LucideIcon; className: string }> = {
  workspace: {
    icon: LayersIcon,
    className: "bg-blue-100 text-blue-900",
  },
  usage: {
    icon: GaugeIcon,
    className: "bg-amber-100 text-amber-900",
  },
  enterprise: {
    icon: ShieldCheckIcon,
    className: "bg-purple-100 text-purple-900",
  },
};

function MatrixCellValue({
  cell,
  includedAriaLabel,
  notIncludedAriaLabel,
}: {
  cell: PricingMatrixCell;
  includedAriaLabel: string;
  notIncludedAriaLabel: string;
}) {
  if (cell.kind === "check") {
    return <CheckIcon className="size-4 text-foreground" aria-label={includedAriaLabel} />;
  }

  if (cell.kind === "dash") {
    return (
      <span className="text-muted-foreground" aria-label={notIncludedAriaLabel}>
        —
      </span>
    );
  }

  return <span className="text-sm font-medium text-foreground">{cell.value}</span>;
}

export function PricingComparisonMatrix({
  plans,
  sections,
  heading,
  subcopy,
  includedAriaLabel,
  notIncludedAriaLabel,
}: PricingComparisonMatrixProps) {
  const planById = Object.fromEntries(plans.map((plan) => [plan.id, plan])) as Record<
    PricingPlanId,
    PricingPlan
  >;

  return (
    <section aria-labelledby="pricing-compare-heading" className="space-y-10">
      <div className="max-w-2xl">
        <TypographyH2
          id="pricing-compare-heading"
          className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-4xl"
        >
          {heading}
        </TypographyH2>
        <TypographyP className="mt-3 text-base text-muted-foreground sm:text-lg">
          {subcopy}
        </TypographyP>
      </div>

      <div className="max-xl:overflow-x-auto">
        <div className="min-w-[48rem] xl:min-w-0">
          <div className="sticky top-16 z-30 grid grid-cols-[minmax(12rem,1.4fr)_repeat(4,minmax(6.5rem,1fr))] items-end gap-3 border-b border-border bg-background py-4">
            <div aria-hidden className="min-w-0" />
            {pricingPlanOrder.map((planId) => {
              const plan = planById[planId];
              return (
                <div key={planId} className="min-w-0 text-center">
                  <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plan.price}
                    {plan.priceSuffix ? ` ${plan.priceSuffix}` : null}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="divide-y divide-border">
            {sections.map((section) => {
              const sectionIcon = sectionIcons[section.id];
              const Icon = sectionIcon?.icon;

              return (
                <div key={section.id} className="py-8">
                  <div className="mb-5 max-w-xl">
                    <div className="flex items-center gap-3">
                      {Icon ? (
                        <span
                          aria-hidden
                          className={cn(
                            "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
                            sectionIcon.className,
                          )}
                        >
                          <Icon className="size-4" strokeWidth={1.75} />
                        </span>
                      ) : null}
                      <TypographyH3 className="text-lg md:text-lg">{section.title}</TypographyH3>
                    </div>
                    <TypographyP className="mt-2 text-sm text-muted-foreground">
                      {section.description}
                    </TypographyP>
                  </div>

                  <div className="divide-y divide-border border-t border-border">
                    {section.rows.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[minmax(12rem,1.4fr)_repeat(4,minmax(6.5rem,1fr))] items-center gap-3 py-4"
                      >
                        <p className="text-sm text-foreground">{row.label}</p>
                        {pricingPlanOrder.map((planId) => (
                          <div key={planId} className="flex justify-center text-center">
                            <MatrixCellValue
                              cell={row.cells[planId]}
                              includedAriaLabel={includedAriaLabel}
                              notIncludedAriaLabel={notIncludedAriaLabel}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
