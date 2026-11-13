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
import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import {
  BookOpenTextIcon,
  BookmarkIcon,
  CopyIcon,
  HeadsetIcon,
  MinusCircleIcon,
  TextTIcon,
} from "@phosphor-icons/react";
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
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Spinner } from "@/components/ui/spinner";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

import { appShellFooterMessages } from "./app-shell-footer.messages";

const ContentEditorStyleGuideSheet = dynamic(
  () =>
    import("@/components/content-editor/style-guide/content-editor-style-guide-sheet").then(
      (module) => ({
        default: module.ContentEditorStyleGuideSheet,
      }),
    ),
  { ssr: false },
);

const ContentEditorGuidelineSheet = dynamic(
  () =>
    import("@/components/content-editor/guideline/content-editor-guideline-sheet").then(
      (module) => ({
        default: module.ContentEditorGuidelineSheet,
      }),
    ),
  { ssr: false },
);

export function AppShellFooter({
  organizationSlug,
  projectId = null,
  showPlan,
  showGlossaryGuidance = false,
  showIssueGuidance = false,
  showStyleGuide = false,
  showGuideline = false,
  canWriteProjects = false,
  currentUser,
}: {
  organizationSlug: string;
  projectId?: string | null;
  showPlan: boolean;
  showGlossaryGuidance?: boolean;
  showIssueGuidance?: boolean;
  showStyleGuide?: boolean;
  showGuideline?: boolean;
  canWriteProjects?: boolean;
  currentUser?: InboxCurrentUser;
}) {
  const intl = useIntl();
  const showChatDock = Boolean(organizationSlug && currentUser);
  const [styleGuideOpen, setStyleGuideOpen] = useState(false);
  const [styleGuideMounted, setStyleGuideMounted] = useState(false);
  const [guidelineOpen, setGuidelineOpen] = useState(false);
  const [guidelineMounted, setGuidelineMounted] = useState(false);
  const canShowGuideline = showGuideline && Boolean(projectId);
  const canShowStyleGuide = showStyleGuide && Boolean(projectId) && !canShowGuideline;

  useEffect(() => {
    if (!canShowStyleGuide) {
      setStyleGuideOpen(false);
      setStyleGuideMounted(false);
    }
  }, [canShowStyleGuide]);

  useEffect(() => {
    if (!canShowGuideline) {
      setGuidelineOpen(false);
      setGuidelineMounted(false);
    }
  }, [canShowGuideline]);

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
    <footer
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-border bg-background"
      style={{ viewTransitionName: "app-shell-footer" }}
    >
      {showChatDock ? <ChatDockBridge organizationSlug={organizationSlug} /> : null}
      {showChatDock && currentUser ? (
        <ChatDockErrorBoundary organizationSlug={organizationSlug}>
          <ChatDockPanelHost organizationSlug={organizationSlug} currentUser={currentUser} />
        </ChatDockErrorBoundary>
      ) : null}

      <div className="h-(--app-shell-plan-footer-height) shrink-0">
        <Box paddingX="1u" display="flex" alignItems="center" height="full" width="full">
          <Columns spacing="1u" alignY="center" align={showPlan ? "spaceBetween" : "end"}>
            {showPlan ? (
              <Column width="content">
                <PlanUsageFooterControl organizationSlug={organizationSlug} />
              </Column>
            ) : null}
            <Column width="content">
              <Row spacing="1u" alignY="center">
                {canShowGuideline && projectId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setGuidelineMounted(true);
                      setGuidelineOpen(true);
                    }}
                    aria-label={intl.formatMessage(appShellFooterMessages.guidelineAriaLabel)}
                  >
                    <BookmarkIcon data-icon="inline-start" />
                    <FormattedMessage {...appShellFooterMessages.guidelineLabel} />
                  </Button>
                ) : null}
                {canShowStyleGuide && projectId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setStyleGuideMounted(true);
                      setStyleGuideOpen(true);
                    }}
                    aria-label={intl.formatMessage(appShellFooterMessages.styleGuideAriaLabel)}
                  >
                    <TextTIcon data-icon="inline-start" />
                    <FormattedMessage {...appShellFooterMessages.styleGuideLabel} />
                  </Button>
                ) : null}
                {showGlossaryGuidance ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={requestCatGlossaryGuidance}
                    aria-busy={glossaryGuidanceStatus.isLoading}
                  >
                    <BookOpenTextIcon data-icon="inline-start" />
                    <FormattedMessage {...appShellFooterMessages.glossaryGuidanceLabel} />
                    {glossaryGuidanceStatus.isLoading ? (
                      <Spinner
                        className="size-3.5 text-muted-foreground"
                        aria-label={intl.formatMessage(
                          appShellFooterMessages.glossaryGuidanceLoading,
                        )}
                      />
                    ) : (
                      <>
                        {glossaryGuidanceStatus.matchCount > 0 ? (
                          <span
                            data-glossary-guidance-match-count
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-beam-100 px-1.5 text-xs font-semibold tabular-nums text-beam-900 dark:bg-beam-900/40 dark:text-beam-100"
                          >
                            <span aria-hidden="true">{glossaryGuidanceStatus.matchCount}</span>
                            <span className="sr-only">
                              <FormattedMessage
                                {...appShellFooterMessages.glossaryGuidanceMatchCount}
                                values={{ count: glossaryGuidanceStatus.matchCount }}
                              />
                            </span>
                          </span>
                        ) : null}
                        {glossaryGuidanceStatus.notRecommendedCount > 0 ? (
                          <span
                            data-glossary-guidance-not-recommended-count
                            className="inline-flex h-5 items-center gap-0.5 rounded-full bg-rose-500/10 pe-1.5 ps-1 text-xs font-semibold tabular-nums text-rose-600 dark:text-rose-300"
                          >
                            <MinusCircleIcon className="size-3.5" aria-hidden="true" />
                            <span aria-hidden="true">
                              {glossaryGuidanceStatus.notRecommendedCount}
                            </span>
                            <span className="sr-only">
                              <FormattedMessage
                                {...appShellFooterMessages.glossaryGuidanceNotRecommendedCount}
                                values={{ count: glossaryGuidanceStatus.notRecommendedCount }}
                              />
                            </span>
                          </span>
                        ) : null}
                      </>
                    )}
                  </Button>
                ) : null}
                {showIssueGuidance && issueGuidanceStatus.available ? (
                  <Button
                    type="button"
                    variant="ghost"
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
                    <CopyIcon data-icon="inline-start" />
                    <FormattedMessage {...appShellFooterMessages.issueGuidanceLabel} />
                    {issueGuidanceStatus.openIssueCount > 0 ? (
                      <span className="tabular-nums text-xs font-medium text-flame-900 dark:text-flame-100">
                        {issueGuidanceStatus.openIssueCount}
                      </span>
                    ) : null}
                  </Button>
                ) : null}
                {showChatDock ? (
                  <ChatDockFooterControls organizationSlug={organizationSlug} />
                ) : null}
                <Button
                  variant="ghost"
                  render={<a href={`mailto:${SUPPORT_EMAIL}`} />}
                  aria-label={intl.formatMessage(appShellFooterMessages.emailSupportAriaLabel)}
                >
                  <HeadsetIcon data-icon="inline-start" />
                  <FormattedMessage {...appShellFooterMessages.supportLabel} />
                </Button>
              </Row>
            </Column>
          </Columns>
        </Box>
      </div>
      {canShowGuideline && projectId && guidelineMounted ? (
        <ContentEditorGuidelineSheet
          organizationSlug={organizationSlug}
          projectId={projectId}
          open={guidelineOpen}
          onOpenChange={setGuidelineOpen}
          canWriteProjects={canWriteProjects}
        />
      ) : null}
      {canShowStyleGuide && projectId && styleGuideMounted ? (
        <ContentEditorStyleGuideSheet
          organizationSlug={organizationSlug}
          projectId={projectId}
          open={styleGuideOpen}
          onOpenChange={setStyleGuideOpen}
          canWriteProjects={canWriteProjects}
        />
      ) : null}
    </footer>
  );
}
