import { Suspense } from "react";

import { ProjectOverviewPageContent } from "./_components/project-overview-page-content";
import { TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const intl = getIntlShape(await getAppLocale());

  return (
    <Suspense
      fallback={
        <TypographyP className="text-sm text-muted-foreground">
          {intl.formatMessage({
            defaultMessage: "Loading project…",
            id: "PtTtkKUG7c",
            description: "Suspense fallback while project overview content loads",
          })}
        </TypographyP>
      }
    >
      <ProjectOverviewPageContent organizationSlug={organizationSlug} projectId={projectId} />
    </Suspense>
  );
}
