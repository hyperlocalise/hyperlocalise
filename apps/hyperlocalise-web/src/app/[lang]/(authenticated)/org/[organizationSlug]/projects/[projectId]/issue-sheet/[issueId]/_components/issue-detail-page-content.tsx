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
import { useRouter } from "next/navigation";
import { FormattedMessage, useIntl } from "react-intl";

import { TypographyP } from "@/components/ui/typography";
import { useAppShellBreadcrumbAppend } from "@/components/app-shell/store/use-app-shell-breadcrumb";
import { cn } from "@/lib/primitives/cn";

import { IssueDetailLinkScopeProvider } from "../../../../../_components/issue-detail/issue-detail-link-scope";
import { IssueDetailNavigationGuard } from "../../../../../_components/issue-detail/issue-detail-navigation-guard";
import {
  IssueDetailPanel,
  type IssueDetailPanelHandle,
} from "../../../../../_components/issue-detail/issue-detail-panel";
import {
  buildIssueListHref,
  truncateIssueTitleForBreadcrumb,
  type IssueDetailHrefScope,
} from "../../../../../_components/issue-detail/issue-detail-utils";
import { useIssueDetailQuery } from "../../../../../_components/issue-detail/use-issue-detail-query";
import { useOrganizationIssueQuery } from "../../../../../_components/issue-detail/use-organization-issue-query";
import { issueDetailPageContentMessages as messages } from "./issue-detail-page-content.messages";

const pageShellClassName = cn(
  "-mx-4 flex min-h-0 flex-1 flex-col overflow-hidden sm:-mx-6 lg:-mx-8",
);

export function IssueDetailPageContent({
  organizationSlug,
  projectId,
  issueId,
  detailScope = "project",
}: {
  organizationSlug: string;
  projectId?: string;
  issueId: string;
  detailScope?: IssueDetailHrefScope;
}) {
  const intl = useIntl();
  const router = useRouter();
  const panelRef = useRef<IssueDetailPanelHandle>(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const organizationIssueQuery = useOrganizationIssueQuery({
    organizationSlug,
    issueId,
    enabled: !projectId,
  });
  const resolvedProjectId = projectId ?? organizationIssueQuery.data?.projectId;
  const issueQuery = useIssueDetailQuery({
    organizationSlug,
    projectId: resolvedProjectId,
    issueId,
  });

  const issueTitle = issueQuery.data?.title?.trim() ?? organizationIssueQuery.data?.title?.trim();
  const isResolvingProject = !projectId && organizationIssueQuery.isLoading;
  const isLoading = isResolvingProject || issueQuery.isLoading;
  const isMissing =
    (!projectId &&
      (organizationIssueQuery.isError ||
        (!organizationIssueQuery.isLoading && !organizationIssueQuery.data))) ||
    issueQuery.isError ||
    (!isLoading && !issueQuery.data);

  useAppShellBreadcrumbAppend({
    id: "issue-detail",
    label: issueTitle ? truncateIssueTitleForBreadcrumb(issueTitle) : undefined,
    title: issueTitle,
  });

  if (isMissing) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-3 py-16">
        <TypographyP className="text-center" tone="subtle">
          <FormattedMessage {...messages.notFound} />
        </TypographyP>
      </main>
    );
  }

  return (
    <main
      className={pageShellClassName}
      aria-busy={isLoading}
      aria-label={isLoading ? intl.formatMessage(messages.loadingAria) : undefined}
    >
      <IssueDetailLinkScopeProvider scope={detailScope}>
        <IssueDetailNavigationGuard panelRef={panelRef} isDirty={isDraftDirty}>
          {resolvedProjectId ? (
            <IssueDetailPanel
              ref={panelRef}
              organizationSlug={organizationSlug}
              projectId={resolvedProjectId}
              issueId={issueId}
              onDirtyChange={setIsDraftDirty}
              onDeleted={() => {
                router.push(
                  buildIssueListHref({
                    organizationSlug,
                    projectId: resolvedProjectId,
                    scope: detailScope,
                  }),
                );
              }}
            />
          ) : null}
        </IssueDetailNavigationGuard>
      </IssueDetailLinkScopeProvider>
    </main>
  );
}
