"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { getLocaleLabel, isRtlLocale } from "@/lib/i18n/locales";

import { formatProjectLocaleSummary } from "../../../_components/project-form";
import { mapProjectToListRow } from "../../../_components/project-list";

export function ProjectLocalesPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const projectQuery = useQuery({
    queryKey: ["translation-project", organizationSlug, projectId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$get({
        param: { organizationSlug, projectId },
      });
      if (!response.ok) {
        throw new Error(`Failed to load project (${response.status})`);
      }
      const body = await response.json();
      return mapProjectToListRow(body.project);
    },
  });

  const project = projectQuery.data;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="space-y-3">
        {projectQuery.isLoading ? (
          <Skeleton className="h-10 w-72" />
        ) : (
          <TypographyH1 className="font-heading text-3xl font-semibold text-foreground md:text-4xl">
            Locales
          </TypographyH1>
        )}
        <TypographyP className="max-w-2xl text-sm leading-6 text-foreground/58">
          Source and target locales configured for this project. Native projects can edit locales in
          project settings; external TMS projects inherit locales from the connected provider.
        </TypographyP>
        {project ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-foreground/12 text-foreground/62">
              {project.source === "external_tms" ? "Provider-managed" : "Native project"}
            </Badge>
            {project.externalProviderKind ? (
              <Badge variant="outline" className="border-foreground/12 text-foreground/62">
                {project.externalProviderKind}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      {projectQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : project ? (
        <section className="grid gap-6 rounded-xl border border-foreground/8 bg-foreground/2.5 p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/44">
              Summary
            </p>
            <p className="mt-2 text-sm text-foreground">
              {formatProjectLocaleSummary(project.sourceLocale, project.targetLocales)}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-foreground/8 p-4">
              <p className="text-xs font-medium text-foreground/48">Source locale</p>
              <p className="mt-2 text-lg font-medium text-foreground">
                {project.sourceLocale ?? "Not configured"}
              </p>
              {project.sourceLocale ? (
                <p className="mt-1 text-sm text-foreground/56">
                  {getLocaleLabel(project.sourceLocale)}
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-foreground/8 p-4 sm:col-span-1">
              <p className="text-xs font-medium text-foreground/48">
                Target locales ({project.targetLocales.length})
              </p>
              {project.targetLocales.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {project.targetLocales.map((locale) => (
                    <li
                      key={locale}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-foreground/6 bg-background/40 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-foreground">{locale}</span>
                      <span className="text-foreground/56">{getLocaleLabel(locale)}</span>
                      {isRtlLocale(locale) ? (
                        <Badge variant="secondary" className="text-[10px]">
                          RTL
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-foreground/56">No target locales configured yet.</p>
              )}
            </div>
          </div>

          {project.source === "external_tms" && project.lastSyncedAt ? (
            <p className="text-xs text-foreground/48">
              Last synced from provider: {project.lastSyncedAt}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          render={<Link href={`/org/${organizationSlug}/projects/${projectId}/settings`} />}
        >
          Project settings
        </Button>
        <Button
          variant="outline"
          render={<Link href={`/org/${organizationSlug}/projects/${projectId}/jobs`} />}
        >
          View jobs
        </Button>
      </div>
    </div>
  );
}
