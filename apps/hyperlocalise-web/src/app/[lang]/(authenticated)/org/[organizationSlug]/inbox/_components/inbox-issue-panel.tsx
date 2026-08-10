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
import { useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { IssueDetailNavigationGuard } from "../../_components/issue-detail/issue-detail-navigation-guard";
import {
  IssueDetailPanel,
  type IssueDetailPanelHandle,
} from "../../_components/issue-detail/issue-detail-panel";
import { useIssueDetailQuery } from "../../_components/issue-detail/use-issue-detail-query";

import { inboxNotificationsMessages as messages } from "./inbox-notifications.messages";

export function InboxIssuePanel({
  organizationSlug,
  projectId,
  issueId,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
}) {
  const intl = useIntl();
  const panelRef = useRef<IssueDetailPanelHandle>(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const issueQuery = useIssueDetailQuery({ organizationSlug, projectId, issueId });

  if (issueQuery.isError || (!issueQuery.isLoading && !issueQuery.data)) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center p-6">
        <TypographyP className="text-center text-muted-foreground">
          <FormattedMessage {...messages.issuePanelNotFound} />
        </TypographyP>
      </section>
    );
  }

  return (
    <section
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden")}
      aria-busy={issueQuery.isLoading}
      aria-label={issueQuery.isLoading ? intl.formatMessage(messages.issuePanelLoading) : undefined}
    >
      <IssueDetailNavigationGuard panelRef={panelRef} isDirty={isDraftDirty}>
        <IssueDetailPanel
          ref={panelRef}
          organizationSlug={organizationSlug}
          projectId={projectId}
          issueId={issueId}
          onDirtyChange={setIsDraftDirty}
          defaultSidebarOpen={false}
          sidebarStorageScope="inbox"
        />
      </IssueDetailNavigationGuard>
    </section>
  );
}
