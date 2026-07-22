"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
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

import { issueTypeValues, type IssueTypeValue } from "./issue-sheet-constants";
import { issueSheetCreateIssueDialogMessages as messages } from "./issue-sheet-create-issue-dialog.messages";
import { issueSheetSharedMessages as sharedMessages } from "./issue-sheet-shared.messages";

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

async function readJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await readApiResponseError(response, fallbackMessage);
    throw new Error(error.message || fallbackMessage);
  }
  return (await response.json()) as T;
}

function issueTypeLabel(intl: ReturnType<typeof useIntl>, value: IssueTypeValue) {
  switch (value) {
    case "general_question":
      return intl.formatMessage(sharedMessages.issueTypeGeneralQuestion);
    case "translation_mistake":
      return intl.formatMessage(sharedMessages.issueTypeTranslationMistake);
    case "context_request":
      return intl.formatMessage(sharedMessages.issueTypeContextRequest);
    case "source_mistake":
      return intl.formatMessage(sharedMessages.issueTypeSourceMistake);
    case "glossary_violation":
      return intl.formatMessage(sharedMessages.issueTypeGlossaryViolation);
    case "qa_failure":
      return intl.formatMessage(sharedMessages.issueTypeQaFailure);
  }
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
  const intl = useIntl();
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

  const issueTypeItems = issueTypeValues.map((value) => ({
    value,
    label: issueTypeLabel(intl, value),
  }));

  const createIssue = useMutation({
    mutationFn: async (formData: FormData) => {
      if (!resolvedProjectId) {
        throw new Error(intl.formatMessage(messages.selectProject));
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
      return readJsonOrThrow<{ issue: { id: string } }>(
        response,
        intl.formatMessage(messages.requestFailed),
      );
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.issueAdded));
      onOpenChange(false);
      await onCreated();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.createFailed),
      ),
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
            <DialogTitle>
              <FormattedMessage {...messages.title} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.description} />
            </DialogDescription>
          </DialogHeader>
          {projects && projects.length > 0 ? (
            <Select
              value={selectedProjectId || undefined}
              items={projectItems}
              onValueChange={(value) => setSelectedProjectId(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={intl.formatMessage(messages.projectPlaceholder)} />
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
          <Input
            name="title"
            placeholder={intl.formatMessage(messages.titlePlaceholder)}
            required
          />
          <Textarea
            name="description"
            placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select name="issueType" defaultValue="general_question" items={issueTypeItems}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={intl.formatMessage(messages.issueTypePlaceholder)} />
              </SelectTrigger>
              <SelectContent>
                {issueTypeItems.map((type) => (
                  <SelectItem key={type.value} value={type.value} label={type.label}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select name="priority" defaultValue="P2" items={[...priorities]}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={intl.formatMessage(messages.priorityPlaceholder)} />
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
            <Input
              name="targetLocale"
              placeholder={intl.formatMessage(messages.localePlaceholder)}
            />
            <Input
              name="sourcePath"
              placeholder={intl.formatMessage(messages.sourcePathPlaceholder)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              name="linkLabel"
              placeholder={intl.formatMessage(messages.linkLabelPlaceholder)}
            />
            <Input name="linkUrl" placeholder={intl.formatMessage(messages.linkUrlPlaceholder)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createIssue.isPending || !resolvedProjectId}>
              <FormattedMessage {...messages.submit} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
