"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage } from "react-intl";

import {
  mapProjectToListRow,
  type ApiProject,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/_components/project-list";
import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { excerptGuidelineText } from "@/lib/knowledge-memory/knowledge-guideline-excerpt";

import { getKnowledgeMemory } from "./knowledge-memory-api";
import { knowledgeProjectsSectionMessages as messages } from "./knowledge-projects-section.messages";

type ProjectGuidelineRow = {
  id: string;
  name: string;
  styleGuideExcerpt: string;
  styleGuideEmpty: boolean;
  projectGuidelineExcerpt: string;
  projectGuidelineEmpty: boolean;
  settingsHref: string;
  knowledgeHref: string;
};

async function loadProjectGuidelineRows(organizationSlug: string): Promise<ProjectGuidelineRow[]> {
  const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
    param: { organizationSlug },
  });
  if (response.status !== 200) {
    throw await readApiResponseError(response, "Failed to load projects");
  }

  const body = await response.json();
  const projects = (body.projects as ApiProject[]).map((project) => mapProjectToListRow(project));

  const guidelineByProjectId = await Promise.all(
    projects.map(async (project) => {
      const memoryResponse = await getKnowledgeMemory({
        organizationSlug,
        projectId: project.id,
      });
      if (!memoryResponse.ok) {
        return { projectId: project.id, content: "" };
      }
      const memoryBody = await memoryResponse.json();
      const content =
        typeof memoryBody.knowledgeMemory?.content === "string"
          ? memoryBody.knowledgeMemory.content
          : "";
      return { projectId: project.id, content };
    }),
  );

  const memoryContentById = new Map(
    guidelineByProjectId.map((entry) => [entry.projectId, entry.content]),
  );

  return projects.map((project) => {
    const styleGuideValue = project.translationContextValue.trim();
    const projectGuidelineValue = (memoryContentById.get(project.id) ?? "").trim();

    return {
      id: project.id,
      name: project.name,
      styleGuideExcerpt: excerptGuidelineText(styleGuideValue),
      styleGuideEmpty: styleGuideValue.length === 0,
      projectGuidelineExcerpt: excerptGuidelineText(projectGuidelineValue),
      projectGuidelineEmpty: projectGuidelineValue.length === 0,
      settingsHref: buildProjectPath(organizationSlug, project.id, "settings"),
      knowledgeHref: buildProjectPath(organizationSlug, project.id, "knowledge"),
    };
  });
}

export function KnowledgeProjectsSection({ organizationSlug }: { organizationSlug: string }) {
  const projectsQuery = useQuery({
    queryKey: ["knowledge-projects-section", organizationSlug],
    queryFn: () => loadProjectGuidelineRows(organizationSlug),
  });

  const rows = projectsQuery.data ?? [];

  return (
    <section className="flex flex-col gap-4">
      <Separator />
      <div className="flex flex-col gap-1.5">
        <TypographyH2 className="pb-0 text-lg tracking-[-0.02em]">
          <FormattedMessage {...messages.sectionTitle} />
        </TypographyH2>
        <TypographyP size="small" tone="subtle" className="max-w-2xl leading-6">
          <FormattedMessage {...messages.sectionDescription} />
        </TypographyP>
      </div>

      {projectsQuery.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.loading} />
          </TypographyP>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {projectsQuery.isError ? (
        <TypographyP className="text-flame-100" size="small">
          <FormattedMessage {...messages.loadError} />
        </TypographyP>
      ) : null}

      {projectsQuery.isSuccess && rows.length === 0 ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.noProjects} />
        </TypographyP>
      ) : null}

      {projectsQuery.isSuccess && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  <FormattedMessage {...messages.columnProject} />
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  <FormattedMessage {...messages.columnStyleGuide} />
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  <FormattedMessage {...messages.columnProjectGuideline} />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 align-top font-medium text-foreground">
                    <Link
                      href={buildProjectPath(organizationSlug, row.id)}
                      className="hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {row.styleGuideEmpty ? (
                      <span className="text-muted-foreground">
                        <FormattedMessage {...messages.emptyStyleGuide} />
                      </span>
                    ) : (
                      <span className="line-clamp-2">{row.styleGuideExcerpt}</span>
                    )}
                    <div className="mt-1">
                      <Link
                        href={row.settingsHref}
                        className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        <FormattedMessage {...messages.openStyleGuideSettings} />
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {row.projectGuidelineEmpty ? (
                      <span className="text-muted-foreground">
                        <FormattedMessage {...messages.emptyProjectGuideline} />
                      </span>
                    ) : (
                      <span className="line-clamp-2">{row.projectGuidelineExcerpt}</span>
                    )}
                    <div className="mt-1">
                      <Link
                        href={row.knowledgeHref}
                        className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        <FormattedMessage {...messages.openProjectGuideline} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
