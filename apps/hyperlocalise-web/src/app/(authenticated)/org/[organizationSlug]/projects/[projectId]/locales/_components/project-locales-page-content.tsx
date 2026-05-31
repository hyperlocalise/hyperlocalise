"use client";

import { TranslateIcon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { getLocaleLabel, isRtlLocale } from "@/lib/i18n/locales";

import type { ProjectListRow } from "../../../_components/project-list";
import {
  ProjectPageShell,
  ProjectSectionHeader,
  useProjectPageQuery,
} from "../../_components/project-page-shell";

const externalTmsProviderLabels: Record<
  NonNullable<ProjectListRow["externalProviderKind"]>,
  string
> = {
  crowdin: "Crowdin",
  smartling: "Smartling",
  phrase: "Phrase",
  lokalise: "Lokalise",
};

export function ProjectLocalesPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const projectQuery = useProjectPageQuery(organizationSlug, projectId);
  const project = projectQuery.data;

  return (
    <ProjectPageShell>
      <ProjectSectionHeader
        icon={TranslateIcon}
        section="Locales"
        description="Source and target locales for this program. Native projects can edit locales in settings; external TMS projects inherit locales from the connected provider."
        meta={
          project?.source === "external_tms" && project.externalProviderKind ? (
            <Badge variant="outline">
              {externalTmsProviderLabels[project.externalProviderKind] ??
                project.externalProviderKind}
            </Badge>
          ) : null
        }
      />

      {projectQuery.isLoading ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : project ? (
        <section
          aria-label="Project locales"
          className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
        >
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Source locale</p>
            <p className="mt-1 text-base font-medium text-foreground">
              {project.sourceLocale ?? "Not configured"}
            </p>
            {project.sourceLocale ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {getLocaleLabel(project.sourceLocale)}
              </p>
            ) : null}
          </div>

          <div className="px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              Target locales ({project.targetLocales.length})
            </p>
            {project.targetLocales.length > 0 ? (
              <ul className="mt-3 divide-y divide-border">
                {project.targetLocales.map((locale) => (
                  <li
                    key={locale}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="font-medium text-foreground">{locale}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {getLocaleLabel(locale)}
                      </span>
                      {isRtlLocale(locale) ? (
                        <Badge variant="outline" className="text-[10px]">
                          RTL
                        </Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No target locales configured yet.
              </p>
            )}
          </div>

          {project.source === "external_tms" && project.lastSyncedAt ? (
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              Last synced from provider: {project.lastSyncedAt}
            </p>
          ) : null}
        </section>
      ) : null}
    </ProjectPageShell>
  );
}
