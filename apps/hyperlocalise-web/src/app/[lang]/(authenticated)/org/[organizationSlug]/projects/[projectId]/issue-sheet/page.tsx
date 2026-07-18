import { Suspense } from "react";

import { TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
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
  const intl = getIntlShape(await getAppLocale());

  return (
    <Suspense
      fallback={
        <TypographyP className="text-sm text-muted-foreground">
          {intl.formatMessage({
            defaultMessage: "Loading Issue Sheet...",
            id: "RQpMZIFSEX",
            description: "Suspense fallback while Issue Sheet content loads",
          })}
        </TypographyP>
      }
    >
      <IssueSheetPageContent organizationSlug={organizationSlug} projectId={projectId} />
    </Suspense>
  );
}
