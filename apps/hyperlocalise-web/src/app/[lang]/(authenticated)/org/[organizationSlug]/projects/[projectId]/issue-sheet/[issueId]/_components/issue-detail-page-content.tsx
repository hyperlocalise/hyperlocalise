"use client";

import { useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { TypographyP } from "@/components/ui/typography";
import { useAppShellBreadcrumbAppend } from "@/components/app-shell/store/use-app-shell-breadcrumb";
import { cn } from "@/lib/primitives/cn";

import { IssueDetailNavigationGuard } from "../../../../../_components/issue-detail/issue-detail-navigation-guard";
import {
  IssueDetailPanel,
  type IssueDetailPanelHandle,
} from "../../../../../_components/issue-detail/issue-detail-panel";
import { truncateIssueTitleForBreadcrumb } from "../../../../../_components/issue-detail/issue-detail-utils";
import { useIssueDetailQuery } from "../../../../../_components/issue-detail/use-issue-detail-query";
import { issueDetailPageContentMessages as messages } from "./issue-detail-page-content.messages";

const pageShellClassName = cn(
  "-mx-4 flex min-h-0 flex-1 flex-col overflow-hidden sm:-mx-6 lg:-mx-8",
);

export function IssueDetailPageContent({
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

  const issueTitle = issueQuery.data?.title?.trim();

  useAppShellBreadcrumbAppend({
    id: "issue-detail",
    label: issueTitle ? truncateIssueTitleForBreadcrumb(issueTitle) : undefined,
    title: issueTitle,
  });

  if (issueQuery.isError || (!issueQuery.isLoading && !issueQuery.data)) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-3 py-16">
        <TypographyP className="text-center text-muted-foreground">
          <FormattedMessage {...messages.notFound} />
        </TypographyP>
      </main>
    );
  }

  return (
    <main
      className={pageShellClassName}
      aria-busy={issueQuery.isLoading}
      aria-label={issueQuery.isLoading ? intl.formatMessage(messages.loadingAria) : undefined}
    >
      <IssueDetailPanel
        ref={panelRef}
        organizationSlug={organizationSlug}
        projectId={projectId}
        issueId={issueId}
        onDirtyChange={setIsDraftDirty}
      />
      <IssueDetailNavigationGuard panelRef={panelRef} isDirty={isDraftDirty} />
    </main>
  );
}
