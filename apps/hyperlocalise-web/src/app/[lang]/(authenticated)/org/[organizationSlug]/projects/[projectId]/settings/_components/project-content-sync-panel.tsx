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
import { ArrowsClockwiseIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { FormattedMessage, type IntlShape, useIntl } from "react-intl";
import { toast } from "sonner";

import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { defaultContentSyncProjectFolder } from "@/lib/agents/content-sync/content-sync-types";
import { apiClient } from "@/lib/api-client-instance";
import { sanitizeExternalUrl } from "@/lib/security/safe-external-url";

import { projectContentSyncPanelMessages as messages } from "./project-content-sync-panel.messages";
import { ProjectSettingsSectionHeading } from "./project-settings-section-heading";

const RUNNING_POLL_MS = 5000;
// Picks up runs the schedule starts while the page is open.
const SCHEDULED_POLL_MS = 60_000;

type SyncSchedule = "manual" | "hourly" | "daily";

type SyncDraft = {
  connectionId: string;
  resourceKey: string;
  providerFolder: string;
  projectFolder: string;
  schedule: SyncSchedule;
};

const scheduleMessages = {
  manual: messages.scheduleManual,
  hourly: messages.scheduleHourly,
  daily: messages.scheduleDaily,
} as const satisfies Record<SyncSchedule, typeof messages.scheduleManual>;

const SCHEDULES: SyncSchedule[] = ["manual", "hourly", "daily"];

const EMPTY_DRAFT: SyncDraft = {
  connectionId: "",
  resourceKey: "",
  providerFolder: "",
  projectFolder: "",
  schedule: "manual",
};

type PanelMessage = typeof messages.saveError;

/** Messages for the error codes a save or Sync now can answer with. */
const requestErrorMessages: Record<string, PanelMessage> = {
  invalid_content_sync_payload: messages.errorFieldsRequired,
  content_sync_config_required: messages.errorFieldsRequired,
  content_sync_provider_folder_required: messages.errorFieldsRequired,
  content_sync_folder_invalid: messages.errorFolderUnsafe,
  content_sync_connection_required: messages.errorRepositoryNotEnabled,
  content_sync_automation_overlap: messages.errorAutomationOverlap,
  content_sync_in_progress: messages.syncInProgress,
};

/** Messages for the error codes a finished run records; others show the stored text. */
const runErrorMessages: Record<string, PanelMessage> = {
  content_sync_connection_required: messages.errorRepositoryNotEnabled,
  content_sync_folder_invalid: messages.runFolderMissing,
  content_sync_pull_failed: messages.runPullFailed,
  content_sync_stale: messages.runStale,
  content_sync_failed: messages.runUnexpected,
  content_sync_enqueue_failed: messages.runUnexpected,
};

async function readApiError(response: Response, fallback: string, intl: IntlShape) {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    const known = requestErrorMessages[body.error];
    if (known) {
      return intl.formatMessage(known);
    }
  }
  return fallback;
}

function contentSyncRoute() {
  return apiClient.api.orgs[":organizationSlug"].projects[":projectId"]["content-sync"];
}

export function projectContentSyncQueryKey(organizationSlug: string, projectId: string) {
  return ["project-content-sync", organizationSlug, projectId];
}

function draftsEqual(a: SyncDraft, b: SyncDraft) {
  return (
    a.connectionId === b.connectionId &&
    a.providerFolder.trim() === b.providerFolder.trim() &&
    a.projectFolder.trim() === b.projectFolder.trim() &&
    a.schedule === b.schedule
  );
}

function defaultProjectFolderFor(resourceKey: string) {
  return defaultContentSyncProjectFolder({ provider: "github", resourceKey });
}

