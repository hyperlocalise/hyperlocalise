"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  value,
  projects,
  disabled,
  error,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
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
          <SelectValue placeholder="Select a project" />
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
          "error" in error ? String(error.error) : "Failed to load automation settings",
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

      if (!res.ok) {
        throw new Error("Failed to load projects");
      }

      const data = await res.json();
      return (data.projects as ProjectOption[]).map((project) => ({
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
        setFieldErrors(mapAutomationApiErrorToFieldErrors(result.code, result.message));
        toast.error(result.message ?? "Could not save automation settings");
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
      toast.success("Automation settings saved");
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
          "error" in error ? String(error.error) : "Failed to reset automation settings",
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
      toast.success("Automation settings reset");
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
      { value: "none", label: "Off" },
      { value: "push", label: "On push" },
      { value: "scheduled", label: "Scheduled" },
    ],
    [],
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

    const errors = validateAutomationFormState(form);
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

    const result = addBranchPattern(form.pushBranches, branchInput);
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
        Enable this repository to configure translation automation.
      </p>
    );
  }

  if (repositoryArchived) {
    return (
      <p className="text-sm text-muted-foreground">
        Archived repositories cannot use translation automation.
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
            : "Unable to load automation settings."}
        </p>
        <Button variant="outline" size="sm" onClick={() => void settingsQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Configure how Hyperlocalise syncs source strings and translations for{" "}
            <span className="font-medium text-foreground">{repositoryFullName}</span>.
          </p>
          {showFullPageLink ? (
            <Link
              href={automationPath}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Open full-page editor
            </Link>
          ) : null}
          {fieldErrors.form ? <FieldError message={fieldErrors.form} /> : null}
        </div>

        <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <SectionHeading
            title="Workflows"
            description="Choose which automation jobs run for this repository."
          />

          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="push-source-enabled">Push source to Hyperlocalise</Label>
                <p className="text-xs text-muted-foreground">
                  Import source strings from GitHub into your TMS project.
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
                label="Hyperlocalise project"
                description="Source strings are pushed into this project."
                value={form.pushSourceProjectId}
                projects={projects}
                disabled={formDisabled || projectsQuery.isLoading}
                error={fieldErrors.pushSourceProjectId}
                onChange={(projectId) => updateForm({ pushSourceProjectId: projectId })}
              />
            ) : null}

            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="pull-translations-enabled">Pull translations to GitHub</Label>
                <p className="text-xs text-muted-foreground">
                  Opens a pull request with updated translation files when sync succeeds.
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
                label="Hyperlocalise project"
                description="Translations are read from this project before opening the pull request."
                value={form.pullTranslationsProjectId}
                projects={projects}
                disabled={formDisabled || projectsQuery.isLoading}
                error={fieldErrors.pullTranslationsProjectId}
                onChange={(projectId) => updateForm({ pullTranslationsProjectId: projectId })}
              />
            ) : null}

            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="validation-enabled">Localization check</Label>
                <p className="text-xs text-muted-foreground">
                  Runs <code className="text-xs">hl check</code> against repository translation
                  files.
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
                  <Label htmlFor="validation-block">Block on failure</Label>
                  <p className="text-xs text-muted-foreground">
                    Fail the automation run when the localization check reports errors.
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
            title="Trigger"
            description="Push and scheduled triggers are mutually exclusive."
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
              <Label htmlFor="branch-pattern-input">Branch patterns</Label>
              <p className="text-xs text-muted-foreground">
                Use glob patterns such as <code className="text-xs">main</code> or{" "}
                <code className="text-xs">release/*</code>. Up to 32 patterns.
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
                  placeholder="main"
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
                  Add
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
                        aria-label={`Remove ${branch}`}
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
                <Label htmlFor="scheduled-cadence">Cadence</Label>
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
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.scheduledCadence !== "hourly" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="scheduled-hour">Hour (UTC)</Label>
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
                          {String(hour).padStart(2, "0")}:00 UTC
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {form.scheduledCadence === "weekly" ? (
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="scheduled-day">Day of week</Label>
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
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={fieldErrors.scheduledDayOfWeek} />
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="scheduled-timezone">Timezone</Label>
                <input
                  id="scheduled-timezone"
                  value={form.scheduledTimezone}
                  onChange={(event) => updateForm({ scheduledTimezone: event.target.value })}
                  disabled={formDisabled}
                  placeholder="UTC"
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40 focus:ring-[3px] focus:ring-primary/20"
                />
                <FieldError message={fieldErrors.scheduledTimezone} />
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <SectionHeading
            title="GitHub status check"
            description="Publish a check run so teams can see localization results on commits and pull requests."
          />

          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="status-check-enabled">Enable check run</Label>
              <p className="text-xs text-muted-foreground">
                Shows localization automation status in GitHub Checks.
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
              <Label htmlFor="status-check-mode">Check mode</Label>
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
                  <SelectItem value="advisory">Advisory</SelectItem>
                  <SelectItem value="blocking">Blocking</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Blocking checks can fail pull requests when combined with{" "}
                <a
                  href="https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-status-checks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  branch protection rules
                </a>
                .
              </p>
            </div>
          ) : null}
        </section>

        {(metadata.configVersion > 0 || formattedNextRun) && (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            {metadata.configVersion > 0 ? (
              <p>
                Config version:{" "}
                <span className="font-medium text-foreground">{metadata.configVersion}</span>
              </p>
            ) : null}
            {formattedNextRun ? (
              <p className={cn(metadata.configVersion > 0 && "mt-1")}>
                Next scheduled run:{" "}
                <span className="font-medium text-foreground">{formattedNextRun}</span>
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
            Reset settings
          </Button>
          <Button
            type="button"
            disabled={formDisabled}
            onClick={handleSave}
            className="bg-primary text-primary-foreground hover:bg-primary/80"
          >
            {saveSettings.isPending ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset automation settings?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears saved workflows, triggers, and status check settings for this repository.
              GitHub metadata sync is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetSettings.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={resetSettings.isPending}
              onClick={() => resetSettings.mutate()}
            >
              {resetSettings.isPending ? "Resetting..." : "Reset settings"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
