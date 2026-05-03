"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  formatRelativeTime,
  jobStatusStyles,
  sourceLabel,
  statusStyles,
  type Conversation,
  type LinkedJob,
} from "./inbox-types";

export function ConversationDetails({
  conversation,
  jobs,
  jobsIsLoading,
  organizationSlug,
}: {
  conversation: Conversation;
  jobs: LinkedJob[];
  jobsIsLoading: boolean;
  organizationSlug: string;
}) {
  return (
    <aside className="border-b border-border bg-background px-4 py-4 xl:absolute xl:right-5 xl:top-5 xl:z-10 xl:w-72 xl:rounded-xl xl:border xl:bg-card/95 xl:p-4 xl:shadow-2xl xl:shadow-background/40 xl:backdrop-blur">
      <section>
        <h3 className="text-sm font-medium text-foreground">Conversation details</h3>
        <dl className="mt-4 flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Source</dt>
            <dd className="text-foreground">{sourceLabel[conversation.source]}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge className={cn("ring-1", statusStyles[conversation.status])}>
                {conversation.status}
              </Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-foreground">
              {new Date(conversation.createdAt).toLocaleDateString()}
            </dd>
          </div>
          {conversation.projectId ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Project</dt>
              <dd className="truncate text-foreground">{conversation.projectId}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">Linked jobs</h3>
          {!jobsIsLoading ? (
            <span className="text-xs text-muted-foreground">{jobs.length}</span>
          ) : null}
        </div>
        {jobsIsLoading ? (
          <div className="mt-3 flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full bg-muted" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">None linked</p>
        ) : (
          <div className="mt-3 flex flex-col divide-y divide-border">
            {jobs.map((job) => (
              <a
                key={job.id}
                href={`/org/${organizationSlug}/jobs`}
                className="block py-2.5 transition-colors first:pt-0 last:pb-0 hover:text-foreground"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{job.id}</span>
                  <Badge className={cn("text-[10px]", jobStatusStyles[job.status])}>
                    {job.status}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="uppercase">{job.type}</span>
                  <span className="size-1 rounded-full bg-muted-foreground/20" />
                  <span>{formatRelativeTime(job.createdAt)}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
