import { Suspense } from "react";

import { TypographyP } from "@/components/ui/typography";
import { requireWorkspaceFeatureFlag, workspaceIssuesFlag } from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { IssuesPageContent } from "./_components/issues-page-content";

export default async function IssuesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  await requireWorkspaceFeatureFlag(workspaceIssuesFlag, auth);

  return (
    <Suspense
      fallback={
        <TypographyP className="text-sm text-muted-foreground">Loading issues...</TypographyP>
      }
    >
      <IssuesPageContent organizationSlug={organizationSlug} />
    </Suspense>
  );
}
