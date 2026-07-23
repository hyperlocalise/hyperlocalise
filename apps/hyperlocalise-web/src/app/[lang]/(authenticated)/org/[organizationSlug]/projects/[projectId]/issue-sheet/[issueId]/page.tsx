import { Suspense } from "react";

import { TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { requireWorkspaceFeatureFlag, workspaceIssuesFlag } from "@/lib/flags/workspace-flags";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { IssueDetailPageContent } from "./_components/issue-detail-page-content";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; issueId: string }>;
}) {
  const { organizationSlug, projectId: rawProjectId, issueId } = await params;
  const projectId = normalizeProjectId(rawProjectId);
  const auth = await requireAppAuthContext({ organizationSlug });
  await requireWorkspaceFeatureFlag(workspaceIssuesFlag, auth);
  const intl = getIntlShape(await getAppLocale());

  return (
    <Suspense
      fallback={
        <TypographyP className="text-sm text-muted-foreground">
          {intl.formatMessage({
            defaultMessage: "Loading issue...",
            id: "JxSxJmFns3",
            description: "Suspense fallback while the issue detail page loads",
          })}
        </TypographyP>
      }
    >
      <IssueDetailPageContent
        organizationSlug={organizationSlug}
        projectId={projectId}
        issueId={issueId}
      />
    </Suspense>
  );
}
