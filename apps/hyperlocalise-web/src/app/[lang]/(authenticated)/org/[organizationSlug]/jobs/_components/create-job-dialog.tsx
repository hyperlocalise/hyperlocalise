"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import {
  inferSupportedTranslationFileFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";
import { cn } from "@/lib/primitives/cn";

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

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value].toSorted((a, b) => a.localeCompare(b));
}

function SelectionList({
  items,
  selected,
  onToggle,
  emptyLabel,
  disabled,
}: {
  items: { id: string; label: string; secondary?: string | null }[];
  selected: string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
  disabled?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ScrollArea className="h-40 rounded-md border border-border">
      <div className="space-y-1 p-2">
        {items.map((item) => {
          const checked = selected.includes(item.id);
          return (
            <label
              key={item.id}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border border-input accent-primary"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(item.id)}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{item.label}</span>
                {item.secondary ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.secondary}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </ScrollArea>
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
        throw await readApiResponseError(response, "Failed to load files");
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
        throw await readApiResponseError(response, "Failed to load provider files");
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
        throw await readApiResponseError(response, "Failed to load members");
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
        throw await readApiResponseError(response, "Failed to load project members");
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

  const createJob = useMutation({
    mutationFn: async () => {
      if (!title.trim()) {
        throw new Error("Enter a job title.");
      }
      if (selectedLocales.length === 0) {
        throw new Error("Select at least one target locale.");
      }
      if (selectedFileIds.length === 0) {
        throw new Error("Select at least one file.");
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
        if (!response.ok) {
          throw await readApiResponseError(response, "Failed to create Crowdin jobs");
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

      for (const file of eligibleFiles) {
        const response = await apiClient.api.orgs[":organizationSlug"].projects[
          ":projectId"
        ].jobs.$post({
          param: { organizationSlug, projectId },
          json: {
            type: "file",
            title: title.trim(),
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
          const failure = await readApiResponseError(response, "Failed to create translation job");
          if (createdIds.length > 0) {
            throw new PartialCreateJobsError(
              `Created ${createdIds.length} of ${eligibleFiles.length} jobs, then failed: ${failure.message}`,
              createdIds.length,
            );
          }
          throw failure;
        }
        const body = (await response.json()) as { job: { id: string } };
        createdIds.push(body.job.id);
      }

      if (createdIds.length === 0) {
        throw new Error("No supported files were selected.");
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
      toast.success(result.count === 1 ? "Job created" : `${result.count} jobs created`);
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
          `${error.createdCount} job${error.createdCount === 1 ? "" : "s"} created before the error. Refresh the jobs list before retrying to avoid duplicates.`,
        );
      }
      toast.error(error instanceof Error ? error.message : "Failed to create job");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Create job</DialogTitle>
          <DialogDescription>
            {isProviderProject
              ? "Create Crowdin tasks with files, locales, and assignees."
              : "Create native translation jobs with files, locales, and an assignee."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="create-job-title">Title</Label>
            <Input
              id="create-job-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Release notes · JP + KO"
              maxLength={256}
            />
          </div>

          {isProviderProject ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Task type</Label>
                <Select
                  value={kind}
                  onValueChange={(value) => {
                    if (value === "translation" || value === "proofread") {
                      setKind(value);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="translation">Translation</SelectItem>
                    <SelectItem value="proofread">Proofread</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-job-description">Description</Label>
                <Textarea
                  id="create-job-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  maxLength={2048}
                  placeholder="Optional notes for translators"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Source locale: <span className="font-medium text-foreground">{sourceLocale}</span>
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Target locales</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() =>
                  setSelectedLocales(
                    selectedLocales.length === targetLocales.length ? [] : targetLocales,
                  )
                }
              >
                {selectedLocales.length === targetLocales.length ? "Clear" : "Select all"}
              </Button>
            </div>
            {targetLocales.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add target locales in project settings before creating jobs.
              </p>
            ) : (
              <SelectionList
                items={targetLocales.map((locale) => ({ id: locale, label: locale }))}
                selected={selectedLocales}
                onToggle={(locale) => setSelectedLocales((current) => toggleValue(current, locale))}
                emptyLabel="No locales available"
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Files</Label>
              <span className="text-xs text-muted-foreground">
                {selectedFileIds.length} selected
              </span>
            </div>
            {filesLoading ? (
              <div className="flex h-40 items-center justify-center rounded-md border border-border">
                <Spinner className="size-4" />
              </div>
            ) : (
              <SelectionList
                items={fileOptions.map((file) => ({ id: file.id, label: file.label }))}
                selected={selectedFileIds}
                onToggle={(fileId) => setSelectedFileIds((current) => toggleValue(current, fileId))}
                emptyLabel="No files available in this project."
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>{isProviderProject ? "Assignees" : "Assignee"}</Label>
            {assigneesLoading ? (
              <div className="flex h-40 items-center justify-center rounded-md border border-border">
                <Spinner className="size-4" />
              </div>
            ) : (
              <SelectionList
                items={assigneeOptions}
                selected={selectedAssignees}
                onToggle={(assigneeId) => {
                  if (isProviderProject) {
                    setSelectedAssignees((current) => toggleValue(current, assigneeId));
                    return;
                  }
                  setSelectedAssignees((current) =>
                    current.includes(assigneeId) ? [] : [assigneeId],
                  );
                }}
                emptyLabel={
                  isProviderProject
                    ? "No Crowdin project members found."
                    : "No organization members available."
                }
              />
            )}
            {!isProviderProject ? (
              <p className="text-xs text-muted-foreground">
                Optional. Native jobs currently support one assignee.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              createJob.isPending ||
              !title.trim() ||
              selectedLocales.length === 0 ||
              selectedFileIds.length === 0 ||
              targetLocales.length === 0
            }
            onClick={() => createJob.mutate()}
          >
            {createJob.isPending ? <Spinner className="size-4" /> : null}
            Create job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
