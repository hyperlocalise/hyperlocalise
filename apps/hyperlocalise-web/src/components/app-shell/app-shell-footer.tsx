"use client";

import { CustomerSupportIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { InboxCurrentUser } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/inbox-types";
import {
  ChatDockBridge,
  ChatDockFooterControls,
  ChatDockPanelHost,
} from "@/components/app-shell/chat-dock/chat-dock";
import { PlanUsageFooterControl } from "@/components/billing/plan-usage-summary";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SUPPORT_EMAIL = "minh@hyperlocalise.com";

export function AppShellFooter({
  organizationSlug,
  showPlan,
  currentUser,
}: {
  organizationSlug: string;
  showPlan: boolean;
  currentUser?: InboxCurrentUser;
}) {
  const showChatDock = Boolean(organizationSlug && currentUser);

  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-border bg-background">
      {showChatDock ? <ChatDockBridge organizationSlug={organizationSlug} /> : null}
      {showChatDock && currentUser ? (
        <ChatDockPanelHost organizationSlug={organizationSlug} currentUser={currentUser} />
      ) : null}

      <div className="flex h-[var(--app-shell-plan-footer-height)] shrink-0 items-stretch px-2">
        <div className="flex h-10 w-full items-center gap-2">
          {showPlan ? <PlanUsageFooterControl organizationSlug={organizationSlug} /> : null}
          <div className="ms-auto flex min-w-0 items-center gap-2">
            {showChatDock ? <ChatDockFooterControls organizationSlug={organizationSlug} /> : null}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
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
          </div>
        </div>
      </div>
    </footer>
  );
}
