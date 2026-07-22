"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useState } from "react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { readApiResponseError } from "@/lib/api-error";

import { IssueSheetCreateIssueDialog } from "../../projects/[projectId]/issue-sheet/_components/issue-sheet-create-issue-dialog";
import { issuesActionsMessages } from "./issues-actions.messages";
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
          <FormattedMessage {...issuesActionsMessages.importCsv} />
        </Button>
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={projectsQuery.isLoading}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
          <FormattedMessage {...issuesActionsMessages.issue} />
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