export function ProjectContentSyncPanel({
  organizationSlug,
  projectId,
  canManage,
  onDirtyChange,
}: {
  organizationSlug: string;
  projectId: string;
  canManage: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const queryKey = projectContentSyncQueryKey(organizationSlug, projectId);
  const param = { organizationSlug, projectId };
  const [edits, setEdits] = useState<SyncDraft | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const syncQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await contentSyncRoute().$get({ param });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadError));
      }
      return (await response.json()).contentSync;
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.runs[0]?.status === "running") {
        return RUNNING_POLL_MS;
      }
      return data?.sync && data.sync.schedule !== "manual" ? SCHEDULED_POLL_MS : false;
    },
    refetchOnWindowFocus: true,
  });

  const connectionsQuery = useQuery({
    queryKey: [...queryKey, "connections"],
    enabled: canManage,
    queryFn: async () => {
      const response = await contentSyncRoute().connections.$get({ param });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadConnectionsError));
      }
      return (await response.json()).connections;
    },
  });

  const saved = syncQuery.data?.sync ?? null;
  const savedDraft: SyncDraft | null = saved?.syncConfig
    ? {
        connectionId: saved.syncConfig.connectionId,
        resourceKey: saved.syncConfig.resourceKey,
        providerFolder: saved.syncConfig.providerFolder,
        projectFolder: saved.syncConfig.projectFolder,
        schedule: saved.schedule,
      }
    : null;
  const connections = connectionsQuery.data ?? [];
  const values: SyncDraft = edits ?? savedDraft ?? EMPTY_DRAFT;
  const dirty = edits !== null && !draftsEqual(edits, savedDraft ?? EMPTY_DRAFT);
  const complete =
    Boolean(values.connectionId) &&
    values.providerFolder.trim().length > 0 &&
    values.projectFolder.trim().length > 0;
  const runs = syncQuery.data?.runs ?? [];
  const running = runs[0]?.status === "running";

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const saveMutation = useMutation({
    mutationFn: async (draft: SyncDraft) => {
      const response = await contentSyncRoute().$put({
        param,
        json: {
          schedule: draft.schedule,
          syncConfig: {
            provider: "github",
            connectionId: draft.connectionId,
            resourceKey: draft.resourceKey,
            providerFolder: draft.providerFolder.trim(),
            projectFolder: draft.projectFolder.trim(),
            pathTemplate: saved?.syncConfig?.pathTemplate,
            localeCodeMap: saved?.syncConfig?.localeCodeMap,
          },
        },
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.saveError), intl));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setEdits(null);
      toast.success(intl.formatMessage(messages.saved));
    },
    onError: (error) => toast.error(error.message),
  });

  const syncNowMutation = useMutation({
    mutationFn: async () => {
      const response = await contentSyncRoute().runs.$post({ param });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.syncStartError), intl),
        );
      }
    },
    onSuccess: () => toast.success(intl.formatMessage(messages.syncStarted)),
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const response = await contentSyncRoute().$delete({ param });
      if (!response.ok && response.status !== 404) {
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.removeError), intl),
        );
      }
    },
    onSuccess: async () => {
      setConfirmRemove(false);
      setEdits(null);
      await queryClient.invalidateQueries({ queryKey });
      toast.success(intl.formatMessage(messages.removed));
    },
    onError: (error) => toast.error(error.message),
  });

  function update(patch: Partial<SyncDraft>) {
    setEdits({ ...values, ...patch });
  }

  function chooseRepository(connectionId: string) {
    const connection = connections.find((entry) => entry.connectionId === connectionId);
    if (!connection) {
      return;
    }
    const folder = values.projectFolder.trim();
    // Follow the repository while the folder is still the previous repository's default.
    const keepsFolder =
      folder.length > 0 &&
      !(values.resourceKey && folder === defaultProjectFolderFor(values.resourceKey));
    update({
      connectionId: connection.connectionId,
      resourceKey: connection.resourceKey,
      projectFolder: keepsFolder
        ? values.projectFolder
        : defaultProjectFolderFor(connection.resourceKey),
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !dirty || !complete || saveMutation.isPending) {
      return;
    }
    saveMutation.mutate(values);
  }

  if (syncQuery.isLoading) {
    return (
      <section className="rounded-lg border border-border bg-muted p-4">
        <Spinner />
      </section>
    );
  }

  if (syncQuery.isError && !syncQuery.data) {
    return (
      <section className="rounded-lg border border-border bg-muted p-4">
        <TypographyP className="text-flame-100" size="small">
          {syncQuery.error.message}
        </TypographyP>
      </section>
    );
  }

  const busy = saveMutation.isPending || removeMutation.isPending;
  const repositoryNotEnabled =
    canManage &&
    connectionsQuery.isSuccess &&
    Boolean(values.connectionId) &&
    !connections.some((connection) => connection.connectionId === values.connectionId);
  const fieldsDisabled = !canManage || busy;
  const repositoryItems = connections.map((connection) => ({
    value: connection.connectionId,
    label: connection.resourceKey,
  }));
  // A saved repository that is no longer enabled still shows by name.
  if (values.connectionId && !repositoryItems.some((item) => item.value === values.connectionId)) {
    repositoryItems.unshift({ value: values.connectionId, label: values.resourceKey });
  }
  const showNoRepositories =
    canManage && connectionsQuery.isSuccess && connections.length === 0 && !saved;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <ProjectSettingsSectionHeading
            icon={ArrowsClockwiseIcon}
            tone="beam"
            title={<FormattedMessage {...messages.title} />}
            description={<FormattedMessage {...messages.description} />}
            actions={
              saved && canManage ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    running || dirty || repositoryNotEnabled || syncNowMutation.isPending || busy
                  }
                  onClick={() => syncNowMutation.mutate()}
                >
                  {running || syncNowMutation.isPending ? (
                    <Spinner />
                  ) : (
                    <ArrowsClockwiseIcon className="size-4" />
                  )}
                  <FormattedMessage {...messages.syncNow} />
                </Button>
              ) : null
            }
          />

          {!canManage ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...(saved ? messages.readOnly : messages.notSetUp)} />
            </TypographyP>
          ) : null}
          {saved && canManage && running ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.syncRunning} />
            </TypographyP>
          ) : null}
          {saved && canManage && dirty && !running ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.saveBeforeSync} />
            </TypographyP>
          ) : null}

          {!canManage && !saved ? null : showNoRepositories ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...messages.noRepositories} />
              </TypographyP>
              <Button
                type="button"
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<OrgNavLink href={`/org/${organizationSlug}/integrations`} />}
              >
                <FormattedMessage {...messages.openIntegrations} />
              </Button>
            </div>
          ) : (
            <>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="project-sync-repository">
                  <FormattedMessage {...messages.repositoryLabel} />
                </FieldLabel>
                <Select
                  value={values.connectionId || null}
                  items={repositoryItems}
                  disabled={fieldsDisabled}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      chooseRepository(value);
                    }
                  }}
                >
                  <SelectTrigger id="project-sync-repository" className="w-full md:w-[360px]">
                    <SelectValue placeholder={intl.formatMessage(messages.repositoryPlaceholder)} />
                  </SelectTrigger>
                  <SelectContent>
                    {repositoryItems.map((item) => (
                      <SelectItem key={item.value} value={item.value} label={item.label}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {repositoryNotEnabled ? (
                  <FieldDescription className="text-flame-100">
                    <FormattedMessage {...messages.errorRepositoryNotEnabled} />
                  </FieldDescription>
                ) : null}
                {connectionsQuery.isError ? (
                  <FieldDescription className="text-flame-100">
                    <FormattedMessage {...messages.loadConnectionsError} />
                  </FieldDescription>
                ) : null}
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="project-sync-provider-folder">
                  <FormattedMessage {...messages.providerFolderLabel} />
                </FieldLabel>
                <Input
                  id="project-sync-provider-folder"
                  value={values.providerFolder}
                  placeholder={intl.formatMessage(messages.providerFolderPlaceholder)}
                  disabled={fieldsDisabled}
                  className="font-mono"
                  onChange={(event) => update({ providerFolder: event.target.value })}
                />
                <FieldDescription>
                  <FormattedMessage {...messages.providerFolderHelp} />
                </FieldDescription>
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="project-sync-project-folder">
                  <FormattedMessage {...messages.projectFolderLabel} />
                </FieldLabel>
                <Input
                  id="project-sync-project-folder"
                  value={values.projectFolder}
                  disabled={fieldsDisabled}
                  className="font-mono"
                  onChange={(event) => update({ projectFolder: event.target.value })}
                />
                <FieldDescription>
                  <FormattedMessage {...messages.projectFolderHelp} />
                </FieldDescription>
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="project-sync-schedule">
                  <FormattedMessage {...messages.scheduleLabel} />
                </FieldLabel>
                <Select
                  value={values.schedule}
                  items={SCHEDULES.map((schedule) => ({
                    value: schedule,
                    label: intl.formatMessage(scheduleMessages[schedule]),
                  }))}
                  disabled={fieldsDisabled}
                  onValueChange={(value) => {
                    const schedule = SCHEDULES.find((entry) => entry === value);
                    if (schedule) {
                      update({ schedule });
                    }
                  }}
                >
                  <SelectTrigger id="project-sync-schedule" className="w-full md:w-[360px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULES.map((schedule) => (
                      <SelectItem
                        key={schedule}
                        value={schedule}
                        label={intl.formatMessage(scheduleMessages[schedule])}
                      >
                        <FormattedMessage {...scheduleMessages[schedule]} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {saved?.nextRunAt && !dirty ? (
                  <FieldDescription>
                    <FormattedMessage
                      {...messages.nextRun}
                      values={{
                        time: intl.formatDate(saved.nextRunAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      }}
                    />
                  </FieldDescription>
                ) : null}
              </Field>
              {canManage ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  {saved ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || running}
                      onClick={() => setConfirmRemove(true)}
                    >
                      <FormattedMessage {...messages.remove} />
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button type="submit" size="sm" disabled={!dirty || !complete || busy}>
                    {saveMutation.isPending ? <Spinner /> : <FloppyDiskIcon className="size-4" />}
                    <FormattedMessage
                      {...(saveMutation.isPending ? messages.saving : messages.save)}
                    />
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </form>
      </section>

      {saved ? <ProjectContentSyncRuns runs={runs} /> : null}

      <AlertDialog
        open={confirmRemove}
        onOpenChange={(open) => {
          if (!open && !removeMutation.isPending) setConfirmRemove(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.removeTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.removeDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>
              <FormattedMessage {...messages.removeCancel} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate()}
            >
              {removeMutation.isPending ? <Spinner /> : null}
              <FormattedMessage {...messages.removeConfirm} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type SyncRun = {
  id: string;
  trigger: "manual" | "scheduled";
  status: "running" | "succeeded" | "failed";
  pulled: { uploaded: number; skipped: number; failed: number } | null;
  written: number | null;
  pullRequestUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
};

const runStatusMessages = {
  running: messages.runRunning,
  succeeded: messages.runSucceeded,
  failed: messages.runFailed,
} as const;

const runStatusBadges = {
  running: "secondary",
  succeeded: "success",
  failed: "destructive",
} as const;

function ProjectContentSyncRuns({ runs }: { runs: SyncRun[] }) {
  const intl = useIntl();

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-muted p-4">
      <TypographyP size="small" weight="medium">
        <FormattedMessage {...messages.runsTitle} />
      </TypographyP>
      {runs.length === 0 ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.noRuns} />
        </TypographyP>
      ) : (
        <ul className="grid gap-2">
          {runs.map((run) => {
            const pullRequestUrl = sanitizeExternalUrl(run.pullRequestUrl);
            return (
              <li
                key={run.id}
                className="grid gap-1 rounded-md border border-border bg-background p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={runStatusBadges[run.status]}>
                    <FormattedMessage {...runStatusMessages[run.status]} />
                  </Badge>
                  <TypographyP size="small">
                    {intl.formatDate(run.startedAt, { dateStyle: "medium", timeStyle: "short" })}
                  </TypographyP>
                  <TypographyP size="xsmall" tone="subtle">
                    <FormattedMessage
                      {...(run.trigger === "scheduled"
                        ? messages.runScheduled
                        : messages.runManual)}
                    />
                  </TypographyP>
                </div>
                {run.status === "succeeded" && run.pulled ? (
                  <TypographyP size="small" tone="subtle">
                    <FormattedMessage
                      {...messages.runPulled}
                      values={{ uploaded: run.pulled.uploaded, skipped: run.pulled.skipped }}
                    />
                  </TypographyP>
                ) : null}
                {run.status === "succeeded" && run.written !== null ? (
                  <TypographyP size="small" tone="subtle">
                    <FormattedMessage {...messages.runWritten} values={{ written: run.written }} />
                  </TypographyP>
                ) : null}
                {run.status === "failed" ? (
                  <TypographyP className="text-flame-100" size="small">
                    <RunError run={run} />
                  </TypographyP>
                ) : null}
                {pullRequestUrl ? (
                  <a
                    href={pullRequestUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    <FormattedMessage {...messages.openPullRequest} />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RunError({ run }: { run: Pick<SyncRun, "errorCode" | "errorMessage"> }) {
  const known = run.errorCode ? runErrorMessages[run.errorCode] : undefined;
  if (known) {
    return <FormattedMessage {...known} />;
  }
  return run.errorMessage ?? <FormattedMessage {...messages.runUnexpected} />;
}
