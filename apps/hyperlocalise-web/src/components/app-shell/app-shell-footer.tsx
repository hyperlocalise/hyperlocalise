"use client";

import { CustomerSupportIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { PlanUsageFooterControl } from "@/components/billing/plan-usage-summary";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SUPPORT_EMAIL = "minh@hyperlocalise.com";

export function AppShellFooter({
  organizationSlug,
  showPlan,
}: {
  organizationSlug: string;
  showPlan: boolean;
}) {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 flex min-h-10 items-center border-t border-border bg-background px-2 pb-[env(safe-area-inset-bottom)]">
      {showPlan ? <PlanUsageFooterControl organizationSlug={organizationSlug} /> : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="ms-auto"
              render={<a href={`mailto:${SUPPORT_EMAIL}`} />}
              aria-label="Email support"
            >
              <HugeiconsIcon icon={CustomerSupportIcon} strokeWidth={2} />
            </Button>
          }
        />
        <TooltipContent side="top" align="end">
          Support
        </TooltipContent>
      </Tooltip>
    </footer>
  );
}
