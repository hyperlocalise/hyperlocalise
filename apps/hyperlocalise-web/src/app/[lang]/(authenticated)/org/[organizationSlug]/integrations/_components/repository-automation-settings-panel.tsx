"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import {
  addBranchPattern,
  AUTOMATION_WEEKDAY_OPTIONS,
  createAutomationFormStateFromSettings,
  type GithubRepositoryAutomationFieldErrors,
  type GithubRepositoryAutomationFormState,
  formStateToAutomationSettingsPayload,
  formatAutomationNextRunAt,
  hasAnyAutomationWorkflowEnabled,
  mapAutomationApiErrorToFieldErrors,
  validateAutomationFormState,
} from "./github-repository-automation-view-model";
import { AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE } from "./github-repository-automation-view-model.messages";
import { repositoryAutomationSettingsPanelMessages } from "./repository-automation-settings-panel.messages";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { createApiClient } from "@/lib/api-client";
import type { GithubRepositoryAutomationSettings } from "@/lib/agents/github/github-repository-automation-settings";
import { cn } from "@/lib/primitives/cn";

const api = createApiClient();

type ProjectOption = {
  id: string;
  name: string;
};

type GithubRepositoryAutomationRecord = {
  githubRepositoryId: string;
  settings: GithubRepositoryAutomationSettings;
  configVersion: number;
  nextRunAt: string | null;
};

