import { Suspense } from "react";

import { TypographyP } from "@/components/ui/typography";

import { ProjectSettingsPageContent } from "./_components/project-settings-page-content";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return (
    <Suspense
      fallback={
        <TypographyP className="text-sm text-foreground/52">Loading settings...</TypographyP>
      }
    >
      <ProjectSettingsPageContent organizationSlug={organizationSlug} projectId={projectId} />
    </Suspense>
  );
}
