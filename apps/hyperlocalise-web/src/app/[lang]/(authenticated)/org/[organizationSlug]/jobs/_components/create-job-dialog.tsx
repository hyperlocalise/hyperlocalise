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
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import {
  CheckListIcon,
  LanguageCircleIcon,
  TranslateIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { toast } from "sonner";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import {
  formatLocaleDisplayName,
  formatLocaleOptionLabel,
} from "@/lib/i18n/locale-display-names.messages";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import {
  inferSupportedTranslationFileFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";
import { cn } from "@/lib/primitives/cn";

import { createJobDialogMessages } from "./create-job-dialog.messages";
import { CreateJobFileTree } from "./create-job-file-tree";

class PartialCreateJobsError extends Error {
  readonly createdCount: number;

  constructor(message: string, createdCount: number) {
    super(message);
    this.name = "PartialCreateJobsError";
    this.createdCount = createdCount;
  }
}

type CreateJobDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  onCreated?: () => void;
};

type AssigneeOption = {
  id: string;
  label: string;
  secondary?: string | null;
};

type FileOption = {
  id: string;
  label: string;
  storedFileId?: string | null;
  fileFormat?: SupportedTranslationFileFormat | null;
};

type PropertyPickerItem = {
  id: string;
  label: string;
  secondary?: string | null;
  searchValue?: string;
};

const propertyTriggerClassName =
  "h-7 gap-1.5 rounded-md border-0 bg-transparent px-1.5 text-xs font-normal text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground";

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value].toSorted((a, b) => a.localeCompare(b));
}

