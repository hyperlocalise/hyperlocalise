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
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import {
  ArrowCounterClockwiseIcon,
  TrashIcon,
  PlayIcon,
  FloppyDiskIcon,
} from "@phosphor-icons/react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
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
import { useAppShellBreadcrumbAppend } from "@/components/app-shell/store/use-app-shell-breadcrumb";
import { apiClient } from "@/lib/api-client-instance";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { queueIntercomPushRun } from "@/lib/intercom/queue-intercom-push-run";
import { intercomPushUiMessages } from "@/lib/intercom/intercom-push-ui.messages";
import {
  buildAutomationsDetailHref,
  parseWorkspaceAutomationEditorTab,
} from "@/lib/navigation/workspace-automation-editor-tab";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { readApiResponseError } from "@/lib/api-error";
import {
  describeWorkspaceAutomationDiscard,
  describeWorkspaceAutomationReload,
  workspaceAutomationUndoStackOptions,
  type WorkspaceAutomationFormChange,
} from "@/lib/agents/workspace-automation-undo";
import { buildWorkspaceAutomationWebChatHref } from "@/lib/agents/workspace-automation-web-chat-url";
import {
  createWorkspaceAutomationFormStateFromRecord,
  formStateToWorkspaceAutomationPayload,
  mapWorkspaceAutomationApiErrorToFieldErrors,
  validateWorkspaceAutomationFormState,
  workspaceAutomationFormHasChanges,
  workspaceAutomationFormSupportsOnDemandRun,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";
import { useUndoShortcuts } from "@/lib/undo-stack/use-undo-shortcuts";
import { useUndoStack } from "@/lib/undo-stack/use-undo-stack";
import { useUnsavedChangesLeaveGuard } from "../../_components/unsaved-changes-leave-guard";
import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { automationDetailPageContentMessages } from "./automation-detail-page-content.messages";
import { AutomationUndoRedoButtons, useAutomationUndoNotice } from "./automation-undo-controls";
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

function uniqueSourceFilesByPath(files: ReadonlyArray<{ sourcePath: string }>) {
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
  const router = useOrgRouter();
  const searchParams = useSearchParams();
  const initialEditorTab = parseWorkspaceAutomationEditorTab(searchParams.get("tab")) ?? undefined;
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
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
  const intercomPush = automationQuery.data?.intercomPush ?? null;
  const automationTitle = automation?.name.trim();

  useAppShellBreadcrumbAppend({
    id: "automation-detail",
    label: automationTitle,
    title: automationTitle,
    isLoading: automationQuery.isLoading && !automationTitle,
  });
  const history = useUndoStack<
    WorkspaceAutomationFormState | null,
    WorkspaceAutomationFormChange | null
  >(null, workspaceAutomationUndoStackOptions);
  const form = history.form;
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const { notifyUndo, notifyRedo } = useAutomationUndoNotice();
  // The notice's action runs after later renders, so it reads the history as it is then.
  const historyRef = useRef(history);
  historyRef.current = history;
  // The saved configuration the form was last brought in line with, and the automation it was.
  const previousSavedRef = useRef<{
    automationId: string;
    saved: WorkspaceAutomationFormState;
  } | null>(null);
  // What the latest save stored, so its own refetch is not taken for a change made elsewhere.
  const submittedFormRef = useRef<WorkspaceAutomationFormState | null>(null);

  const runRedo = () => {
    const step = historyRef.current.redoStep;
    if (!step) {
      return;
    }
    historyRef.current.redo();
    setErrors({});
    notifyRedo(step, runUndo);
  };
  const runUndo = () => {
    const step = historyRef.current.undoStep;
    if (!step) {
      return;
    }
    historyRef.current.undo();
    setErrors({});
    notifyUndo(step, runRedo);
  };
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [runPromptOpen, setRunPromptOpen] = useState(false);
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
      try {
        const body = await goSvcClient.project.files(organizationSlug, projectId, {
          limit: AUTOMATION_SOURCE_FILES_PAGE_SIZE,
          offset: pageParam,
          origin: "repository",
          ...(debouncedSourceFileSearch ? { search: debouncedSourceFileSearch } : {}),
        });
        return uniqueSourceFilesByPath(
          body.files.map((file) => ({ sourcePath: file.sourcePath })),
        ).toSorted((left, right) => left.sourcePath.localeCompare(right.sourcePath));
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to load source files"), { cause: error });
      }
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

  // Brings the form in line with the record when the saved configuration itself changes. A run
  // changes only the record's last-run fields, which the form does not hold, so edits survive it.
  const syncFormWithRecord = useEffectEvent((record: NonNullable<typeof automation>) => {
    const saved = createWorkspaceAutomationFormStateFromRecord(record);
    const previous = previousSavedRef.current;
    previousSavedRef.current = { automationId, saved };
    if (!previous || previous.automationId !== automationId) {
      history.reset(saved);
      return;
    }
    if (!workspaceAutomationFormHasChanges(previous.saved, saved)) {
      return;
    }
    const submitted = submittedFormRef.current;
    if (submitted && !workspaceAutomationFormHasChanges(submitted, saved)) {
      // This page's own save came back; edits made while it was on its way are kept.
      submittedFormRef.current = null;
      return;
    }
    const current = history.form;
    // With nothing unsaved the form simply follows the record, and no step is made.
    if (!current || !workspaceAutomationFormHasChanges(current, previous.saved)) {
      history.replace(saved);
      return;
    }
    // Someone else saved over unsaved edits; the edits are one undo away.
    history.change(saved, {
      origin: "system",
      description: describeWorkspaceAutomationReload(current, saved),
    });
  });
  useEffect(() => {
    if (automation) {
      syncFormWithRecord(automation);
    }
  }, [automation]);
  useEffect(
    () => () => {
      // Another automation's page starts with an empty history.
      previousSavedRef.current = null;
      submittedFormRef.current = null;
      historyRef.current.reset(null);
    },
    [automationId],
  );

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
    onSuccess: (saved) => {
      // The server trims and fills in fields, so the record it returns is what the refetch brings.
      submittedFormRef.current = createWorkspaceAutomationFormStateFromRecord(saved.automation);
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

  const navigateToIntercomPushRunHistory = () => {
    router.push(
      buildAutomationsDetailHref(organizationSlug, {
        automationId,
        projectId,
        tab: "history",
      }),
    );
  };

  const pushApprovedMutation = useMutation({
    mutationFn: async () => {
      if (!automation) {
        throw new Error("missing_automation");
      }
      return queueIntercomPushRun({ organizationSlug, automationId });
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(intercomPushUiMessages.pushQueued));
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automation", organizationSlug, automationId],
      });
      navigateToIntercomPushRunHistory();
    },
    onError: () => {
      toast.error(intl.formatMessage(intercomPushUiMessages.pushFailed));
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
      leaveTo(automationsBasePath);
    },
    onError: (error) => {
      if (error.message === "save_in_progress") {
        return;
      }
      toast.error(intl.formatMessage(automationDetailPageContentMessages.deleteError));
    },
  });

  // Read before the loading return, because a hook cannot come after it.
  const hasUnsavedChanges =
    form !== null &&
    automation !== undefined &&
    automation !== null &&
    workspaceAutomationFormHasChanges(
      form,
      createWorkspaceAutomationFormStateFromRecord(automation),
    );
  const { leaveGuardDialog, leaveTo } = useUnsavedChangesLeaveGuard(hasUnsavedChanges);
  const { rootRef } = useUndoShortcuts({
    enabled: !(saveMutation.isPending || deleteMutation.isPending),
    onUndo: runUndo,
    onRedo: runRedo,
    onSeal: history.seal,
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
  const isContentSync = form.kind === "content_sync";
  const showRunButton =
    isContentSync ||
    (workspaceAutomationFormSupportsOnDemandRun(form.triggerMode) &&
      workspaceAutomationFormSupportsOnDemandRun(savedForm.triggerMode));
  const showSourceFileRunButton =
    form.triggerMode === "source_upload" && savedForm.triggerMode === "source_upload";
  const showIntercomPushButton =
    form.intercomEnabled &&
    !hasChanges &&
    (intercomPush?.eligibleLocaleCount ?? 0) > 0 &&
    !intercomPush?.pushRunInProgress;
  const saveInFlight = saveMutation.isPending;
  const deleteInFlight = deleteMutation.isPending;
  const writeInFlight = saveInFlight || deleteInFlight;

  const discardChanges = () => {
    history.change(savedForm, { description: describeWorkspaceAutomationDiscard(form, savedForm) });
    setErrors({});
  };

  const startRun = () => {
    if (showSourceFileRunButton) {
      setSourceFileDialogOpen(true);
      return;
    }
    runMutation.mutate();
  };

  const editorActions = (
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
        <TrashIcon data-icon="inline-start" />
        <FormattedMessage {...automationDetailPageContentMessages.deleteAutomation} />
      </Button>
      {form.triggerMode === "web_chat" ? (
        <>
          <div className="hidden min-w-0 max-w-xs md:block">
            <WebChatUrlCopyField automationId={automationId} organizationSlug={organizationSlug} />
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
      ) : showRunButton || showSourceFileRunButton || showIntercomPushButton ? (
        <>
          {showIntercomPushButton ? (
            <Button
              variant="outline"
              onClick={() => pushApprovedMutation.mutate()}
              disabled={
                pushApprovedMutation.isPending ||
                intercomPush?.pushRunInProgress ||
                automation.status !== "active"
              }
            >
              {pushApprovedMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              <FormattedMessage {...intercomPushUiMessages.pushButton} />
            </Button>
          ) : null}
          {showRunButton || showSourceFileRunButton ? (
            <Button
              variant="outline"
              onClick={() => {
                // A run uses the saved automation, so unsaved changes are settled first.
                if (hasChanges) {
                  setRunPromptOpen(true);
                  return;
                }
                startRun();
              }}
              disabled={
                runMutation.isPending ||
                sourceFileRunMutation.isPending ||
                writeInFlight ||
                automation.status !== "active"
              }
            >
              {runMutation.isPending || sourceFileRunMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlayIcon data-icon="inline-start" />
              )}
              <FormattedMessage {...automationDetailPageContentMessages.runNow} />
            </Button>
          ) : null}
        </>
      ) : null}
      <AutomationUndoRedoButtons
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        undoStep={history.undoStep}
        redoStep={history.redoStep}
        disabled={writeInFlight}
        onUndo={runUndo}
        onRedo={runRedo}
      />
      <Button
        variant="outline"
        onClick={() => setDiscardDialogOpen(true)}
        disabled={writeInFlight || !hasChanges}
      >
        <ArrowCounterClockwiseIcon data-icon="inline-start" />
        <FormattedMessage {...automationDetailPageContentMessages.discardChanges} />
      </Button>
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
          <FloppyDiskIcon data-icon="inline-start" />
        )}
        {saveInFlight ? (
          <FormattedMessage {...automationDetailPageContentMessages.saving} />
        ) : (
          <FormattedMessage {...automationDetailPageContentMessages.saveChanges} />
        )}
      </Button>
    </div>
  );

  return (
    <WorkspacePageShell ref={rootRef} className="max-w-5xl" data-undo-root="automation">
      <WorkspaceAutomationEditor
        mode="detail"
        organizationSlug={organizationSlug}
        automationId={automationId}
        form={form}
        errors={errors}
        knowledgeAvailable={knowledgeAvailable}
        canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
        onChange={history.change}
        runHistory={recentRuns}
        initialEditorTab={initialEditorTab}
        actions={editorActions}
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
                <PlayIcon data-icon="inline-start" />
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
              {deleteInFlight ? <Spinner /> : <TrashIcon />}
              {deleteInFlight ? (
                <FormattedMessage {...automationDetailPageContentMessages.deleting} />
              ) : (
                <FormattedMessage {...automationDetailPageContentMessages.deleteConfirm} />
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={runPromptOpen} onOpenChange={setRunPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...automationDetailPageContentMessages.runUnsavedTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...automationDetailPageContentMessages.runUnsavedDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <FormattedMessage {...automationDetailPageContentMessages.runUnsavedCancel} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setRunPromptOpen(false);
                discardChanges();
                startRun();
              }}
            >
              <FormattedMessage {...automationDetailPageContentMessages.discardAndRun} />
            </Button>
            <Button
              onClick={() => {
                setRunPromptOpen(false);
                // The run is queued only once the save has gone through.
                saveMutation.mutate(undefined, { onSuccess: startRun });
              }}
            >
              <FormattedMessage {...automationDetailPageContentMessages.saveAndRun} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...automationDetailPageContentMessages.discardTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...automationDetailPageContentMessages.discardDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <FormattedMessage {...automationDetailPageContentMessages.discardCancel} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                discardChanges();
                setDiscardDialogOpen(false);
              }}
            >
              <FormattedMessage {...automationDetailPageContentMessages.discardConfirm} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="pt-4">
        <Button
          variant="outline"
          nativeButton={false}
          render={<OrgNavLink href={`/org/${organizationSlug}/automations`} />}
        >
          <FormattedMessage {...automationDetailPageContentMessages.backToAutomations} />
        </Button>
      </div>
      {leaveGuardDialog}
    </WorkspacePageShell>
  );
}
