"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { MarkdownDescriptionEditor } from "@/components/markdown-description-editor/markdown-description-editor";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { readApiResponseError } from "@/lib/api-error";
import { cn } from "@/lib/primitives/cn";

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

function FormSection({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="text-xs font-medium text-muted-foreground uppercase">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  htmlFor,
  label,
  children,
}: {
  htmlFor?: string;
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issueType, setIssueType] = useState<IssueTypeValue>("general_question");
  const [priority, setPriority] = useState<(typeof priorities)[number]["value"]>("P2");
  const [targetLocale, setTargetLocale] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedProjectId("");
      setTitle("");
      setDescription("");
      setIssueType("general_question");
      setPriority("P2");
      setTargetLocale("");
      setSourcePath("");
      setLinkLabel("");
      setLinkUrl("");
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
  const showProjectPicker = Boolean(projects && projects.length > 0 && !projectId);

  const issueTypeItems = issueTypeValues.map((value) => ({
    value,
    label: issueTypeLabel(intl, value),
  }));

  const createIssue = useMutation({
    mutationFn: async () => {
      if (!resolvedProjectId) {
        throw new Error(intl.formatMessage(messages.selectProject));
      }
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        throw new Error(intl.formatMessage(messages.titleRequired));
      }
      const response = await fetch(issueSheetPath(organizationSlug, resolvedProjectId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description,
          issueType,
          targetLocale: targetLocale.trim() || undefined,
          sourcePath: sourcePath.trim() || undefined,
          linkKind: linkUrl.trim() ? "url" : "manual",
          linkLabel: linkLabel.trim() || undefined,
          linkUrl: linkUrl.trim() || undefined,
          priority,
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
    createIssue.mutate();
  }

  const projectItems =
    projects?.map((project) => ({ value: project.id, label: project.name })) ?? [];
  const canSubmit = !createIssue.isPending && Boolean(resolvedProjectId) && title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="text-balance">
              <FormattedMessage {...messages.title} />
            </DialogTitle>
            <DialogDescription className="text-pretty">
              <FormattedMessage {...messages.description} />
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 overflow-y-auto px-6 py-5">
            {showProjectPicker ? (
              <Field label={<FormattedMessage {...messages.projectLabel} />}>
                <Select
                  value={selectedProjectId || undefined}
                  items={projectItems}
                  onValueChange={(value) => setSelectedProjectId(value ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={intl.formatMessage(messages.projectPlaceholder)} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((project) => (
                      <SelectItem key={project.id} value={project.id} label={project.name}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <FormSection title={<FormattedMessage {...messages.detailsSection} />}>
              <Field
                htmlFor="create-issue-title"
                label={<FormattedMessage {...messages.titleLabel} />}
              >
                <Input
                  id="create-issue-title"
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  placeholder={intl.formatMessage(messages.titlePlaceholder)}
                  required
                  autoFocus
                  maxLength={256}
                />
              </Field>
              <Field label={<FormattedMessage {...messages.descriptionLabel} />}>
                <MarkdownDescriptionEditor
                  value={description}
                  onChange={setDescription}
                  disabled={createIssue.isPending}
                  placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
                  ariaLabel={intl.formatMessage(messages.descriptionLabel)}
                  chrome="minimal"
                  className="rounded-lg border border-border bg-muted/40 px-3"
                />
              </Field>
            </FormSection>

            <FormSection title={<FormattedMessage {...messages.propertiesSection} />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={<FormattedMessage {...messages.issueTypeLabel} />}>
                  <Select
                    value={issueType}
                    items={issueTypeItems}
                    onValueChange={(value) => {
                      if (value && issueTypeValues.includes(value as IssueTypeValue)) {
                        setIssueType(value as IssueTypeValue);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={intl.formatMessage(messages.issueTypePlaceholder)}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {issueTypeItems.map((type) => (
                        <SelectItem key={type.value} value={type.value} label={type.label}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={<FormattedMessage {...messages.priorityLabel} />}>
                  <Select
                    value={priority}
                    items={[...priorities]}
                    onValueChange={(value) => {
                      if (value === "P0" || value === "P1" || value === "P2") {
                        setPriority(value);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={intl.formatMessage(messages.priorityPlaceholder)} />
                    </SelectTrigger>
                    <SelectContent>
                      {priorities.map((item) => (
                        <SelectItem key={item.value} value={item.value} label={item.label}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </FormSection>

            <FormSection title={<FormattedMessage {...messages.contextSection} />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  htmlFor="create-issue-locale"
                  label={<FormattedMessage {...messages.localeLabel} />}
                >
                  <Input
                    id="create-issue-locale"
                    name="targetLocale"
                    value={targetLocale}
                    onChange={(event) => setTargetLocale(event.currentTarget.value)}
                    placeholder={intl.formatMessage(messages.localePlaceholder)}
                  />
                </Field>
                <Field
                  htmlFor="create-issue-source-path"
                  label={<FormattedMessage {...messages.sourcePathLabel} />}
                >
                  <Input
                    id="create-issue-source-path"
                    name="sourcePath"
                    value={sourcePath}
                    onChange={(event) => setSourcePath(event.currentTarget.value)}
                    placeholder={intl.formatMessage(messages.sourcePathPlaceholder)}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection title={<FormattedMessage {...messages.linkSection} />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  htmlFor="create-issue-link-label"
                  label={<FormattedMessage {...messages.linkLabelLabel} />}
                >
                  <Input
                    id="create-issue-link-label"
                    name="linkLabel"
                    value={linkLabel}
                    onChange={(event) => setLinkLabel(event.currentTarget.value)}
                    placeholder={intl.formatMessage(messages.linkLabelPlaceholder)}
                  />
                </Field>
                <Field
                  htmlFor="create-issue-link-url"
                  label={<FormattedMessage {...messages.linkUrlLabel} />}
                >
                  <Input
                    id="create-issue-link-url"
                    name="linkUrl"
                    type="url"
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.currentTarget.value)}
                    placeholder={intl.formatMessage(messages.linkUrlPlaceholder)}
                  />
                </Field>
              </div>
            </FormSection>
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={createIssue.isPending}
              onClick={() => onOpenChange(false)}
            >
              <FormattedMessage {...messages.cancel} />
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {createIssue.isPending ? <Spinner className="size-4" /> : null}
              <FormattedMessage {...messages.submit} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
