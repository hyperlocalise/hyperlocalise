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
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readApiResponseError } from "@/lib/api-error";

import { IssueSheetImportDialog } from "../../projects/[projectId]/issue-sheet/_components/issue-sheet-import-dialog";
import { issuesProjectImportDialogMessages } from "./issues-project-import-dialog.messages";

type IssueSheetColumn = {
  id: string;
  key: string;
  label: string;
  type: string;
};

type IssueSheetResponse = {
  columns: IssueSheetColumn[];
};

function issueSheetPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet`;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await readApiResponseError(response, "Request failed");
    throw new Error(error.message || "Request failed");
  }
  return (await response.json()) as T;
}

export function IssuesProjectImportDialog({
  open,
  onOpenChange,
  organizationSlug,
  projects,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projects: { id: string; name: string }[];
  onImported: () => Promise<void>;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedProjectId("");
      setImportOpen(false);
      return;
    }
    if (projects.length === 1) {
      setSelectedProjectId(projects[0].id);
    }
  }, [open, projects]);

  const issueSheetQuery = useQuery({
    queryKey: ["issue-sheet", organizationSlug, selectedProjectId, "import-columns"],
    enabled: Boolean(selectedProjectId),
    queryFn: async () => {
      const response = await fetch(issueSheetPath(organizationSlug, selectedProjectId));
      return readJsonOrThrow<IssueSheetResponse>(response);
    },
  });

  function closePicker() {
    onOpenChange(false);
    setSelectedProjectId("");
    setImportOpen(false);
  }

  function startImport() {
    if (!selectedProjectId) {
      return;
    }
    setImportOpen(true);
  }

  const projectItems = projects.map((project) => ({ value: project.id, label: project.name }));

  return (
    <>
      <Dialog open={open && !importOpen} onOpenChange={(next) => !next && closePicker()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...issuesProjectImportDialogMessages.title} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...issuesProjectImportDialogMessages.description} />
            </DialogDescription>
          </DialogHeader>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <FormattedMessage {...issuesProjectImportDialogMessages.emptyProjects} />
            </p>
          ) : (
            <Select
              value={selectedProjectId || undefined}
              items={projectItems}
              onValueChange={(value) => setSelectedProjectId(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id} label={project.name}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closePicker}>
              <FormattedMessage {...issuesProjectImportDialogMessages.cancel} />
            </Button>
            <Button type="button" onClick={startImport} disabled={!selectedProjectId}>
              <FormattedMessage {...issuesProjectImportDialogMessages.continue} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedProjectId ? (
        <IssueSheetImportDialog
          open={importOpen}
          onOpenChange={(next) => {
            if (!next) {
              closePicker();
              return;
            }
            setImportOpen(true);
          }}
          organizationSlug={organizationSlug}
          projectId={selectedProjectId}
          columns={issueSheetQuery.data?.columns ?? []}
          onImported={onImported}
        />
      ) : null}
    </>
  );
}
