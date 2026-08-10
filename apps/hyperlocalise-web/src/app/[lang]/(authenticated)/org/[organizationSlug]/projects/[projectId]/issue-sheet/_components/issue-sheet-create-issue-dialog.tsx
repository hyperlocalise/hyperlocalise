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
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import {
  File01Icon,
  LanguageCircleIcon,
  Link01Icon,
  MoreHorizontalCircle01Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { readApiResponseError } from "@/lib/api-error";
import { cn } from "@/lib/primitives/cn";

import { IssueAssigneePicker } from "../../../../_components/issue-detail/issue-assignee-picker";
import {
  issuePriorityValues,
  issueStatusLabel,
  issueStatusValues,
  issueTypeLabel,
  type IssuePriorityValue,
  type IssueStatusValue,
} from "../../../../_components/issue-detail/issue-detail-utils";
import {
  IssueLocalePicker,
  resolveIssueCreateLocaleOptions,
  sanitizeIssueCreateTargetLocale,
} from "../../../../_components/issue-detail/issue-locale-picker";
import { IssuePriorityIcon } from "../../../../_components/issue-detail/issue-priority-icon";
import { IssueStatusIcon } from "../../../../_components/issue-detail/issue-status-icon";
import type { IssueSheetColumn } from "../../../../_components/issue-detail/issue-sheet-column-types";
import { useAssignableIssueMembersQuery } from "../../../../_components/issue-detail/use-assignable-issue-members";
import { useIssueSheetColumnsQuery } from "../../../../_components/issue-detail/use-issue-sheet-columns-query";
import { useProjectPageQuery } from "../../_components/project-page-shell";
import { issueTypeValues, type IssueTypeValue } from "./issue-sheet-constants";
import { issueSheetCreateIssueDialogMessages as messages } from "./issue-sheet-create-issue-dialog.messages";

const CREATE_COMPACT_COLUMN_TYPES = new Set(["select", "user", "text"]);
const CREATE_EXCLUDED_COLUMN_KEYS = new Set(["priority", "owner_note"]);

const propertyTriggerClassName =
  "h-7 gap-1.5 rounded-md border-0 bg-transparent px-1.5 text-xs font-normal text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground";

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

function isCreateCompactCustomColumn(column: IssueSheetColumn) {
  return (
    !CREATE_EXCLUDED_COLUMN_KEYS.has(column.key) && CREATE_COMPACT_COLUMN_TYPES.has(column.type)
  );
}

function buildValuesPayload(drafts: Record<string, string>) {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(drafts)) {
    const trimmed = value.trim();
    if (trimmed) {
      values[key] = trimmed;
    }
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

function stopMenuKeyboardPropagation(event: KeyboardEvent<HTMLDivElement>) {
  event.stopPropagation();
}

function MenuTextField({
  htmlFor,
  label,
  children,
}: {
  htmlFor?: string;
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5 px-1 py-1" onKeyDown={stopMenuKeyboardPropagation}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export type IssueSheetCreateStringLink = {
  translationKeyId?: string;
  segmentId: string;
  sourcePath: string;
  targetLocale: string;
  defaultTitle?: string;
  defaultDescription?: string;
  linkUrl?: string;
  linkLabel?: string;
};

export function IssueSheetCreateIssueDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  projects,
  stringLink,
  onCreated,
  defaultCreateMore = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId?: string;
  projects?: { id: string; name: string; targetLocales?: string[] }[];
  stringLink?: IssueSheetCreateStringLink;
  onCreated: () => Promise<void>;
  defaultCreateMore?: boolean;
}) {
  const intl = useIntl();
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<IssueStatusValue>("open");
  const [issueType, setIssueType] = useState<IssueTypeValue>("general_question");
  const [priority, setPriority] = useState<IssuePriorityValue>("P2");
  const [targetLocale, setTargetLocale] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState<string | null>(null);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [createMore, setCreateMore] = useState(defaultCreateMore);

  const {
    segmentId: linkSegmentId = null,
    sourcePath: linkSourcePath = null,
    targetLocale: linkTargetLocale = null,
    defaultTitle: linkDefaultTitle = null,
    defaultDescription: linkDefaultDescription = null,
    linkLabel: linkDefaultLinkLabel = null,
    linkUrl: linkDefaultLinkUrl = null,
  } = stringLink ?? {};
  const onlyProjectId = projects?.length === 1 ? projects[0].id : null;

  useEffect(() => {
    if (!open) {
      setSelectedProjectId("");
      setTitle("");
      setDescription("");
      setStatus("open");
      setIssueType("general_question");
      setPriority("P2");
      setTargetLocale("");
      setSourcePath("");
      setLinkLabel("");
      setLinkUrl("");
      setAssigneeUserId(null);
      setCustomValues({});
      setCreateMore(defaultCreateMore);
      return;
    }
    if (linkSegmentId) {
      setTitle(linkDefaultTitle ?? "");
      setDescription(linkDefaultDescription ?? "");
      setIssueType("context_request");
      setPriority("P2");
      setStatus("open");
      setTargetLocale(linkTargetLocale ?? "");
      setSourcePath(linkSourcePath ?? "");
      setLinkLabel(linkDefaultLinkLabel ?? "");
      setLinkUrl(linkDefaultLinkUrl ?? "");
      setCustomValues({});
    }
    if (projectId) {
      setSelectedProjectId(projectId);
      return;
    }
    if (onlyProjectId) {
      setSelectedProjectId(onlyProjectId);
    }
  }, [
    defaultCreateMore,
    linkDefaultDescription,
    linkDefaultLinkLabel,
    linkDefaultLinkUrl,
    linkDefaultTitle,
    linkSegmentId,
    linkSourcePath,
    linkTargetLocale,
    onlyProjectId,
    open,
    projectId,
  ]);

  const resolvedProjectId = projectId ?? selectedProjectId;

  const showProjectPicker = Boolean(projects && projects.length > 0 && !projectId);
  const assignableMembersQuery = useAssignableIssueMembersQuery({
    organizationSlug,
    projectId: resolvedProjectId || undefined,
    enabled: open && Boolean(resolvedProjectId),
  });
  const columnsQuery = useIssueSheetColumnsQuery({
    organizationSlug,
    projectId: resolvedProjectId || "",
    enabled: open && Boolean(resolvedProjectId),
  });
  const isOrganizationScoped = !projectId;
  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === resolvedProjectId),
    [projects, resolvedProjectId],
  );
  const projectQuery = useProjectPageQuery(organizationSlug, resolvedProjectId || "", {
    enabled:
      open &&
      Boolean(resolvedProjectId) &&
      (!isOrganizationScoped || !selectedProject?.targetLocales?.length),
  });
  const localeOptions = useMemo(
    () =>
      resolveIssueCreateLocaleOptions({
        resolvedProjectId: resolvedProjectId || undefined,
        projects,
        projectTargetLocales: projectQuery.data?.targetLocales,
      }),
    [projectQuery.data?.targetLocales, projects, resolvedProjectId],
  );

  useEffect(() => {
    setAssigneeUserId(null);
    setCustomValues({});
    if (!resolvedProjectId || linkSegmentId) {
      return;
    }
    setTargetLocale((current) =>
      sanitizeIssueCreateTargetLocale({
        currentLocale: current,
        resolvedProjectId,
        projects,
        projectTargetLocales: projectQuery.data?.targetLocales,
      }),
    );
  }, [linkSegmentId, projectQuery.data?.targetLocales, projects, resolvedProjectId]);

  const compactCustomColumns = useMemo(
    () => (columnsQuery.data ?? []).filter(isCreateCompactCustomColumn),
    [columnsQuery.data],
  );

  const statusItems = useMemo(
    () =>
      issueStatusValues.map((value) => ({
        value,
        label: issueStatusLabel(intl, value),
      })),
    [intl],
  );
  const priorityItems = useMemo(
    () => issuePriorityValues.map((value) => ({ value, label: value })),
    [],
  );
  const projectItems =
    projects?.map((project) => ({ value: project.id, label: project.name })) ?? [];
  const selectedProjectName =
    projects?.find((project) => project.id === selectedProjectId)?.name ??
    intl.formatMessage(messages.projectPlaceholder);

  function resetAfterCreateMore() {
    setTitle("");
    setDescription("");
    setAssigneeUserId(null);
    setCustomValues({});
    if (linkSegmentId) {
      setTargetLocale(linkTargetLocale ?? "");
      setSourcePath(linkSourcePath ?? "");
      setLinkLabel(linkDefaultLinkLabel ?? "");
      setLinkUrl(linkDefaultLinkUrl ?? "");
    } else {
      setTargetLocale("");
      setSourcePath("");
      setLinkLabel("");
      setLinkUrl("");
    }
  }

  const createIssue = useMutation({
    mutationFn: async () => {
      if (!resolvedProjectId) {
        throw new Error(intl.formatMessage(messages.selectProject));
      }
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        throw new Error(intl.formatMessage(messages.titleRequired));
      }
      const values = buildValuesPayload(customValues);
      const response = await fetch(issueSheetPath(organizationSlug, resolvedProjectId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          stringLink
            ? {
                title: trimmedTitle,
                description,
                issueType,
                status,
                targetLocale: stringLink.targetLocale,
                sourcePath: stringLink.sourcePath,
                segmentId: stringLink.segmentId,
                translationKeyId: stringLink.translationKeyId,
                linkKind: "cat_segment",
                linkLabel: linkLabel.trim() || stringLink.linkLabel || undefined,
                linkUrl: linkUrl.trim() || stringLink.linkUrl || undefined,
                priority,
                ...(assigneeUserId ? { assigneeUserId } : {}),
                ...(values ? { values } : {}),
              }
            : {
                title: trimmedTitle,
                description,
                issueType,
                status,
                targetLocale: targetLocale.trim() || undefined,
                sourcePath: sourcePath.trim() || undefined,
                linkKind: linkUrl.trim() ? "url" : "manual",
                linkLabel: linkLabel.trim() || undefined,
                linkUrl: linkUrl.trim() || undefined,
                priority,
                ...(assigneeUserId ? { assigneeUserId } : {}),
                ...(values ? { values } : {}),
              },
        ),
      });
      return readJsonOrThrow<{ issue: { id: string } }>(
        response,
        intl.formatMessage(messages.requestFailed),
      );
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.issueAdded));
      await onCreated();
      if (createMore) {
        resetAfterCreateMore();
        return;
      }
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.createFailed),
      ),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    createIssue.mutate();
  }

  function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (canSubmit) {
        createIssue.mutate();
      }
    }
  }

  const canSubmit = !createIssue.isPending && Boolean(resolvedProjectId) && title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <form
          onSubmit={submit}
          onKeyDown={handleFormKeyDown}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader className="px-5 pt-4 pb-2">
            <DialogTitle className="text-sm font-medium text-muted-foreground">
              <FormattedMessage {...messages.title} />
            </DialogTitle>
            <DialogDescription className="sr-only">
              <FormattedMessage {...messages.description} />
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
            <Input
              id="create-issue-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder={intl.formatMessage(messages.titlePlaceholder)}
              aria-label={intl.formatMessage(messages.titleLabel)}
              required
              autoFocus
              maxLength={256}
              className="h-auto rounded-none border-0 bg-transparent px-0 py-1 text-base font-medium shadow-none focus-visible:ring-0 md:text-lg"
            />

            <MarkdownEditor
              value={description}
              onChange={setDescription}
              disabled={createIssue.isPending}
              placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
              ariaLabel={intl.formatMessage(messages.descriptionLabel)}
              chrome="minimal"
              className="min-h-28 bg-transparent px-0"
            />

            <div className="flex flex-wrap items-center gap-0.5 pt-1">
              <Select
                value={status}
                items={statusItems}
                onValueChange={(value) => {
                  if (value && issueStatusValues.includes(value as IssueStatusValue)) {
                    setStatus(value as IssueStatusValue);
                  }
                }}
                disabled={createIssue.isPending}
              >
                <SelectTrigger
                  aria-label={intl.formatMessage(messages.statusLabel)}
                  showIcon={false}
                  className={propertyTriggerClassName}
                >
                  <span className="flex items-center gap-1.5">
                    <IssueStatusIcon status={status} />
                    {issueStatusLabel(intl, status)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {statusItems.map((item) => (
                    <SelectItem key={item.value} value={item.value} label={item.label}>
                      <span className="flex items-center gap-2">
                        <IssueStatusIcon status={item.value} />
                        {item.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={priority}
                items={priorityItems}
                onValueChange={(value) => {
                  if (value && issuePriorityValues.includes(value as IssuePriorityValue)) {
                    setPriority(value as IssuePriorityValue);
                  }
                }}
                disabled={createIssue.isPending}
              >
                <SelectTrigger
                  aria-label={intl.formatMessage(messages.priorityLabel)}
                  showIcon={false}
                  className={propertyTriggerClassName}
                >
                  <span className="flex items-center gap-1.5">
                    <IssuePriorityIcon priority={priority} size="sm" />
                    {priority}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {priorityItems.map((item) => (
                    <SelectItem key={item.value} value={item.value} label={item.label}>
                      <span className="flex items-center gap-2">
                        <IssuePriorityIcon priority={item.value} size="sm" />
                        {item.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {resolvedProjectId ? (
                <IssueAssigneePicker
                  value={assigneeUserId}
                  members={assignableMembersQuery.data?.members ?? []}
                  isLoading={assignableMembersQuery.isLoading}
                  disabled={createIssue.isPending}
                  onChange={setAssigneeUserId}
                  size="ghost"
                  triggerClassName={propertyTriggerClassName}
                />
              ) : null}

              {showProjectPicker ? (
                <Select
                  value={selectedProjectId || undefined}
                  items={projectItems}
                  onValueChange={(value) => {
                    setSelectedProjectId(value ?? "");
                    setAssigneeUserId(null);
                    setCustomValues({});
                  }}
                  disabled={createIssue.isPending}
                >
                  <SelectTrigger
                    aria-label={intl.formatMessage(messages.projectLabel)}
                    showIcon={false}
                    className={cn(propertyTriggerClassName, "max-w-40")}
                  >
                    <span className="truncate">{selectedProjectName}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((project) => (
                      <SelectItem key={project.id} value={project.id} label={project.name}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={intl.formatMessage(messages.moreProperties)}
                      disabled={createIssue.isPending}
                      className={propertyTriggerClassName}
                    />
                  }
                >
                  <HugeiconsIcon icon={MoreHorizontalCircle01Icon} className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-56" sideOffset={6}>
                  <DropdownMenuGroup>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <HugeiconsIcon icon={Tag01Icon} strokeWidth={1.8} className="size-4" />
                        <FormattedMessage {...messages.setType} />
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="min-w-52">
                        <DropdownMenuRadioGroup
                          value={issueType}
                          onValueChange={(value) => {
                            if (issueTypeValues.includes(value as IssueTypeValue)) {
                              setIssueType(value as IssueTypeValue);
                            }
                          }}
                        >
                          {issueTypeValues.map((value) => (
                            <DropdownMenuRadioItem key={value} value={value}>
                              {issueTypeLabel(intl, value)}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <HugeiconsIcon
                          icon={LanguageCircleIcon}
                          strokeWidth={1.8}
                          className="size-4"
                        />
                        <FormattedMessage {...messages.setLocale} />
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-72 p-2">
                        <MenuTextField
                          htmlFor="create-issue-locale"
                          label={<FormattedMessage {...messages.localeLabel} />}
                        >
                          <IssueLocalePicker
                            id="create-issue-locale"
                            value={targetLocale || null}
                            locales={localeOptions}
                            allowClear
                            disabled={
                              createIssue.isPending || (!isOrganizationScoped && !resolvedProjectId)
                            }
                            size="sm"
                            onValueChange={(locale) => setTargetLocale(locale ?? "")}
                          />
                        </MenuTextField>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="size-4" />
                        <FormattedMessage {...messages.setSourcePath} />
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-72 p-2">
                        <MenuTextField
                          htmlFor="create-issue-source-path"
                          label={<FormattedMessage {...messages.sourcePathLabel} />}
                        >
                          <Input
                            id="create-issue-source-path"
                            name="sourcePath"
                            value={sourcePath}
                            onChange={(event) => setSourcePath(event.currentTarget.value)}
                            placeholder={intl.formatMessage(messages.sourcePathPlaceholder)}
                            disabled={createIssue.isPending}
                            autoFocus
                          />
                        </MenuTextField>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <HugeiconsIcon icon={Link01Icon} strokeWidth={1.8} className="size-4" />
                        <FormattedMessage {...messages.addLink} />
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-72 space-y-2 p-2">
                        <MenuTextField
                          htmlFor="create-issue-link-label"
                          label={<FormattedMessage {...messages.linkLabelLabel} />}
                        >
                          <Input
                            id="create-issue-link-label"
                            name="linkLabel"
                            value={linkLabel}
                            onChange={(event) => setLinkLabel(event.currentTarget.value)}
                            placeholder={intl.formatMessage(messages.linkLabelPlaceholder)}
                            disabled={createIssue.isPending}
                            autoFocus
                          />
                        </MenuTextField>
                        <MenuTextField
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
                            disabled={createIssue.isPending}
                          />
                        </MenuTextField>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuGroup>

                  {compactCustomColumns.length > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        {compactCustomColumns.map((column) => {
                          const setLabel = intl.formatMessage(messages.setColumn, {
                            label: column.label,
                          });

                          if (column.type === "select") {
                            const options = column.config.options ?? [];
                            return (
                              <DropdownMenuSub key={column.id}>
                                <DropdownMenuSubTrigger>
                                  <HugeiconsIcon
                                    icon={Tag01Icon}
                                    strokeWidth={1.8}
                                    className="size-4"
                                  />
                                  {setLabel}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="min-w-44">
                                  <DropdownMenuRadioGroup
                                    value={customValues[column.key] || ""}
                                    onValueChange={(next) => {
                                      setCustomValues((current) => ({
                                        ...current,
                                        [column.key]: next,
                                      }));
                                    }}
                                  >
                                    {options.map((option) => (
                                      <DropdownMenuRadioItem key={option.id} value={option.id}>
                                        {option.label}
                                      </DropdownMenuRadioItem>
                                    ))}
                                  </DropdownMenuRadioGroup>
                                  {customValues[column.key] ? (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setCustomValues((current) => {
                                            const next = { ...current };
                                            delete next[column.key];
                                            return next;
                                          });
                                        }}
                                      >
                                        <FormattedMessage {...messages.clearValue} />
                                      </DropdownMenuItem>
                                    </>
                                  ) : null}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            );
                          }

                          if (column.type === "user") {
                            const members = assignableMembersQuery.data?.members ?? [];
                            const selectedUserId = customValues[column.key] || null;
                            return (
                              <DropdownMenuSub key={column.id}>
                                <DropdownMenuSubTrigger>
                                  <HugeiconsIcon
                                    icon={Tag01Icon}
                                    strokeWidth={1.8}
                                    className="size-4"
                                  />
                                  {setLabel}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="min-w-52">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setCustomValues((current) => {
                                        const next = { ...current };
                                        delete next[column.key];
                                        return next;
                                      });
                                    }}
                                  >
                                    <FormattedMessage {...messages.unassigned} />
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {members.map((member) => (
                                    <DropdownMenuItem
                                      key={member.userId}
                                      onClick={() => {
                                        setCustomValues((current) => ({
                                          ...current,
                                          [column.key]: member.userId,
                                        }));
                                      }}
                                    >
                                      <span className="truncate">
                                        {member.displayName.trim() || member.email}
                                      </span>
                                      {selectedUserId === member.userId ? (
                                        <span className="ms-auto text-xs text-muted-foreground">
                                          ✓
                                        </span>
                                      ) : null}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            );
                          }

                          return (
                            <DropdownMenuSub key={column.id}>
                              <DropdownMenuSubTrigger>
                                <HugeiconsIcon
                                  icon={Tag01Icon}
                                  strokeWidth={1.8}
                                  className="size-4"
                                />
                                {setLabel}
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-64 p-2">
                                <MenuTextField
                                  htmlFor={`create-issue-custom-${column.key}`}
                                  label={column.label}
                                >
                                  <Input
                                    id={`create-issue-custom-${column.key}`}
                                    value={customValues[column.key] ?? ""}
                                    onChange={(event) => {
                                      const nextValue = event.currentTarget.value;
                                      setCustomValues((current) => ({
                                        ...current,
                                        [column.key]: nextValue,
                                      }));
                                    }}
                                    disabled={createIssue.isPending}
                                    autoFocus
                                  />
                                </MenuTextField>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          );
                        })}
                      </DropdownMenuGroup>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border px-5 py-3 sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border border-input accent-primary"
                checked={createMore}
                disabled={createIssue.isPending}
                onChange={(event) => setCreateMore(event.currentTarget.checked)}
              />
              <FormattedMessage {...messages.createMore} />
            </label>
            <div className="flex items-center gap-2">
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
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
