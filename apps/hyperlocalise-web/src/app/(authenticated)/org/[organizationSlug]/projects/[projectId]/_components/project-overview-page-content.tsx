"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

const executionLinks = [
  { label: "Files", section: "files", detail: "Source files and assets" },
  { label: "Locales", section: "locales", detail: "Language and market readiness" },
  { label: "Jobs", section: "jobs", detail: "Translation, review, QA, and sync" },
  { label: "Reviews", section: "reviews", detail: "Human decisions and approvals" },
  { label: "Context", section: "context", detail: "PRs, docs, tickets, and product notes" },
  { label: "QA", section: "qa", detail: "ICU, glossary, tone, and layout checks" },
  { label: "Agent Runs", section: "agent-runs", detail: "Automation history and confidence" },
] as const;

export function ProjectOverviewPageContent({
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
      const body = (await response.json()) as { project: { id: string; name: string } };
      return body.project;
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="space-y-3">
        {projectQuery.isLoading ? (
          <Skeleton className="h-10 w-72" />
        ) : (
          <TypographyH1 className="font-heading text-4xl font-semibold text-foreground md:text-5xl">
            {projectQuery.data?.name ?? "Project"}
          </TypographyH1>
        )}
        <TypographyP className="max-w-2xl text-sm leading-6 text-foreground/58">
          Execution hub for this localisation project. Agents prepare work, gather context, and
          route decisions; your team ships in the sections below.
        </TypographyP>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-foreground/12 text-foreground/62">
            Project execution
          </Badge>
          <Badge variant="outline" className="border-foreground/12 text-foreground/62">
            Agent-assisted
          </Badge>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        {executionLinks.map((link) => (
          <Link
            key={link.section}
            href={buildProjectPath(organizationSlug, projectId, link.section)}
            className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-4 transition-colors hover:border-foreground/14 hover:bg-foreground/4"
          >
            <p className="text-sm font-medium text-foreground">{link.label}</p>
            <p className="mt-1 text-xs text-foreground/52">{link.detail}</p>
          </Link>
        ))}
      </section>

      <div className="flex flex-wrap gap-2 border-t border-foreground/8 pt-6">
        <Button render={<Link href={buildProjectPath(organizationSlug, projectId, "files")} />}>
          Open files
        </Button>
        <Button variant="outline" render={<Link href={`/org/${organizationSlug}/new-request`} />}>
          New request
        </Button>
      </div>
    </div>
  );
}