function CreateJobPropertyPicker({
  icon,
  ariaLabel,
  triggerLabel,
  items,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  emptyLabel,
  searchPlaceholder,
  isLoading,
  disabled,
  multiple = true,
}: {
  icon: IconSvgElement;
  ariaLabel: string;
  triggerLabel: string;
  items: PropertyPickerItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll?: () => void;
  onClear?: () => void;
  emptyLabel: string;
  searchPlaceholder: string;
  isLoading?: boolean;
  disabled?: boolean;
  multiple?: boolean;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || isLoading}
            aria-label={ariaLabel}
            className={cn(propertyTriggerClassName, "max-w-48")}
          />
        }
      >
        {isLoading ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <HugeiconsIcon icon={icon} strokeWidth={1.8} data-icon="inline-start" />
        )}
        <span className="min-w-0 truncate">{triggerLabel}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" sideOffset={6}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList label={ariaLabel} aria-multiselectable={multiple ? true : undefined}>
            <CommandEmpty>
              {isLoading ? <FormattedMessage {...createJobDialogMessages.loading} /> : emptyLabel}
            </CommandEmpty>
            {multiple && items.length > 0 ? (
              <>
                <CommandGroup>
                  {onSelectAll ? (
                    <CommandItem
                      value="select-all"
                      onSelect={() => {
                        onSelectAll();
                      }}
                    >
                      <FormattedMessage {...createJobDialogMessages.selectAll} />
                    </CommandItem>
                  ) : null}
                  {onClear && selectedIds.length > 0 ? (
                    <CommandItem
                      value="clear-all"
                      onSelect={() => {
                        onClear();
                      }}
                    >
                      <FormattedMessage {...createJobDialogMessages.clear} />
                    </CommandItem>
                  ) : null}
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            {!multiple ? (
              <>
                <CommandGroup>
                  <CommandItem
                    value={`${intl.formatMessage(createJobDialogMessages.unassigned)} unassigned`}
                    data-checked={selectedIds.length === 0 || undefined}
                    aria-checked={selectedIds.length === 0}
                    onSelect={() => {
                      onClear?.();
                      setOpen(false);
                    }}
                  >
                    <FormattedMessage {...createJobDialogMessages.unassigned} />
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            <CommandGroup>
              {items.map((item) => {
                const checked = selectedSet.has(item.id);
                return (
                  <CommandItem
                    key={item.id}
                    value={item.searchValue ?? `${item.id} ${item.label} ${item.secondary ?? ""}`}
                    data-checked={checked || undefined}
                    aria-checked={checked}
                    onSelect={() => {
                      onToggle(item.id);
                      if (!multiple) {
                        setOpen(false);
                      }
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="block truncate">{item.label}</span>
                      {item.secondary ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.secondary}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CreateJobDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  sourceLocale,
  targetLocales,
  onCreated,
}: CreateJobDialogProps) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const parsedProviderProject = parseProviderProjectId(projectId);
  const isProviderProject = Boolean(parsedProviderProject);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedLocales, setSelectedLocales] = useState<string[]>(targetLocales);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [kind, setKind] = useState<"translation" | "proofread">("translation");

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle("");
    setDescription("");
    setSelectedLocales(targetLocales);
    setSelectedFileIds([]);
    setSelectedAssignees([]);
    setKind("translation");
  }, [open, targetLocales]);

  const nativeFilesQuery = useQuery({
    queryKey: ["project-files", organizationSlug, projectId, "create-job"],
    enabled: open && !isProviderProject,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.$get({
        param: { organizationSlug, projectId },
        query: { limit: "500" },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(createJobDialogMessages.loadFilesFailed),
        );
      }
      const body = (await response.json()) as { files: ProjectFileRecord[] };
      return body.files;
    },
  });

  const providerFilesQuery = useQuery({
    queryKey: ["tms-project-files", organizationSlug, projectId, "create-job"],
    enabled: open && Boolean(parsedProviderProject),
    queryFn: async () => {
      if (!parsedProviderProject) {
        return [];
      }
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].projects[
        ":externalProjectId"
      ].files.$get({
        param: {
          organizationSlug,
          externalProjectId: parsedProviderProject.externalProjectId,
        },
        query: { limit: "500" },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(createJobDialogMessages.loadProviderFilesFailed),
        );
      }
      const body = (await response.json()) as {
        files: Array<{
          sourcePath: string;
          filename: string;
          provider?: { externalResourceId: string; resourceType: string } | null;
        }>;
      };
      return body.files;
    },
  });

  const nativeAssigneesQuery = useQuery({
    queryKey: ["org-members", organizationSlug, "create-job"],
    enabled: open && !isProviderProject,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].members.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(createJobDialogMessages.loadMembersFailed),
        );
      }
      const body = (await response.json()) as {
        members: Array<{
          workosUserId: string;
          displayName: string;
          email: string;
          status: string;
        }>;
      };
      return body.members.filter((member) => member.status === "active");
    },
  });

  const providerAssigneesQuery = useQuery({
    queryKey: ["tms-project-members", organizationSlug, projectId, "create-job"],
    enabled: open && Boolean(parsedProviderProject),
    queryFn: async () => {
      if (!parsedProviderProject) {
        return [];
      }
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].projects[
        ":externalProjectId"
      ].members.$get({
        param: {
          organizationSlug,
          externalProjectId: parsedProviderProject.externalProjectId,
        },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(createJobDialogMessages.loadProjectMembersFailed),
        );
      }
      const body = (await response.json()) as {
        members: Array<{
          externalUserId: string;
          username: string;
          displayName: string;
          role?: string | null;
        }>;
      };
      return body.members;
    },
  });

  const fileOptions = useMemo((): FileOption[] => {
    if (isProviderProject) {
      return (providerFilesQuery.data ?? [])
        .filter(
          (file) => file.provider?.resourceType === "file" && file.provider.externalResourceId,
        )
        .map((file) => ({
          id: file.provider!.externalResourceId,
          label: file.sourcePath || file.filename,
        }));
    }

    return (nativeFilesQuery.data ?? [])
      .filter((file) => Boolean(file.storedFileId))
      .flatMap((file) => {
        const fileFormat = inferSupportedTranslationFileFormat(file.sourcePath);
        if (!fileFormat || !file.storedFileId) {
          return [];
        }
        return [
          {
            id: file.storedFileId,
            label: file.sourcePath,
            storedFileId: file.storedFileId,
            fileFormat,
          },
        ];
      });
  }, [isProviderProject, nativeFilesQuery.data, providerFilesQuery.data]);

  const assigneeOptions = useMemo((): AssigneeOption[] => {
    if (isProviderProject) {
      return (providerAssigneesQuery.data ?? []).map((member) => ({
        id: member.externalUserId,
        label: member.displayName || member.username,
        secondary: member.role ? `${member.username} · ${member.role}` : member.username,
      }));
    }

    return (nativeAssigneesQuery.data ?? []).map((member) => ({
      id: member.workosUserId,
      label: member.displayName,
      secondary: member.email,
    }));
  }, [isProviderProject, nativeAssigneesQuery.data, providerAssigneesQuery.data]);

  const filesLoading = isProviderProject
    ? providerFilesQuery.isLoading
    : nativeFilesQuery.isLoading;
  const assigneesLoading = isProviderProject
    ? providerAssigneesQuery.isLoading
    : nativeAssigneesQuery.isLoading;

  const kindItems = useMemo(
    () => [
      {
        value: "translation",
        label: intl.formatMessage(createJobDialogMessages.taskTypeTranslation),
      },
      {
        value: "proofread",
        label: intl.formatMessage(createJobDialogMessages.taskTypeProofread),
      },
    ],
    [intl],
  );

  const localeItems = useMemo(
    () =>
      targetLocales.map((locale) => ({
        id: locale,
        label: formatLocaleDisplayName(intl, locale),
        secondary: locale,
        searchValue: formatLocaleOptionLabel(intl, locale),
      })),
    [intl, targetLocales],
  );

  const localeTriggerLabel = useMemo(() => {
    if (selectedLocales.length === 0) {
      return intl.formatMessage(createJobDialogMessages.localesPlaceholder);
    }
    if (targetLocales.length > 0 && selectedLocales.length === targetLocales.length) {
      return intl.formatMessage(createJobDialogMessages.allLocales);
    }
    if (selectedLocales.length === 1) {
      return formatLocaleDisplayName(intl, selectedLocales[0]);
    }
    return intl.formatMessage(createJobDialogMessages.localeCount, {
      count: selectedLocales.length,
    });
  }, [intl, selectedLocales, targetLocales.length]);

  const assigneeTriggerLabel = useMemo(() => {
    if (selectedAssignees.length === 0) {
      return intl.formatMessage(createJobDialogMessages.unassigned);
    }
    if (selectedAssignees.length === 1) {
      return (
        assigneeOptions.find((assignee) => assignee.id === selectedAssignees[0])?.label ??
        intl.formatMessage(createJobDialogMessages.assigneeCount, { count: 1 })
      );
    }
    return intl.formatMessage(createJobDialogMessages.assigneeCount, {
      count: selectedAssignees.length,
    });
  }, [assigneeOptions, intl, selectedAssignees]);

  const createJob = useMutation({
    mutationFn: async () => {
      if (!title.trim()) {
        throw new Error(intl.formatMessage(createJobDialogMessages.titleRequired));
      }
      if (selectedLocales.length === 0) {
        throw new Error(intl.formatMessage(createJobDialogMessages.localesRequired));
      }
      if (selectedFileIds.length === 0) {
        throw new Error(intl.formatMessage(createJobDialogMessages.filesRequired));
      }

      if (parsedProviderProject) {
        const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].projects[
          ":externalProjectId"
        ].jobs.$post({
          param: {
            organizationSlug,
            externalProjectId: parsedProviderProject.externalProjectId,
          },
          json: {
            title: title.trim(),
            targetLocales: selectedLocales,
            fileIds: selectedFileIds,
            kind,
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(selectedAssignees.length > 0 ? { assigneeExternalUserIds: selectedAssignees } : {}),
          },
        });
        if (!response.ok || response.status === 207) {
          const body: unknown = await response.json().catch(() => null);
          const createdCount =
            body &&
            typeof body === "object" &&
            "createdCount" in body &&
            typeof (body as { createdCount: unknown }).createdCount === "number"
              ? (body as { createdCount: number }).createdCount
              : body &&
                  typeof body === "object" &&
                  "jobs" in body &&
                  Array.isArray((body as { jobs: unknown }).jobs)
                ? (body as { jobs: unknown[] }).jobs.length
                : 0;
          const message =
            body &&
            typeof body === "object" &&
            "message" in body &&
            typeof (body as { message: unknown }).message === "string"
              ? (body as { message: string }).message
              : intl.formatMessage(createJobDialogMessages.createCrowdinFailed);
          if (createdCount > 0) {
            throw new PartialCreateJobsError(message, createdCount);
          }
          throw new Error(message);
        }
        const body = (await response.json()) as { jobs: unknown[] };
        return { count: body.jobs.length };
      }

      const selectedFiles = fileOptions.filter((file) => selectedFileIds.includes(file.id));
      const eligibleFiles = selectedFiles.filter(
        (file) => Boolean(file.storedFileId) && Boolean(file.fileFormat),
      );
      const ownerWorkosUserId = selectedAssignees[0];
      const createdIds: string[] = [];
      const trimmedDescription = description.trim();

      for (const file of eligibleFiles) {
        const response = await apiClient.api.orgs[":organizationSlug"].projects[
          ":projectId"
        ].jobs.$post({
          param: { organizationSlug, projectId },
          json: {
            type: "file",
            title: title.trim(),
            kind,
            ...(trimmedDescription ? { description: trimmedDescription } : {}),
            ...(ownerWorkosUserId ? { ownerWorkosUserId } : {}),
            fileInput: {
              sourceFileId: file.storedFileId!,
              fileFormat: file.fileFormat!,
              sourceLocale,
              targetLocales: selectedLocales,
            },
          },
        });
        if (!response.ok) {
          const failure = await readApiResponseError(
            response,
            intl.formatMessage(createJobDialogMessages.createNativeFailed),
          );
          if (createdIds.length > 0) {
            throw new PartialCreateJobsError(
              intl.formatMessage(createJobDialogMessages.partialCreateNative, {
                createdCount: createdIds.length,
                totalCount: eligibleFiles.length,
                errorMessage: failure.message,
              }),
              createdIds.length,
            );
          }
          throw failure;
        }
        const body = (await response.json()) as { job: { id: string } };
        createdIds.push(body.job.id);
      }

      if (createdIds.length === 0) {
        throw new Error(intl.formatMessage(createJobDialogMessages.noSupportedFiles));
      }

      return { count: createdIds.length };
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] }),
        queryClient.invalidateQueries({
          queryKey: ["project-overview-jobs", organizationSlug, projectId],
        }),
        queryClient.invalidateQueries({ queryKey: ["project-files", organizationSlug, projectId] }),
      ]);
      toast.success(
        result.count === 1
          ? intl.formatMessage(createJobDialogMessages.createSuccessOne)
          : intl.formatMessage(createJobDialogMessages.createSuccessMany, { count: result.count }),
      );
      onCreated?.();
      onOpenChange(false);
    },
    onError: async (error) => {
      if (error instanceof PartialCreateJobsError && error.createdCount > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] }),
          queryClient.invalidateQueries({
            queryKey: ["project-overview-jobs", organizationSlug, projectId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["project-files", organizationSlug, projectId],
          }),
        ]);
        toast.warning(
          intl.formatMessage(createJobDialogMessages.partialCreateWarning, {
            count: error.createdCount,
          }),
        );
      }
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(createJobDialogMessages.createFailedFallback),
      );
    },
  });

  const canSubmit =
    !createJob.isPending &&
    Boolean(title.trim()) &&
    selectedLocales.length > 0 &&
    selectedFileIds.length > 0 &&
    targetLocales.length > 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    createJob.mutate();
  }

  function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (canSubmit) {
        createJob.mutate();
      }
    }
  }

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
              <FormattedMessage {...createJobDialogMessages.title} />
            </DialogTitle>
            <DialogDescription className="sr-only">
              <FormattedMessage {...createJobDialogMessages.description} />
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-3">
            <Input
              id="create-job-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder={intl.formatMessage(createJobDialogMessages.titlePlaceholder)}
              aria-label={intl.formatMessage(createJobDialogMessages.titleLabel)}
              required
              autoFocus
              maxLength={256}
              className="h-auto rounded-none border-0 bg-transparent px-0 py-1 text-base font-medium shadow-none focus-visible:ring-0 md:text-lg"
            />

            <MarkdownEditor
              value={description}
              onChange={setDescription}
              disabled={createJob.isPending}
              placeholder={intl.formatMessage(createJobDialogMessages.descriptionPlaceholder)}
              ariaLabel={intl.formatMessage(createJobDialogMessages.descriptionLabel)}
              chrome="default"
              imageUpload={{ organizationSlug, projectId }}
              className="min-h-28"
            />

            <CreateJobFileTree
              files={fileOptions}
              selectedIds={selectedFileIds}
              onSelectedIdsChange={setSelectedFileIds}
              isLoading={filesLoading}
              disabled={createJob.isPending}
            />

            <div className="flex flex-wrap items-center gap-0.5 pt-1">
              <Select
                value={kind}
                items={kindItems}
                onValueChange={(value) => {
                  if (value === "translation" || value === "proofread") {
                    setKind(value);
                  }
                }}
                disabled={createJob.isPending}
              >
                <SelectTrigger
                  aria-label={intl.formatMessage(createJobDialogMessages.taskTypeLabel)}
                  showIcon={false}
                  className={propertyTriggerClassName}
                >
                  <span className="flex items-center gap-1.5">
                    <HugeiconsIcon
                      icon={kind === "proofread" ? CheckListIcon : TranslateIcon}
                      strokeWidth={1.8}
                      className="size-3.5"
                    />
                    {intl.formatMessage(
                      kind === "proofread"
                        ? createJobDialogMessages.taskTypeProofread
                        : createJobDialogMessages.taskTypeTranslation,
                    )}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {kindItems.map((item) => (
                      <SelectItem key={item.value} value={item.value} label={item.label}>
                        <span className="flex items-center gap-2">
                          <HugeiconsIcon
                            icon={item.value === "proofread" ? CheckListIcon : TranslateIcon}
                            strokeWidth={1.8}
                          />
                          {item.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <CreateJobPropertyPicker
                icon={LanguageCircleIcon}
                ariaLabel={intl.formatMessage(createJobDialogMessages.targetLocalesLabel)}
                triggerLabel={localeTriggerLabel}
                items={localeItems}
                selectedIds={selectedLocales}
                onToggle={(locale) => setSelectedLocales((current) => toggleValue(current, locale))}
                onSelectAll={() => setSelectedLocales(targetLocales)}
                onClear={() => setSelectedLocales([])}
                emptyLabel={intl.formatMessage(
                  targetLocales.length === 0
                    ? createJobDialogMessages.noTargetLocalesConfigured
                    : createJobDialogMessages.noLocalesAvailable,
                )}
                searchPlaceholder={intl.formatMessage(createJobDialogMessages.searchLocales)}
                disabled={createJob.isPending}
              />

              <CreateJobPropertyPicker
                icon={UserIcon}
                ariaLabel={intl.formatMessage(
                  isProviderProject
                    ? createJobDialogMessages.assigneesLabel
                    : createJobDialogMessages.assigneeLabel,
                )}
                triggerLabel={assigneeTriggerLabel}
                items={assigneeOptions.map((assignee) => ({
                  id: assignee.id,
                  label: assignee.label,
                  secondary: assignee.secondary,
                }))}
                selectedIds={selectedAssignees}
                onToggle={(assigneeId) => {
                  if (isProviderProject) {
                    setSelectedAssignees((current) => toggleValue(current, assigneeId));
                    return;
                  }
                  setSelectedAssignees((current) =>
                    current.includes(assigneeId) ? [] : [assigneeId],
                  );
                }}
                onSelectAll={
                  isProviderProject
                    ? () => setSelectedAssignees(assigneeOptions.map((assignee) => assignee.id))
                    : undefined
                }
                onClear={() => setSelectedAssignees([])}
                emptyLabel={intl.formatMessage(
                  isProviderProject
                    ? createJobDialogMessages.noCrowdinMembers
                    : createJobDialogMessages.noOrgMembers,
                )}
                searchPlaceholder={intl.formatMessage(createJobDialogMessages.searchAssignees)}
                isLoading={assigneesLoading}
                disabled={createJob.isPending}
                multiple={isProviderProject}
              />
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-border px-5 py-3 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={createJob.isPending}
              onClick={() => onOpenChange(false)}
            >
              <FormattedMessage {...createJobDialogMessages.cancel} />
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {createJob.isPending ? <Spinner data-icon="inline-start" /> : null}
              <FormattedMessage {...createJobDialogMessages.submit} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
