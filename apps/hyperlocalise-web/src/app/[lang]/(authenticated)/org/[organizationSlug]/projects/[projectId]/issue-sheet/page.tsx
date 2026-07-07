import { Suspense } from "react";

import { TypographyP } from "@/components/ui/typography";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { IssueSheetPageContent } from "./_components/issue-sheet-page-content";

export default async function IssueSheetPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  await requireAppAuthContext({ organizationSlug });

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
