"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { readApiResponseError } from "@/lib/api-error";

import { issueTypes } from "./issue-sheet-constants";

const priorities = [
  { value: "P0", label: "P0" },
  { value: "P1", label: "P1" },
  { value: "P2", label: "P2" },
] as const;

function issueSheetPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet`;
}

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" ? value : fallback;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await readApiResponseError(response, "Request failed");
    throw new Error(error.message || "Request failed");
  }
  return (await response.json()) as T;
}

export function IssueSheetCreateIssueDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  projects,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId?: string;
  projects?: { id: string; name: string }[];
  onCreated: () => Promise<void>;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "");

  useEffect(() => {
    if (!open) {
      setSelectedProjectId("");
      return;
    }
    if (projectId) {
      setSelectedProjectId(projectId);
      return;
    }
    if (projects?.length === 1) {
      setSelectedProjectId(projects[0].id);
    }
  }, [open, projectId, projects]);

  const resolvedProjectId = projectId ?? selectedProjectId;

  const createIssue = useMutation({
    mutationFn: async (formData: FormData) => {
      if (!resolvedProjectId) {
        throw new Error("Select a project");
      }
      const response = await fetch(issueSheetPath(organizationSlug, resolvedProjectId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formString(formData, "title"),
          description: formString(formData, "description"),
          issueType: formString(formData, "issueType", "general_question"),
          targetLocale: formString(formData, "targetLocale") || undefined,
          sourcePath: formString(formData, "sourcePath") || undefined,
          linkKind: formString(formData, "linkUrl") ? "url" : "manual",
          linkLabel: formString(formData, "linkLabel") || undefined,
          linkUrl: formString(formData, "linkUrl") || undefined,
          priority: formString(formData, "priority", "P2"),
        }),
      });
      return readJsonOrThrow<{ issue: { id: string } }>(response);
    },
    onSuccess: async () => {
      toast.success("Issue added");
      onOpenChange(false);
      await onCreated();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Issue create failed"),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createIssue.mutate(new FormData(event.currentTarget));
  }

  const projectItems =
    projects?.map((project) => ({ value: project.id, label: project.name })) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add issue</DialogTitle>
            <DialogDescription>
              Create a generic Issue Sheet row. Link it to CAT or another issue tracker when useful.
            </DialogDescription>
          </DialogHeader>
          {projects && projects.length > 0 ? (
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
          ) : null}
          <Input name="title" placeholder="Short issue title" required />
          <Textarea name="description" placeholder="What needs context, review, or a fix?" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select name="issueType" defaultValue="general_question" items={issueTypes}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Issue type" />
              </SelectTrigger>
              <SelectContent>
                {issueTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value} label={type.label}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select name="priority" defaultValue="P2" items={priorities}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((priority) => (
                  <SelectItem key={priority.value} value={priority.value} label={priority.label}>
                    {priority.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="targetLocale" placeholder="Locale, e.g. de-DE" />
            <Input name="sourcePath" placeholder="Source path" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="linkLabel" placeholder="Link label" />
            <Input name="linkUrl" placeholder="https://..." />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createIssue.isPending || !resolvedProjectId}>
              Add issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
