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
import { CustomerSupportIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import type { InboxCurrentUser } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/inbox-types";
import {
  ChatDockBridge,
  ChatDockFooterControls,
  ChatDockPanelHost,
} from "@/components/app-shell/chat-dock/chat-dock";
import { ChatDockErrorBoundary } from "@/components/app-shell/chat-dock/chat-dock-error-boundary";
import { PlanUsageFooterControl } from "@/components/billing/plan-usage-summary";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

import { appShellFooterMessages } from "./app-shell-footer.messages";

export function AppShellFooter({
  organizationSlug,
  showPlan,
  currentUser,
}: {
  organizationSlug: string;
  showPlan: boolean;
  currentUser?: InboxCurrentUser;
}) {
  const intl = useIntl();
  const showChatDock = Boolean(organizationSlug && currentUser);

  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-border bg-background">
      {showChatDock ? <ChatDockBridge organizationSlug={organizationSlug} /> : null}
      {showChatDock && currentUser ? (
        <ChatDockErrorBoundary organizationSlug={organizationSlug}>
          <ChatDockPanelHost organizationSlug={organizationSlug} currentUser={currentUser} />
        </ChatDockErrorBoundary>
      ) : null}

      <div className="flex h-(--app-shell-plan-footer-height) shrink-0 items-stretch px-2">
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
                    aria-label={intl.formatMessage(appShellFooterMessages.emailSupportAriaLabel)}
                  >
                    <HugeiconsIcon icon={CustomerSupportIcon} strokeWidth={2} />
                  </Button>
                }
              />
              <TooltipContent side="top" align="end">
                <FormattedMessage {...appShellFooterMessages.supportTooltip} />
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </footer>
  );
}
