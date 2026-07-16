import { Suspense } from "react";

import { TypographyP } from "@/components/ui/typography";
import { requireWorkspaceFeatureFlag, workspaceIssuesFlag } from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { IssueSheetPageContent } from "./_components/issue-sheet-page-content";

export default async function IssueSheetPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  await requireWorkspaceFeatureFlag(workspaceIssuesFlag, auth);

  return (
    <Suspense
      fallback={
        <TypographyP className="text-sm text-muted-foreground">Loading Issue Sheet...</TypographyP>
      }
    >
      <IssueSheetPageContent organizationSlug={organizationSlug} projectId={projectId} />
    </Suspense>
  );
}
