import { Suspense } from "react";

import { TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";

import { ProjectSettingsPageContent } from "./_components/project-settings-page-content";

export default async function ProjectSettingsPage({
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
            defaultMessage: "Loading settings...",
            id: "M1rJJm5ext",
            description: "Suspense fallback while project settings content loads",
          })}
        </TypographyP>
      }
    >
      <ProjectSettingsPageContent organizationSlug={organizationSlug} projectId={projectId} />
    </Suspense>
  );
}
