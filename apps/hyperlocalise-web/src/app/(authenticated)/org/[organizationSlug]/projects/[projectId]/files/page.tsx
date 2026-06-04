import { Suspense } from "react";

import { hasCapability } from "@/api/auth/policy";
import { TypographyP } from "@/components/ui/typography";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { ProjectFilesPageContent } from "./_components/project-files-page-content";

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <Suspense
      fallback={<TypographyP className="text-sm text-foreground/52">Loading files...</TypographyP>}
    >
      <ProjectFilesPageContent
        organizationSlug={organizationSlug}
        projectId={projectId}
        canFindInRepo={hasCapability(auth.membership.role, "ai_actions:run")}
      />
    </Suspense>
  );
}