type RepositoryAutomationSettingsPanelProps = {
  organizationSlug: string;
  githubRepositoryId: string;
  repositoryFullName: string;
  repositoryEnabled: boolean;
  repositoryArchived: boolean;
  userCanManage: boolean;
  showFullPageLink?: boolean;
  onSaved?: () => void;
};

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function ProjectSelectField({
  id,
  label,
  description,
  placeholder,
  value,
  projects,
  disabled,
  error,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  placeholder: string;
  value: string;
  projects: ProjectOption[];
  disabled: boolean;
  error?: string;
  onChange: (projectId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <Select
        value={value || undefined}
        onValueChange={(nextValue) => {
          if (nextValue) {
            onChange(nextValue);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  );
}

export function RepositoryAutomationSettingsPanel({
  organizationSlug,
  githubRepositoryId,
  repositoryFullName,
  repositoryEnabled,
  repositoryArchived,
  userCanManage,
  showFullPageLink = false,
  onSaved,
}: RepositoryAutomationSettingsPanelProps) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<GithubRepositoryAutomationFormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<GithubRepositoryAutomationFieldErrors>({});
  const [branchInput, setBranchInput] = useState("");
  const [branchInputError, setBranchInputError] = useState<string | undefined>();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [metadata, setMetadata] = useState<{ configVersion: number; nextRunAt: string | null }>({
    configVersion: 0,
    nextRunAt: null,
  });

  const automationPath = `/org/${organizationSlug}/integrations/github/repositories/${githubRepositoryId}/automation`;

  const settingsQuery = useQuery({
    queryKey: ["github-repository-automation-settings", organizationSlug, githubRepositoryId],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["github-installation"].repositories[
        ":githubRepositoryId"
      ]["automation-settings"].$get({
        param: { organizationSlug, githubRepositoryId },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "load_failed" }));
        throw new Error(
          "error" in error
            ? String(error.error)
            : intl.formatMessage(repositoryAutomationSettingsPanelMessages.loadSettingsFailed),
        );
      }

      const data = await res.json();
      return data.githubRepositoryAutomationSettings as GithubRepositoryAutomationRecord;
    },
    enabled: userCanManage && repositoryEnabled && !repositoryArchived,
  });

  const projectsQuery = useQuery({
    queryKey: ["org-projects", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (res.status !== 200) {
        throw new Error(
          intl.formatMessage(repositoryAutomationSettingsPanelMessages.loadProjectsFailed),
        );
      }

      const data = await res.json();
      return data.projects.map((project) => ({
        id: project.id,
        name: project.name,
      }));
    },
    enabled: userCanManage,
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setMetadata({
      configVersion: settingsQuery.data.configVersion,
      nextRunAt: settingsQuery.data.nextRunAt,
    });
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!settingsQuery.data || form !== null) {
      return;
    }

    setForm(createAutomationFormStateFromSettings(settingsQuery.data.settings));
    setFieldErrors({});
    setBranchInput("");
    setBranchInputError(undefined);
  }, [settingsQuery.data, form]);

  const saveSettings = useMutation({
    mutationFn: async (nextForm: GithubRepositoryAutomationFormState) => {
      const res = await api.api.orgs[":organizationSlug"]["github-installation"].repositories[
        ":githubRepositoryId"
      ]["automation-settings"].$put({
        param: { organizationSlug, githubRepositoryId },
        json: {
          settings: formStateToAutomationSettingsPayload(nextForm),
        },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "save_failed" }));
        const code = "error" in error ? String(error.error) : "save_failed";
        const message =
          "message" in error && typeof error.message === "string" ? error.message : undefined;
        return { ok: false as const, code, message };
      }

      const data = await res.json();
      return {
        ok: true as const,
        record: data.githubRepositoryAutomationSettings as GithubRepositoryAutomationRecord,
      };
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setFieldErrors(mapAutomationApiErrorToFieldErrors(intl, result.code, result.message));
        toast.error(
          result.message ??
            intl.formatMessage(repositoryAutomationSettingsPanelMessages.saveFailedToast),
        );
        return;
      }

      setForm(createAutomationFormStateFromSettings(result.record.settings));
      setMetadata({
        configVersion: result.record.configVersion,
        nextRunAt: result.record.nextRunAt,
      });
      setFieldErrors({});
      queryClient.setQueryData(
        ["github-repository-automation-settings", organizationSlug, githubRepositoryId],
        result.record,
      );
      toast.success(intl.formatMessage(repositoryAutomationSettingsPanelMessages.saveSuccessToast));
      onSaved?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetSettings = useMutation({
    mutationFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["github-installation"].repositories[
        ":githubRepositoryId"
      ]["automation-settings"].$delete({
        param: { organizationSlug, githubRepositoryId },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "reset_failed" }));
        throw new Error(
          "error" in error
            ? String(error.error)
            : intl.formatMessage(repositoryAutomationSettingsPanelMessages.resetFailed),
        );
      }

      const data = await res.json();
      return data.githubRepositoryAutomationSettings as GithubRepositoryAutomationRecord;
    },
    onSuccess: (record) => {
      setForm(createAutomationFormStateFromSettings(record.settings));
      setMetadata({
        configVersion: record.configVersion,
        nextRunAt: record.nextRunAt,
      });
      setFieldErrors({});
      setResetDialogOpen(false);
      queryClient.setQueryData(
        ["github-repository-automation-settings", organizationSlug, githubRepositoryId],
        record,
      );
      toast.success(
        intl.formatMessage(repositoryAutomationSettingsPanelMessages.resetSuccessToast),
      );
      onSaved?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const projects = projectsQuery.data ?? [];
  const readOnly = !userCanManage;
  const formDisabled =
    readOnly || !repositoryEnabled || repositoryArchived || saveSettings.isPending;
  const workflowsEnabled = form ? hasAnyAutomationWorkflowEnabled(form) : false;
  const formattedNextRun = formatAutomationNextRunAt(metadata.nextRunAt);

  const triggerChoices = useMemo(
    () => [
      {
        value: "none",
        label: intl.formatMessage(repositoryAutomationSettingsPanelMessages.triggerOff),
      },
      {
        value: "push",
        label: intl.formatMessage(repositoryAutomationSettingsPanelMessages.triggerOnPush),
      },
      {
        value: "scheduled",
        label: intl.formatMessage(repositoryAutomationSettingsPanelMessages.triggerScheduled),
      },
    ],
    [intl],
  );

  function updateForm(patch: Partial<GithubRepositoryAutomationFormState>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setFieldErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) {
        delete next[key as keyof GithubRepositoryAutomationFieldErrors];
      }
      return next;
    });
  }

  function handleSave() {
    if (!form) {
      return;
    }

    const errors = validateAutomationFormState(intl, form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    saveSettings.mutate(form);
  }

  function handleAddBranchPattern() {
    if (!form) {
      return;
    }

    const result = addBranchPattern(intl, form.pushBranches, branchInput);
    if (result.error) {
      setBranchInputError(result.error);
      return;
    }

    updateForm({ pushBranches: result.branches });
    setBranchInput("");
    setBranchInputError(undefined);
  }

  if (!userCanManage) {
    return null;
  }

  if (!repositoryEnabled) {
    return (
      <p className="text-sm text-muted-foreground">
        <FormattedMessage {...repositoryAutomationSettingsPanelMessages.enableRepositoryHint} />
      </p>
    );
  }

  if (repositoryArchived) {
    return (
      <p className="text-sm text-muted-foreground">
        <FormattedMessage {...repositoryAutomationSettingsPanelMessages.archivedRepositoryHint} />
      </p>
    );
  }

  if (settingsQuery.isLoading || !form) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-destructive">
          {settingsQuery.error instanceof Error
            ? settingsQuery.error.message
            : intl.formatMessage(repositoryAutomationSettingsPanelMessages.loadError)}
        </p>
        <Button variant="outline" size="sm" onClick={() => void settingsQuery.refetch()}>
          <FormattedMessage {...repositoryAutomationSettingsPanelMessages.retry} />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            <FormattedMessage
              {...repositoryAutomationSettingsPanelMessages.intro}
              values={{
                repositoryFullName,
                repositoryName: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
              }}
            />
          </p>
          {showFullPageLink ? (
            <Link
              href={automationPath}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              <FormattedMessage {...repositoryAutomationSettingsPanelMessages.openFullPageEditor} />
            </Link>
          ) : null}
          {fieldErrors.form ? <FieldError message={fieldErrors.form} /> : null}
        </div>

        <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <SectionHeading
            title={intl.formatMessage(repositoryAutomationSettingsPanelMessages.workflowsTitle)}
            description={intl.formatMessage(
              repositoryAutomationSettingsPanelMessages.workflowsDescription,
            )}
          />

          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="push-source-enabled">
                  <FormattedMessage
                    {...repositoryAutomationSettingsPanelMessages.pushSourceLabel}
                  />
                </Label>
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage
                    {...repositoryAutomationSettingsPanelMessages.pushSourceDescription}
                  />
                </p>
              </div>
              <Switch
                id="push-source-enabled"
                checked={form.pushSourceEnabled}
                disabled={formDisabled}
                onCheckedChange={(checked) => updateForm({ pushSourceEnabled: checked })}
              />
            </div>
            {form.pushSourceEnabled ? (
              <ProjectSelectField
                id="push-source-project"
                label={intl.formatMessage(
                  repositoryAutomationSettingsPanelMessages.hyperlocaliseProjectLabel,
                )}
                description={intl.formatMessage(
                  repositoryAutomationSettingsPanelMessages.pushSourceProjectDescription,
                )}
                placeholder={intl.formatMessage(
                  repositoryAutomationSettingsPanelMessages.selectProjectPlaceholder,
                )}
                value={form.pushSourceProjectId}
                projects={projects}
                disabled={formDisabled || projectsQuery.isLoading}
                error={fieldErrors.pushSourceProjectId}
                onChange={(projectId) => updateForm({ pushSourceProjectId: projectId })}
              />
            ) : null}

            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="pull-translations-enabled">
                  <FormattedMessage
                    {...repositoryAutomationSettingsPanelMessages.pullTranslationsLabel}
                  />
                </Label>
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage
                    {...repositoryAutomationSettingsPanelMessages.pullTranslationsDescription}
                  />
                </p>
              </div>
              <Switch
                id="pull-translations-enabled"
                checked={form.pullTranslationsEnabled}
                disabled={formDisabled}
                onCheckedChange={(checked) => updateForm({ pullTranslationsEnabled: checked })}
              />
            </div>
            {form.pullTranslationsEnabled ? (
              <ProjectSelectField
                id="pull-translations-project"
                label={intl.formatMessage(
                  repositoryAutomationSettingsPanelMessages.hyperlocaliseProjectLabel,
                )}
                description={intl.formatMessage(
                  repositoryAutomationSettingsPanelMessages.pullTranslationsProjectDescription,
                )}
                placeholder={intl.formatMessage(
                  repositoryAutomationSettingsPanelMessages.selectProjectPlaceholder,
                )}
                value={form.pullTranslationsProjectId}
                projects={projects}
                disabled={formDisabled || projectsQuery.isLoading}
                error={fieldErrors.pullTranslationsProjectId}
                onChange={(projectId) => updateForm({ pullTranslationsProjectId: projectId })}
              />
            ) : null}

            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="validation-enabled">
                  <FormattedMessage
                    {...repositoryAutomationSettingsPanelMessages.validationLabel}
                  />
                </Label>
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage
                    {...repositoryAutomationSettingsPanelMessages.validationDescription}
                    values={{
                      command: (chunks) => <code className="text-xs">{chunks}</code>,
                    }}
                  />
                </p>
              </div>
              <Switch
                id="validation-enabled"
                checked={form.validationEnabled}
                disabled={formDisabled}
                onCheckedChange={(checked) => updateForm({ validationEnabled: checked })}
              />
            </div>
            {form.validationEnabled ? (
              <div className="flex items-start justify-between gap-4 ps-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="validation-block">
                    <FormattedMessage
                      {...repositoryAutomationSettingsPanelMessages.validationBlockLabel}
                    />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    <FormattedMessage
                      {...repositoryAutomationSettingsPanelMessages.validationBlockDescription}
                    />
                  </p>
                </div>
                <Switch
                  id="validation-block"
                  checked={form.validationBlockOnFailure}
                  disabled={formDisabled}
                  onCheckedChange={(checked) => updateForm({ validationBlockOnFailure: checked })}
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <SectionHeading
            title={intl.formatMessage(repositoryAutomationSettingsPanelMessages.triggerTitle)}
            description={intl.formatMessage(
              repositoryAutomationSettingsPanelMessages.triggerDescription,
            )}
          />

          <div className="flex flex-wrap gap-2">
            {triggerChoices.map((choice) => (
              <Button
                key={choice.value}
                type="button"
                size="sm"
                variant={form.triggerMode === choice.value ? "default" : "outline"}
                disabled={formDisabled || (!workflowsEnabled && choice.value !== "none")}
                onClick={() =>
                  updateForm({
                    triggerMode: choice.value as GithubRepositoryAutomationFormState["triggerMode"],
                  })
                }
              >
                {choice.label}
              </Button>
            ))}
          </div>
          <FieldError message={fieldErrors.trigger} />

          {form.triggerMode === "push" ? (
            <div className="flex flex-col gap-3">
              <Label htmlFor="branch-pattern-input">
                <FormattedMessage
                  {...repositoryAutomationSettingsPanelMessages.branchPatternsLabel}
                />
              </Label>
              <p className="text-xs text-muted-foreground">
                <FormattedMessage
                  {...repositoryAutomationSettingsPanelMessages.branchPatternsDescription}
                  values={{
                    mainExample: (chunks) => <code className="text-xs">{chunks}</code>,
                    releaseExample: (chunks) => <code className="text-xs">{chunks}</code>,
                  }}
                />
              </p>
              <div className="flex gap-2">
                <input
                  id="branch-pattern-input"
                  value={branchInput}
                  onChange={(event) => {
                    setBranchInput(event.target.value);
                    setBranchInputError(undefined);
                  }}
                  disabled={formDisabled}
                  placeholder={intl.formatMessage(
                    repositoryAutomationSettingsPanelMessages.branchPatternPlaceholder,
                  )}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40 focus:ring-[3px] focus:ring-primary/20"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddBranchPattern();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={formDisabled}
                  onClick={handleAddBranchPattern}
                >
                  <FormattedMessage
                    {...repositoryAutomationSettingsPanelMessages.addBranchPattern}
                  />
                </Button>
              </div>
              <FieldError message={branchInputError ?? fieldErrors.pushBranches} />
              {form.pushBranches.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {form.pushBranches.map((branch) => (
                    <Badge key={branch} variant="secondary" className="gap-1 pe-1">
                      {branch}
                      <button
                        type="button"
                        className="rounded-full px-1 text-muted-foreground hover:text-foreground"
                        disabled={formDisabled}
                        aria-label={intl.formatMessage(
                          repositoryAutomationSettingsPanelMessages.removeBranchPatternAriaLabel,
                          { branch },
                        )}
                        onClick={() =>
                          updateForm({
                            pushBranches: form.pushBranches.filter((value) => value !== branch),
                          })
                        }
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {form.triggerMode === "scheduled" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="scheduled-cadence">
                  <FormattedMessage {...repositoryAutomationSettingsPanelMessages.cadenceLabel} />
                </Label>
                <Select
                  value={form.scheduledCadence}
                  onValueChange={(value) =>
                    updateForm({
                      scheduledCadence:
                        value as GithubRepositoryAutomationFormState["scheduledCadence"],
                    })
                  }
                  disabled={formDisabled}
                >
                  <SelectTrigger id="scheduled-cadence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">
                      <FormattedMessage
                        {...repositoryAutomationSettingsPanelMessages.cadenceHourly}
                      />
                    </SelectItem>
                    <SelectItem value="daily">
                      <FormattedMessage
                        {...repositoryAutomationSettingsPanelMessages.cadenceDaily}
                      />
                    </SelectItem>
                    <SelectItem value="weekly">
                      <FormattedMessage
                        {...repositoryAutomationSettingsPanelMessages.cadenceWeekly}
                      />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.scheduledCadence !== "hourly" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="scheduled-hour">
                    <FormattedMessage
                      {...repositoryAutomationSettingsPanelMessages.scheduledHourLabel}
                    />
                  </Label>
                  <Select
                    value={String(form.scheduledHourUtc)}
                    onValueChange={(value) => updateForm({ scheduledHourUtc: Number(value) })}
                    disabled={formDisabled}
                  >
                    <SelectTrigger id="scheduled-hour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, hour) => (
                        <SelectItem key={hour} value={String(hour)}>
                          {intl.formatMessage(
                            repositoryAutomationSettingsPanelMessages.scheduledHourOption,
                            { hour: String(hour).padStart(2, "0") },
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {form.scheduledCadence === "weekly" ? (
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="scheduled-day">
                    <FormattedMessage
                      {...repositoryAutomationSettingsPanelMessages.scheduledDayLabel}
                    />
                  </Label>
                  <Select
                    value={String(form.scheduledDayOfWeek)}
                    onValueChange={(value) => updateForm({ scheduledDayOfWeek: Number(value) })}
                    disabled={formDisabled}
                  >
                    <SelectTrigger id="scheduled-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTOMATION_WEEKDAY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {intl.formatMessage(AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE[option.value])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={fieldErrors.scheduledDayOfWeek} />
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="scheduled-timezone">
                  <FormattedMessage
                    {...repositoryAutomationSettingsPanelMessages.scheduledTimezoneLabel}
                  />
                </Label>
                <input
                  id="scheduled-timezone"
                  value={form.scheduledTimezone}
                  onChange={(event) => updateForm({ scheduledTimezone: event.target.value })}
                  disabled={formDisabled}
                  placeholder={intl.formatMessage(
                    repositoryAutomationSettingsPanelMessages.scheduledTimezonePlaceholder,
                  )}
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40 focus:ring-[3px] focus:ring-primary/20"
                />
                <FieldError message={fieldErrors.scheduledTimezone} />
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <SectionHeading
            title={intl.formatMessage(repositoryAutomationSettingsPanelMessages.statusCheckTitle)}
            description={intl.formatMessage(
              repositoryAutomationSettingsPanelMessages.statusCheckDescription,
            )}
          />

          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="status-check-enabled">
                <FormattedMessage
                  {...repositoryAutomationSettingsPanelMessages.statusCheckEnabledLabel}
                />
              </Label>
              <p className="text-xs text-muted-foreground">
                <FormattedMessage
                  {...repositoryAutomationSettingsPanelMessages.statusCheckEnabledDescription}
                />
              </p>
            </div>
            <Switch
              id="status-check-enabled"
              checked={form.statusCheckEnabled}
              disabled={formDisabled}
              onCheckedChange={(checked) => updateForm({ statusCheckEnabled: checked })}
            />
          </div>

          {form.statusCheckEnabled ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="status-check-mode">
                <FormattedMessage
                  {...repositoryAutomationSettingsPanelMessages.statusCheckModeLabel}
                />
              </Label>
              <Select
                value={form.statusCheckMode}
                onValueChange={(value) =>
                  updateForm({
                    statusCheckMode:
                      value as GithubRepositoryAutomationFormState["statusCheckMode"],
                  })
                }
                disabled={formDisabled}
              >
                <SelectTrigger id="status-check-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="advisory">
                    <FormattedMessage
                      {...repositoryAutomationSettingsPanelMessages.statusCheckAdvisory}
                    />
                  </SelectItem>
                  <SelectItem value="blocking">
                    <FormattedMessage
                      {...repositoryAutomationSettingsPanelMessages.statusCheckBlocking}
                    />
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                <FormattedMessage
                  {...repositoryAutomationSettingsPanelMessages.statusCheckBlockingDescription}
                  values={{
                    link: (chunks) => (
                      <a
                        href="https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-status-checks"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {chunks}
                      </a>
                    ),
                  }}
                />
              </p>
            </div>
          ) : null}
        </section>

        {(metadata.configVersion > 0 || formattedNextRun) && (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            {metadata.configVersion > 0 ? (
              <p>
                <FormattedMessage
                  {...repositoryAutomationSettingsPanelMessages.configVersion}
                  values={{
                    configVersion: metadata.configVersion,
                    version: (chunks) => (
                      <span className="font-medium text-foreground">{chunks}</span>
                    ),
                  }}
                />
              </p>
            ) : null}
            {formattedNextRun ? (
              <p className={cn(metadata.configVersion > 0 && "mt-1")}>
                <FormattedMessage
                  {...repositoryAutomationSettingsPanelMessages.nextScheduledRun}
                  values={{
                    nextRunAt: formattedNextRun,
                    time: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                  }}
                />
              </p>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={formDisabled || resetSettings.isPending}
            onClick={() => setResetDialogOpen(true)}
          >
            <FormattedMessage {...repositoryAutomationSettingsPanelMessages.resetSettings} />
          </Button>
          <Button
            type="button"
            disabled={formDisabled}
            onClick={handleSave}
            className="bg-primary text-primary-foreground hover:bg-primary/80"
          >
            {saveSettings.isPending ? (
              <FormattedMessage {...repositoryAutomationSettingsPanelMessages.savingSettings} />
            ) : (
              <FormattedMessage {...repositoryAutomationSettingsPanelMessages.saveSettings} />
            )}
          </Button>
        </div>
      </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...repositoryAutomationSettingsPanelMessages.resetDialogTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage
                {...repositoryAutomationSettingsPanelMessages.resetDialogDescription}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetSettings.isPending}>
              <FormattedMessage {...repositoryAutomationSettingsPanelMessages.cancel} />
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={resetSettings.isPending}
              onClick={() => resetSettings.mutate()}
            >
              {resetSettings.isPending ? (
                <FormattedMessage
                  {...repositoryAutomationSettingsPanelMessages.resettingSettings}
                />
              ) : (
                <FormattedMessage {...repositoryAutomationSettingsPanelMessages.resetSettings} />
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
