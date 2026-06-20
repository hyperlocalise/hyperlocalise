"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import {
  formatRelativeTime,
  getJobName,
  jobTone,
  taskDetailSummary,
  type ApiJob,
  type JobRow,
  type JobsLinkRenderer,
} from "./jobs-page-view";
import { buildJobCatHref, buildJobDetailHref, kanbanStatusColumns } from "./jobs-view-helpers";
import { toneClass, type Tone } from "../../_components/workspace-resource-shared";

const kanbanStatusLabels: Record<ApiJob["status"], string> = {
  queued: "Queued",
  running: "Running",
  waiting_for_review: "Waiting for review",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

function sourceLabel(job: ApiJob) {
  return job.externalProviderKind ? `Provider · ${job.externalProviderKind}` : "Native";
}

function formatJobKind(job: ApiJob) {
  if (job.kind === "translation" && job.type) {
    return `${job.kind.replace("_", " ")} · ${job.type}`;
  }

  return job.kind.replace("_", " ");
}

export function JobRowActions({
  buildJobDetailHref: buildDetailHref = buildJobDetailHref,
  job,
  organizationSlug,
  projectId,
  renderJobLink,
}: {
  buildJobDetailHref?: typeof buildJobDetailHref;
  job: JobRow;
  organizationSlug: string;
  projectId?: string;
  renderJobLink: JobsLinkRenderer;
}) {
  const resolvedProjectId = projectId ?? job.projectId;
  const detailHref = buildDetailHref(organizationSlug, resolvedProjectId, job.id);
  const catHref = buildJobCatHref(organizationSlug, resolvedProjectId, job);
  const showCat = Boolean(catHref);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {showCat && catHref ? renderJobLink({ href: catHref, kind: "cat", children: "CAT" }) : null}
      {detailHref ? (
        renderJobLink({ href: detailHref, kind: "details", children: "Details" })
      ) : (
        <Button variant="outline" size="sm" className="w-fit" disabled>
          Details
        </Button>
      )}
    </div>
  );
}

function JobKanbanCard({
  buildJobDetailHref: buildDetailHref = buildJobDetailHref,
  job,
  now,
  organizationSlug,
  projectId,
  renderJobLink,
}: {
  buildJobDetailHref?: typeof buildJobDetailHref;
  job: JobRow;
  now?: number;
  organizationSlug: string;
  projectId?: string;
  renderJobLink: JobsLinkRenderer;
}) {
  const resolvedProjectId = projectId ?? job.projectId;
  const detailHref = buildDetailHref(organizationSlug, resolvedProjectId, job.id);

  return (
    <article className="rounded-lg border border-foreground/10 bg-background p-3 shadow-sm">
      {detailHref ? (
        renderJobLink({
          href: detailHref,
          kind: "title",
          children: (
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {getJobName(job)}
              </span>
              <span className="mt-1 block truncate text-xs font-normal text-foreground/38">
                {formatJobKind(job)} · {job.externalTaskId ?? job.id}
              </span>
            </span>
          ),
        })
      ) : (
        <div className="min-w-0">
          <TypographyP className="truncate text-sm font-medium text-foreground">
            {getJobName(job)}
          </TypographyP>
          <TypographyP className="mt-1 truncate text-xs text-foreground/38">
            {formatJobKind(job)} · {job.externalTaskId ?? job.id}
          </TypographyP>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="w-fit rounded-full text-[11px]">
          {sourceLabel(job)}
        </Badge>
        {!projectId ? (
          <Badge variant="outline" className="w-fit rounded-full text-[11px]">
            {job.projectName ?? job.projectId ?? "Workspace"}
          </Badge>
        ) : null}
      </div>

      <TypographyP className="mt-3 line-clamp-2 text-xs text-foreground/68">
        {taskDetailSummary(job)}
      </TypographyP>
      <TypographyP className="mt-1 text-[11px] text-foreground/38">
        Due {formatRelativeTime(job.externalDueDate, now)} · Synced{" "}
        {formatRelativeTime(job.updatedAt, now)}
      </TypographyP>

      <div className="mt-3 border-t border-foreground/8 pt-3">
        <JobRowActions
          buildJobDetailHref={buildDetailHref}
          job={job}
          organizationSlug={organizationSlug}
          projectId={projectId}
          renderJobLink={renderJobLink}
        />
      </div>
    </article>
  );
}

function KanbanColumn({
  jobs,
  label,
  statusTone,
  ...cardProps
}: {
  jobs: JobRow[];
  label: string;
  statusTone: Tone;
} & Omit<Parameters<typeof JobKanbanCard>[0], "job">) {
  return (
    <section className="flex min-w-[17rem] flex-1 flex-col rounded-xl border border-foreground/10 bg-foreground/2">
      <header className="flex items-center justify-between gap-2 border-b border-foreground/8 px-3 py-3">
        <TypographyP className="text-sm font-medium text-foreground">{label}</TypographyP>
        <Badge variant="outline" className={cn("rounded-full capitalize", toneClass(statusTone))}>
          {jobs.length}
        </Badge>
      </header>
      <div className="flex flex-1 flex-col gap-3 p-3">
        {jobs.length === 0 ? (
          <TypographyP className="px-1 py-6 text-center text-xs text-foreground/38">
            No jobs
          </TypographyP>
        ) : (
          jobs.map((job) => <JobKanbanCard key={job.id} job={job} {...cardProps} />)
        )}
      </div>
    </section>
  );
}

export function JobsKanbanBoard({
  buildJobDetailHref: buildDetailHref = buildJobDetailHref,
  emptyLabel,
  isLoading,
  jobs,
  now,
  organizationSlug,
  projectId,
  renderJobLink,
}: {
  buildJobDetailHref?: typeof buildJobDetailHref;
  emptyLabel: string;
  isLoading: boolean;
  jobs: JobRow[];
  now?: number;
  organizationSlug: string;
  projectId?: string;
  renderJobLink: JobsLinkRenderer;
}) {
  if (isLoading) {
    return (
      <TypographyP className="px-3 py-8 text-sm text-foreground/58">Loading jobs…</TypographyP>
    );
  }

  if (jobs.length === 0) {
    return <TypographyP className="px-3 py-8 text-sm text-foreground/58">{emptyLabel}</TypographyP>;
  }

  const jobsByStatus = new Map<ApiJob["status"], JobRow[]>();
  for (const status of kanbanStatusColumns) {
    jobsByStatus.set(status, []);
  }

  for (const job of jobs) {
    jobsByStatus.get(job.status)?.push(job);
  }

  const visibleColumns = kanbanStatusColumns.filter(
    (status) => (jobsByStatus.get(status)?.length ?? 0) > 0,
  );

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-3">
        {visibleColumns.map((status) => (
          <KanbanColumn
            key={status}
            label={kanbanStatusLabels[status]}
            statusTone={jobTone(status)}
            jobs={jobsByStatus.get(status) ?? []}
            buildJobDetailHref={buildDetailHref}
            now={now}
            organizationSlug={organizationSlug}
            projectId={projectId}
            renderJobLink={renderJobLink}
          />
        ))}
      </div>
    </div>
  );
}
