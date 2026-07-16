import { Skeleton } from "@/components/ui/skeleton";

import { WorkspacePageShell } from "./workspace-resource-shared";

export function OrganizationRouteLoading() {
  return (
    <WorkspacePageShell aria-busy="true" aria-live="polite">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-56 md:w-72" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-9 w-28 shrink-0" />
      </section>

      <div className="grid gap-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-3/4" />
      </div>
    </WorkspacePageShell>
  );
}
