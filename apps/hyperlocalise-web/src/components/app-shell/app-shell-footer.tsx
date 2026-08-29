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
import { useSyncExternalStore } from "react";
import {
  BookOpenTextIcon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  CustomerSupportIcon,
  MinusSignCircleIcon,
} from "@hugeicons/core-free-icons";
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
import {
  getCatGlossaryGuidanceServerSnapshot,
  getCatGlossaryGuidanceStatus,
  requestCatGlossaryGuidance,
  subscribeCatGlossaryGuidance,
} from "@/components/content-editor/intelligence/content-editor-glossary-guidance-event";
import {
  getCatIssueGuidanceServerSnapshot,
  getCatIssueGuidanceStatus,
  requestCatIssueGuidance,
  subscribeCatIssueGuidance,
} from "@/components/content-editor/issues/content-editor-issue-guidance-event";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

import { appShellFooterMessages } from "./app-shell-footer.messages";

export function AppShellFooter({
  organizationSlug,
  showPlan,
  showGlossaryGuidance = false,
  showIssueGuidance = false,
  currentUser,
}: {
  organizationSlug: string;
  showPlan: boolean;
  showGlossaryGuidance?: boolean;
  showIssueGuidance?: boolean;
  currentUser?: InboxCurrentUser;
}) {
  const intl = useIntl();
  const showChatDock = Boolean(organizationSlug && currentUser);
  const glossaryGuidanceStatus = useSyncExternalStore(
    subscribeCatGlossaryGuidance,
    getCatGlossaryGuidanceStatus,
    getCatGlossaryGuidanceServerSnapshot,
  );
  const issueGuidanceStatus = useSyncExternalStore(
    subscribeCatIssueGuidance,
    getCatIssueGuidanceStatus,
    getCatIssueGuidanceServerSnapshot,
  );

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
            {showGlossaryGuidance ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="gap-1.5 px-2"
                onClick={requestCatGlossaryGuidance}
                aria-label={intl.formatMessage(
                  glossaryGuidanceStatus.matchCount > 0 ||
                    glossaryGuidanceStatus.preferredCount > 0 ||
                    glossaryGuidanceStatus.notRecommendedCount > 0
                    ? appShellFooterMessages.glossaryGuidanceAvailableAriaLabel
                    : appShellFooterMessages.glossaryGuidanceAriaLabel,
                )}
              >
                <HugeiconsIcon icon={BookOpenTextIcon} strokeWidth={2} className="size-3.5" />
                <FormattedMessage {...appShellFooterMessages.glossaryGuidanceLabel} />
                {glossaryGuidanceStatus.preferredCount > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-500">
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      strokeWidth={2}
                      className="size-4"
                      aria-hidden="true"
                    />
                    <span className="tabular-nums">{glossaryGuidanceStatus.preferredCount}</span>
                  </span>
                ) : null}
                {glossaryGuidanceStatus.notRecommendedCount > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-500">
                    <HugeiconsIcon
                      icon={MinusSignCircleIcon}
                      strokeWidth={2}
                      className="size-4"
                      aria-hidden="true"
                    />
                    <span className="tabular-nums">
                      {glossaryGuidanceStatus.notRecommendedCount}
                    </span>
                  </span>
                ) : null}
              </Button>
            ) : null}
            {showIssueGuidance && issueGuidanceStatus.available ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="gap-1.5 px-2"
                onClick={requestCatIssueGuidance}
                aria-label={intl.formatMessage(
                  issueGuidanceStatus.openIssueCount > 0
                    ? appShellFooterMessages.issueGuidanceAvailableAriaLabel
                    : appShellFooterMessages.issueGuidanceAriaLabel,
                  issueGuidanceStatus.openIssueCount > 0
                    ? { count: issueGuidanceStatus.openIssueCount }
                    : undefined,
                )}
              >
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3.5" />
                <FormattedMessage {...appShellFooterMessages.issueGuidanceLabel} />
                {issueGuidanceStatus.openIssueCount > 0 ? (
                  <span className="tabular-nums text-xs font-medium text-flame-900 dark:text-flame-100">
                    {issueGuidanceStatus.openIssueCount}
                  </span>
                ) : null}
              </Button>
            ) : null}
            {showChatDock ? <ChatDockFooterControls organizationSlug={organizationSlug} /> : null}
            <Button
              variant="ghost"
              size="xs"
              className="gap-1.5 px-2"
              render={<a href={`mailto:${SUPPORT_EMAIL}`} />}
              aria-label={intl.formatMessage(appShellFooterMessages.emailSupportAriaLabel)}
            >
              <HugeiconsIcon icon={CustomerSupportIcon} strokeWidth={2} className="size-3.5" />
              <FormattedMessage {...appShellFooterMessages.supportLabel} />
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
}
