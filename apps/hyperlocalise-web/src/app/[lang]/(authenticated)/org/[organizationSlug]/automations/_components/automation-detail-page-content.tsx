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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Delete02Icon, PlayIcon, SaveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { buildWorkspaceAutomationWebChatHref } from "@/lib/agents/workspace-automation-web-chat-url";
import {
  createWorkspaceAutomationFormStateFromRecord,
  formStateToWorkspaceAutomationPayload,
  mapWorkspaceAutomationApiErrorToFieldErrors,
  validateWorkspaceAutomationFormState,
  workspaceAutomationFormHasChanges,
  workspaceAutomationFormSupportsOnDemandRun,
} from "@/lib/agents/workspace-automation-view-model";
import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { automationDetailPageContentMessages } from "./automation-detail-page-content.messages";
import { WebChatUrlCopyField } from "./web-chat-url-copy-field";
import { WorkspaceAutomationEditor } from "./workspace-automation-form";

export const AUTOMATION_SOURCE_FILES_PAGE_SIZE = 50;
const SOURCE_FILE_SEARCH_DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function uniqueSourceFilesByPath<T extends { sourcePath: string }>(files: T[]) {
  return Array.from(new Map(files.map((file) => [file.sourcePath, file])).values());
}

export function AutomationDetailPageContent({
  organizationSlug,
  projectId,
  automationId,
  knowledgeAvailable = false,
  canUpdateKnowledgeMemory = false,
}: {
  organizationSlug: string;
  projectId?: string;
  automationId: string;
  knowledgeAvailable?: boolean;
  canUpdateKnowledgeMemory?: boolean;
}) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const automationsBasePath = buildAutomationsPath(organizationSlug, { projectId });

  const automationQuery = useQuery({
    queryKey: ["workspace-automation", organizationSlug, automationId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].automations[
        ":automationId"
      ].$get({
        param: { organizationSlug, automationId },
      });
      if (response.status !== 200) {
        throw new Error("Failed to load automation");
      }
      return response.json();
    },
  });

  const automation = automationQuery.data?.automation;
  const recentRuns = automationQuery.data?.recentRuns ?? [];
  const [form, setForm] = useState<ReturnType<
    typeof createWorkspaceAutomationFormStateFromRecord
  > | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sourceFileDialogOpen, setSourceFileDialogOpen] = useState(false);
  const [selectedSourcePaths, setSelectedSourcePaths] = useState<string[]>([]);
  const [sourceFileSearch, setSourceFileSearch] = useState("");
  const writeLockRef = useRef<"save" | "delete" | null>(null);
  const debouncedSourceFileSearch = useDebouncedValue(
    sourceFileSearch.trim(),
    SOURCE_FILE_SEARCH_DEBOUNCE_MS,
  );

  const sourceFilesQuery = useInfiniteQuery({
    queryKey: [
      "automation-source-files",
      organizationSlug,
      automation?.projectId,
      debouncedSourceFileSearch,
    ],
    enabled: sourceFileDialogOpen && Boolean(automation?.projectId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const projectId = automation?.projectId;
      if (!projectId) {
        return [];
      }
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.$get({
        param: { organizationSlug, projectId },
        query: {
          limit: String(AUTOMATION_SOURCE_FILES_PAGE_SIZE),
          offset: String(pageParam),
          origin: "repository",
          ...(debouncedSourceFileSearch ? { search: debouncedSourceFileSearch } : {}),
        },
      });
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load source files");
      }
      const body = await response.json();
      return uniqueSourceFilesByPath(body.files).toSorted((left, right) =>
        left.sourcePath.localeCompare(right.sourcePath),
      );
    },
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.length < AUTOMATION_SOURCE_FILES_PAGE_SIZE) {
        return undefined;
      }
      return pages.reduce((sum, page) => sum + page.length, 0);
    },
  });

  const visibleSourceFiles = useMemo(
    () => uniqueSourceFilesByPath(sourceFilesQuery.data?.pages.flat() ?? []),
    [sourceFilesQuery.data?.pages],
  );

  useEffect(() => {
    if (automation) {
      setForm(createWorkspaceAutomationFormStateFromRecord(automation));
    }
  }, [automation]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) {
        throw new Error("missing_form");
      }
      if (writeLockRef.current === "delete") {
        throw new Error("delete_in_progress");
      }
      writeLockRef.current = "save";

      try {
        const fieldErrors = validateWorkspaceAutomationFormState(form);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          throw new Error("validation_failed");
        }

        const payload = formStateToWorkspaceAutomationPayload(form);
        const response = await apiClient.api.orgs[":organizationSlug"].automations[
          ":automationId"
        ].$patch({
          param: { organizationSlug, automationId },
          json: payload,
        });

        if (response.status !== 200) {
          const body = await response.json();
          if ("error" in body && typeof body.error === "string") {
            setErrors(mapWorkspaceAutomationApiErrorToFieldErrors(body.error));
          }
          throw new Error("Failed to update automation");
        }

        return response.json();
      } finally {
        if (writeLockRef.current === "save") {
          writeLockRef.current = null;
        }
      }
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(automationDetailPageContentMessages.updateSuccess));
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automation", organizationSlug, automationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automations", organizationSlug],
      });
    },
    onError: (error) => {
      if (error.message === "validation_failed" || error.message === "delete_in_progress") {
        return;
      }
      toast.error(intl.formatMessage(automationDetailPageContentMessages.updateError));
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].automations[
        ":automationId"
      ].runs.$post({
        param: { organizationSlug, automationId },
        json: {
          idempotencyKey: `manual:${automationId}:${Date.now()}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to queue automation run");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(automationDetailPageContentMessages.runQueued));
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automation", organizationSlug, automationId],
      });
    },
    onError: () => {
      toast.error(intl.formatMessage(automationDetailPageContentMessages.runError));
    },
  });

  const sourceFileRunMutation = useMutation({
    mutationFn: async (sourcePaths: string[]) => {
      const response = await apiClient.api.orgs[":organizationSlug"].automations[":automationId"][
        "source-files"
      ].$post({
        param: { organizationSlug, automationId },
        json: { sourcePaths },
      });
      if (response.status !== 202) {
        throw await readApiResponseError(response, "Failed to run automation for source files");
      }
      return response.json();
    },
    onSuccess: ({ selectedCount, queuedCount }) => {
      toast.success(
        intl.formatMessage(automationDetailPageContentMessages.sourceFilesQueued, {
          count: selectedCount,
          queued: queuedCount,
        }),
      );
      setSourceFileDialogOpen(false);
      setSelectedSourcePaths([]);
      setSourceFileSearch("");
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automation", organizationSlug, automationId],
      });
    },
    onError: () => {
      toast.error(intl.formatMessage(automationDetailPageContentMessages.sourceFilesRunError));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (writeLockRef.current === "save") {
        throw new Error("save_in_progress");
      }
      writeLockRef.current = "delete";
      try {
        const response = await apiClient.api.orgs[":organizationSlug"].automations[
          ":automationId"
        ].$delete({
          param: { organizationSlug, automationId },
        });
        if (!response.ok) {
          throw new Error("Failed to delete automation");
        }
      } finally {
        if (writeLockRef.current === "delete") {
          writeLockRef.current = null;
        }
      }
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(automationDetailPageContentMessages.deleteSuccess));
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automations", organizationSlug],
      });
      setDeleteDialogOpen(false);
      router.push(automationsBasePath);
    },
    onError: (error) => {
      if (error.message === "save_in_progress") {
        return;
      }
      toast.error(intl.formatMessage(automationDetailPageContentMessages.deleteError));
    },
  });

  if (automationQuery.isLoading || !form || !automation) {
    return (
      <WorkspacePageShell>
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...automationDetailPageContentMessages.loading} />
        </p>
      </WorkspacePageShell>
    );
  }

  const savedForm = createWorkspaceAutomationFormStateFromRecord(automation);
  const hasChanges = workspaceAutomationFormHasChanges(form, savedForm);
  const showRunButton =
    workspaceAutomationFormSupportsOnDemandRun(form.triggerMode) &&
    workspaceAutomationFormSupportsOnDemandRun(savedForm.triggerMode);
  const showSourceFileRunButton =
    form.triggerMode === "source_upload" && savedForm.triggerMode === "source_upload";
  const saveInFlight = saveMutation.isPending;
  const deleteInFlight = deleteMutation.isPending;
  const writeInFlight = saveInFlight || deleteInFlight;

  return (
    <WorkspacePageShell className="max-w-5xl">
      <WorkspaceAutomationEditor
        mode="detail"
        organizationSlug={organizationSlug}
        automationId={automationId}
        form={form}
        errors={errors}
        knowledgeAvailable={knowledgeAvailable}
        canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
        onChange={setForm}
        runHistory={recentRuns}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (writeInFlight) {
                  return;
                }
                setDeleteDialogOpen(true);
              }}
              disabled={writeInFlight}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} data-icon="inline-start" />
              <FormattedMessage {...automationDetailPageContentMessages.deleteAutomation} />
            </Button>
            {form.triggerMode === "web_chat" ? (
              <>
                <div className="hidden min-w-0 max-w-xs md:block">
                  <WebChatUrlCopyField
                    automationId={automationId}
                    organizationSlug={organizationSlug}
                  />
                </div>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link
                      href={buildWorkspaceAutomationWebChatHref({
                        organizationSlug,
                        automationId,
                        locale: intl.locale,
                      })}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                  disabled={automation.status !== "active"}
                >
                  <FormattedMessage {...automationDetailPageContentMessages.openChat} />
                </Button>
              </>
            ) : showRunButton || showSourceFileRunButton ? (
              <Button
                variant="outline"
                onClick={() => {
                  if (showSourceFileRunButton) {
                    setSourceFileDialogOpen(true);
                    return;
                  }
                  runMutation.mutate();
                }}
                disabled={
                  runMutation.isPending ||
                  sourceFileRunMutation.isPending ||
                  automation.status !== "active"
                }
              >
                {runMutation.isPending || sourceFileRunMutation.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon icon={PlayIcon} strokeWidth={1.8} data-icon="inline-start" />
                )}
                <FormattedMessage {...automationDetailPageContentMessages.runNow} />
              </Button>
            ) : null}
            <Button
              onClick={() => {
                if (deleteInFlight) {
                  return;
                }
                saveMutation.mutate();
              }}
              disabled={writeInFlight || !hasChanges}
            >
              {saveInFlight ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} data-icon="inline-start" />
              )}
              {saveInFlight ? (
                <FormattedMessage {...automationDetailPageContentMessages.saving} />
              ) : (
                <FormattedMessage {...automationDetailPageContentMessages.saveChanges} />
              )}
            </Button>
          </div>
        }
      />

      <Dialog
        open={sourceFileDialogOpen}
        onOpenChange={(open) => {
          if (sourceFileRunMutation.isPending) {
            return;
          }
          setSourceFileDialogOpen(open);
          if (!open) {
            setSelectedSourcePaths([]);
            setSourceFileSearch("");
          }
        }}
      >
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...automationDetailPageContentMessages.selectSourceFilesTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage
                {...automationDetailPageContentMessages.selectSourceFilesDescription}
              />
            </DialogDescription>
          </DialogHeader>
          <Input
            value={sourceFileSearch}
            onChange={(event) => setSourceFileSearch(event.target.value)}
            placeholder={intl.formatMessage(
              automationDetailPageContentMessages.searchSourceFilesPlaceholder,
            )}
            aria-label={intl.formatMessage(
              automationDetailPageContentMessages.searchSourceFilesLabel,
            )}
          />
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
            {sourceFilesQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
                <Spinner />
                <FormattedMessage {...automationDetailPageContentMessages.loadingSourceFiles} />
              </div>
            ) : sourceFilesQuery.isError ? (
              <p className="p-6 text-center text-sm text-destructive">
                <FormattedMessage {...automationDetailPageContentMessages.loadSourceFilesError} />
              </p>
            ) : visibleSourceFiles.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                <FormattedMessage {...automationDetailPageContentMessages.noSourceFiles} />
              </p>
            ) : (
              <div className="divide-y divide-border">
                {visibleSourceFiles.map((file) => {
                  const checked = selectedSourcePaths.includes(file.sourcePath);
                  return (
                    <label
                      key={file.sourcePath}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          setSelectedSourcePaths((current) =>
                            nextChecked
                              ? [...current, file.sourcePath]
                              : current.filter((sourcePath) => sourcePath !== file.sourcePath),
                          );
                        }}
                      />
                      <span className="min-w-0 truncate font-mono text-xs">{file.sourcePath}</span>
                    </label>
                  );
                })}
                {sourceFilesQuery.hasNextPage ? (
                  <div className="p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      disabled={sourceFilesQuery.isFetchingNextPage}
                      onClick={() => {
                        void sourceFilesQuery.fetchNextPage();
                      }}
                    >
                      {sourceFilesQuery.isFetchingNextPage ? (
                        <>
                          <Spinner data-icon="inline-start" />
                          <FormattedMessage
                            {...automationDetailPageContentMessages.loadingMoreSourceFiles}
                          />
                        </>
                      ) : (
                        <FormattedMessage
                          {...automationDetailPageContentMessages.loadMoreSourceFiles}
                        />
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSourceFileDialogOpen(false)}
              disabled={sourceFileRunMutation.isPending}
            >
              <FormattedMessage
                {...automationDetailPageContentMessages.cancelSourceFileSelection}
              />
            </Button>
            <Button
              onClick={() => sourceFileRunMutation.mutate(selectedSourcePaths)}
              disabled={selectedSourcePaths.length === 0 || sourceFileRunMutation.isPending}
            >
              {sourceFileRunMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={PlayIcon} strokeWidth={1.8} data-icon="inline-start" />
              )}
              <FormattedMessage
                {...automationDetailPageContentMessages.runSelectedSourceFiles}
                values={{ count: selectedSourcePaths.length }}
              />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleteInFlight) {
            return;
          }
          if (open && saveInFlight) {
            return;
          }
          setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...automationDetailPageContentMessages.deleteTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage(automationDetailPageContentMessages.deleteDescription, {
                automationName: automation.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteInFlight}>
              <FormattedMessage {...automationDetailPageContentMessages.deleteCancel} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={writeInFlight}
              onClick={() => {
                if (saveInFlight) {
                  return;
                }
                deleteMutation.mutate();
              }}
            >
              {deleteInFlight ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
              )}
              {deleteInFlight ? (
                <FormattedMessage {...automationDetailPageContentMessages.deleting} />
              ) : (
                <FormattedMessage {...automationDetailPageContentMessages.deleteConfirm} />
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="pt-4">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/org/${organizationSlug}/automations`} />}
        >
          <FormattedMessage {...automationDetailPageContentMessages.backToAutomations} />
        </Button>
      </div>
    </WorkspacePageShell>
  );
}
