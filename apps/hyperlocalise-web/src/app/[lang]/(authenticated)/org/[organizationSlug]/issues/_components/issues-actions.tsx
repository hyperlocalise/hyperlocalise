"use client";

import { useState } from "react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { readApiResponseError } from "@/lib/api-error";

import { IssueSheetCreateIssueDialog } from "../../projects/[projectId]/issue-sheet/_components/issue-sheet-create-issue-dialog";
import { IssuesProjectImportDialog } from "./issues-project-import-dialog";

type ProjectOption = {
  id: string;
  name: string;
};

function organizationProjectsPath(organizationSlug: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects`;
}

export function IssuesActions({
  organizationSlug,
  onIssuesChanged,
}: {
  organizationSlug: string;
  onIssuesChanged: () => Promise<void>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ["projects", organizationSlug],
    queryFn: async () => {
      const response = await fetch(organizationProjectsPath(organizationSlug));
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load projects");
      }
      const body = (await response.json()) as { projects: ProjectOption[] };
      return body.projects;
    },
  });

  const projects = projectsQuery.data ?? [];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setImportOpen(true)}
          disabled={projectsQuery.isLoading}
        >
          Import CSV
        </Button>
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={projectsQuery.isLoading}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
          Issue
        </Button>
      </div>

      <IssueSheetCreateIssueDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationSlug={organizationSlug}
        projects={projects}
        onCreated={onIssuesChanged}
      />
      <IssuesProjectImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        organizationSlug={organizationSlug}
        projects={projects}
        onImported={onIssuesChanged}
      />
    </>
  );
}
