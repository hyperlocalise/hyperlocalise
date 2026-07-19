import { Suspense } from "react";

import { TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { ProjectFilesPageContent } from "./_components/project-files-page-content";

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  await requireAppAuthContext({ organizationSlug });
  const intl = getIntlShape(await getAppLocale());

  return (
    <Suspense
      fallback={
        <TypographyP className="text-sm text-muted-foreground">
          {intl.formatMessage({
            defaultMessage: "Loading files...",
            id: "KWzlpvb4xC",
            description: "Suspense fallback while project files content loads",
          })}
        </TypographyP>
      }
    >
      <ProjectFilesPageContent organizationSlug={organizationSlug} projectId={projectId} />
    </Suspense>
  );
}
