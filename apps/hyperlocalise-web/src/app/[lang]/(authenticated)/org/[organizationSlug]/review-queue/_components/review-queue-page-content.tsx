"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon, InboxIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { cn } from "@/lib/primitives/cn";

import { buildJobDetailHref } from "../../jobs/_components/jobs-view-helpers";
import { getJobName, type JobRow } from "../../jobs/_components/jobs-page-view";
import {
  PageHeader,
  WorkspacePageShell,
  toneClass,
} from "../../_components/workspace-resource-shared";

type ReviewQueueFilter = "assigned" | "all";

function jobStatusTone(status: JobRow["status"]) {
  switch (status) {
    case "waiting_for_review":
      return "watch";
    case "failed":
      return "risk";
    case "succeeded":
      return "safe";
    default:
      return "info";
  }
}

function formatAssignee(job: JobRow) {
  if (job.externalAssignedUsers?.length) {
    return job.externalAssignedUsers.join(", ");
  }

  if (!job.ownerUserId) {
    return "Unassigned";
  }

  const name = job.ownerDisplayName ?? job.ownerEmail ?? "Assigned";
  return job.assigneeRole ? `${name} (${job.assigneeRole})` : name;
}

export function ReviewQueuePageContent({ organizationSlug }: { organizationSlug: string }) {
  const [projectFilter, setProjectFilter] = useState("all");
  const [localeFilter, setLocaleFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState<ReviewQueueFilter>("assigned");
  const [search, setSearch] = useState("");

  const projectsQuery = useQuery({
    queryKey: ["translation-projects", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error("Failed to load projects");
      }

      const body = (await response.json()) as {
        projects: Array<{
          id: string;
          name: string;
          targetLocales: string[];
          sourceLocale: string | null;
        }>;
      };
      return body.projects;
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["review-queue", organizationSlug, projectFilter, localeFilter, assignmentFilter],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs.$get({
        param: { organizationSlug },
        query: {
          limit: "100",
          reviewQueue: true,
          status: "waiting_for_review",
          ...(assignmentFilter === "assigned"
            ? { relationship: "assigned", assigneeRole: "reviewer" }
            : {}),
          ...(projectFilter !== "all" ? { projectId: projectFilter } : {}),
          ...(localeFilter !== "all" ? { locale: localeFilter } : {}),
        },
      });

      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load review queue");
      }

      const body = (await response.json()) as { jobs: JobRow[] };
      return body.jobs;
    },
  });

  const localeOptions = useMemo(() => {
    const locales = new Set<string>();
    for (const project of projectsQuery.data ?? []) {
      for (const locale of project.targetLocales) {
        if (locale !== project.sourceLocale) {
          locales.add(locale);
        }
      }
    }
    return [...locales].sort();
  }, [projectsQuery.data]);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return jobsQuery.data ?? [];
    }

    return (jobsQuery.data ?? []).filter((job) =>
      [job.id, job.projectName, job.externalTitle, job.reviewTargetLocale, formatAssignee(job)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [jobsQuery.data, search]);

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={InboxIcon}
        title="Review queue"
        description="Jobs waiting for reviewer approval, scoped by project and locale."
      />

      <div className="grid gap-3 rounded-lg border border-foreground/8 bg-foreground/2.5 p-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="relative md:col-span-2 xl:col-span-1">
          <HugeiconsIcon
            icon={SearchIcon}
            strokeWidth={1.8}
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/38"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search review jobs..."
            className="border-foreground/10 bg-background/60 pl-9"
          />
        </div>

        <Select
          value={assignmentFilter}
          onValueChange={(value) => setAssignmentFilter(value as ReviewQueueFilter)}
        >
          <SelectTrigger className="border-foreground/10 bg-background/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="assigned">Assigned to me</SelectItem>
            <SelectItem value="all">All review jobs</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={projectFilter}
          onValueChange={(value) => {
            if (value) {
              setProjectFilter(value);
            }
          }}
        >
          <SelectTrigger className="border-foreground/10 bg-background/60">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {(projectsQuery.data ?? []).map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={localeFilter}
          onValueChange={(value) => {
            if (value) {
              setLocaleFilter(value);
            }
          }}
        >
          <SelectTrigger className="border-foreground/10 bg-background/60">
            <SelectValue placeholder="All locales" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locales</SelectItem>
            {localeOptions.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {locale}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {jobsQuery.isLoading || projectsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-foreground/52">
          <Spinner />
          Loading review queue...
        </div>
      ) : jobsQuery.error ? (
        <TypographyP className="text-sm text-flame-100">
          {jobsQuery.error instanceof Error
            ? jobsQuery.error.message
            : "Failed to load review queue"}
        </TypographyP>
      ) : filteredJobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-foreground/12 bg-foreground/2.5 p-8 text-center">
          <TypographyP className="text-sm font-medium text-foreground/72">
            No jobs waiting for review
          </TypographyP>
          <TypographyP className="mt-1 text-sm text-foreground/48">
            When translation jobs need approval, they will appear here.
          </TypographyP>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-foreground/8">
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] gap-3 border-b border-foreground/8 bg-foreground/3 px-4 py-3 text-xs font-medium tracking-[0.08em] text-foreground/42 uppercase">
            <span>Job</span>
            <span>Project</span>
            <span>Assignee</span>
            <span>Status</span>
            <span className="text-right">Action</span>
          </div>
          {filteredJobs.map((job) => {
            const href = buildJobDetailHref(organizationSlug, job.projectId, job.id);
            return (
              <div
                key={job.id}
                className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] gap-3 border-b border-foreground/8 px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <TypographyP className="truncate text-sm font-medium text-foreground/78">
                    {getJobName(job)}
                  </TypographyP>
                  <TypographyP className="truncate text-xs text-foreground/42">
                    {job.id}
                  </TypographyP>
                </div>
                <TypographyP className="truncate text-sm text-foreground/68">
                  {job.projectName ?? "—"}
                </TypographyP>
                <TypographyP className="truncate text-sm text-foreground/68">
                  {formatAssignee(job)}
                </TypographyP>
                <Badge
                  variant="outline"
                  className={cn("w-fit capitalize", toneClass(jobStatusTone(job.status)))}
                >
                  {job.status.replaceAll("_", " ")}
                </Badge>
                <div className="flex justify-end">
                  {href ? (
                    <Button
                      nativeButton={false}
                      render={<Link href={href} />}
                      variant="outline"
                      size="sm"
                    >
                      Open job
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WorkspacePageShell>
  );
}
