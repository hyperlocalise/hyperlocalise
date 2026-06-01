"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createApiClient } from "@/lib/api-client";
import {
  AUTOMATION_WEEKDAY_OPTIONS,
  addBranchPattern,
} from "@/app/(authenticated)/org/[organizationSlug]/integrations/_components/github-repository-automation-view-model";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import { workspaceAutomationFormCanActivate } from "@/lib/agents/workspace-automation-view-model";

const api = createApiClient();

type ProjectOption = { id: string; name: string };
type GithubRepositoryOption = {
  id: string;
  fullName: string;
  enabled: boolean;
  archived: boolean;
  defaultBranch: string | null;
};

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
}

export function WorkspaceAutomationForm({
  organizationSlug,
  form,
  errors,
  disabled,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  errors: Record<string, string | undefined>;
  disabled?: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const [branchInput, setBranchInput] = useState("");

  const projectsQuery = useQuery({
    queryKey: ["projects", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load projects");
      }
      const body = await response.json();
      return body.projects as ProjectOption[];
    },
  });

  const repositoriesQuery = useQuery({
    queryKey: ["github-installation-repositories", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"][
        "github-installation"
      ].repositories.$get({
        param: { organizationSlug },
        query: {},
      });
      if (!response.ok) {
        throw new Error("Failed to load GitHub repositories");
      }
      const body = await response.json();
      return body.repositories as GithubRepositoryOption[];
    },
  });

  const slackQuery = useQuery({
    queryKey: ["slack-agent", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["agent-slack"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Slack settings");
      }
      const body = await response.json();
      return body.slackAgent;
    },
  });

  const emailQuery = useQuery({
    queryKey: ["email-agent", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["agent-email"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load email agent settings");
      }
      const body = await response.json();
      return body.emailAgent;
    },
  });

  const repositories = useMemo(
    () => (repositoriesQuery.data ?? []).filter((repository) => !repository.archived),
    [repositoriesQuery.data],
  );

  const canActivate = workspaceAutomationFormCanActivate(form);
  const slackConnected = Boolean(slackQuery.data?.enabled);
  const emailConnected = Boolean(emailQuery.data?.enabled);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-foreground">Basics</h2>
          <p className="text-xs text-muted-foreground">
            Instructions are stored for operators and copied into run metadata. They do not execute
            a free-form agent in V1.
          </p>
        </div>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="automation-name">Name</Label>
            <Input
              id="automation-name"
              value={form.name}
              disabled={disabled}
              onChange={(event) => onChange({ ...form, name: event.target.value })}
            />
            <FieldError message={errors.name} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="automation-instructions">Agent instructions</Label>
            <Textarea
              id="automation-instructions"
              value={form.instructions}
              disabled={disabled}
              className="min-h-48 font-mono text-sm"
              onChange={(event) => onChange({ ...form, instructions: event.target.value })}
            />
            <FieldError message={errors.instructions} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-foreground/10 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Paused automations keep their configuration but will not dispatch.
              </p>
            </div>
            <Switch
              checked={form.status === "active"}
              disabled={disabled || !canActivate}
              onCheckedChange={(checked) =>
                onChange({
                  ...form,
                  status: checked ? "active" : "paused",
                })
              }
            />
          </div>
          {!canActivate ? (
            <p className="text-xs text-muted-foreground">
              Enable at least one deterministic GitHub workflow or notification tool to activate
              this automation.
            </p>
          ) : null}
          <FieldError message={errors.form} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-foreground">Triggers</h2>
          <p className="text-xs text-muted-foreground">
            V1 supports manual runs, schedules, and GitHub push triggers.
          </p>
        </div>
        <div className="grid gap-4 rounded-lg border border-foreground/10 p-4">
          <div className="grid gap-2">
            <Label>Trigger</Label>
            <Select
              value={form.triggerMode}
              onValueChange={(value) =>
                onChange({
                  ...form,
                  triggerMode: value as WorkspaceAutomationFormState["triggerMode"],
                })
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual only</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="github">GitHub push</SelectItem>
              </SelectContent>
            </Select>
            <FieldError message={errors.trigger} />
          </div>

          {form.triggerMode === "scheduled" ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Cadence</Label>
                <Select
                  value={form.scheduledCadence}
                  onValueChange={(value) =>
                    onChange({
                      ...form,
                      scheduledCadence: value as typeof form.scheduledCadence,
                    })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Hour (UTC)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={form.scheduledHourUtc}
                  disabled={disabled || form.scheduledCadence === "hourly"}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      scheduledHourUtc: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Timezone</Label>
                <Input
                  value={form.scheduledTimezone}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      scheduledTimezone: event.target.value,
                    })
                  }
                />
              </div>
              {form.scheduledCadence === "weekly" ? (
                <div className="grid gap-2 md:col-span-3">
                  <Label>Day of week</Label>
                  <Select
                    value={String(form.scheduledDayOfWeek)}
                    onValueChange={(value) =>
                      onChange({
                        ...form,
                        scheduledDayOfWeek: Number(value),
                      })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger>
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
                </div>
              ) : null}
            </div>
          ) : null}

          {form.triggerMode === "github" ? (
            <div className="grid gap-2">
              <Label>Branch patterns</Label>
              <div className="flex flex-wrap gap-2">
                {form.pushBranches.map((branch) => (
                  <Badge key={branch} variant="secondary">
                    {branch}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={branchInput}
                  disabled={disabled}
                  placeholder="main"
                  onChange={(event) => setBranchInput(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => {
                    const result = addBranchPattern(form.pushBranches, branchInput);
                    if (result.error) {
                      return;
                    }
                    onChange({ ...form, pushBranches: result.branches });
                    setBranchInput("");
                  }}
                >
                  Add
                </Button>
              </div>
              <FieldError message={errors.pushBranches} />
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-foreground">Tools</h2>
          <p className="text-xs text-muted-foreground">
            GitHub workflows run through the existing deterministic repository automation path.
          </p>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-foreground/10 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">GitHub workflows</p>
                <p className="text-xs text-muted-foreground">
                  Push source, pull translations, and validation/check.
                </p>
              </div>
              <Switch
                checked={form.githubEnabled}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange({
                    ...form,
                    githubEnabled: checked,
                    repositoryTargetKind: checked ? "github" : "none",
                  })
                }
              />
            </div>

            {form.githubEnabled ? (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-2">
                  <Label>Repository</Label>
                  <Select
                    value={form.githubInstallationRepositoryId || undefined}
                    onValueChange={(value) => {
                      if (!value) {
                        return;
                      }
                      onChange({
                        ...form,
                        githubInstallationRepositoryId: value,
                      });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {repositories.map((repository) => (
                        <SelectItem key={repository.id} value={repository.id}>
                          {repository.fullName}
                          {!repository.enabled ? " (disabled)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.githubRepository} />
                </div>
                <div className="grid gap-2">
                  <Label>Project</Label>
                  <Select
                    value={form.githubProjectId || undefined}
                    onValueChange={(value) => {
                      if (!value) {
                        return;
                      }
                      onChange({ ...form, githubProjectId: value });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {(projectsQuery.data ?? []).map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.githubProjectId} />
                </div>
                <div className="grid gap-3">
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm">Push source</span>
                    <Switch
                      checked={form.pushSourceEnabled}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onChange({ ...form, pushSourceEnabled: checked })
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm">Pull translations</span>
                    <Switch
                      checked={form.pullTranslationsEnabled}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onChange({
                          ...form,
                          pullTranslationsEnabled: checked,
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm">Validation / check</span>
                    <Switch
                      checked={form.validationEnabled}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onChange({ ...form, validationEnabled: checked })
                      }
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-foreground/10 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Slack notifications</p>
                <p className="text-xs text-muted-foreground">
                  Notify a channel when runs reach a terminal state.
                </p>
              </div>
              <Switch
                checked={form.slackEnabled}
                disabled={disabled || !slackConnected}
                onCheckedChange={(checked) => onChange({ ...form, slackEnabled: checked })}
              />
            </div>
            {!slackConnected ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Connect Slack in{" "}
                <Link href={`/org/${organizationSlug}/integrations`} className="underline">
                  Integrations
                </Link>{" "}
                to enable this tool.
              </p>
            ) : null}
            {form.slackEnabled ? (
              <div className="mt-4 grid gap-2">
                <Label htmlFor="slack-channel">Channel ID</Label>
                <Input
                  id="slack-channel"
                  value={form.slackChannelId}
                  disabled={disabled}
                  placeholder="C0123456789"
                  onChange={(event) => onChange({ ...form, slackChannelId: event.target.value })}
                />
                <FieldError message={errors.slackChannelId} />
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-foreground/10 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Email notifications</p>
                <p className="text-xs text-muted-foreground">
                  Send terminal run summaries to specific recipients.
                </p>
              </div>
              <Switch
                checked={form.emailEnabled}
                disabled={disabled || !emailConnected}
                onCheckedChange={(checked) => onChange({ ...form, emailEnabled: checked })}
              />
            </div>
            {!emailConnected ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Enable the email agent in{" "}
                <Link href={`/org/${organizationSlug}/integrations`} className="underline">
                  Integrations
                </Link>{" "}
                to use email notifications.
              </p>
            ) : null}
            {form.emailEnabled ? (
              <div className="mt-4 grid gap-2">
                <Label htmlFor="email-recipients">Recipients</Label>
                <Textarea
                  id="email-recipients"
                  value={form.emailRecipients.join("\n")}
                  disabled={disabled}
                  className="min-h-24"
                  placeholder={"ops@company.com\ndev@company.com"}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      emailRecipients: event.target.value
                        .split(/\n|,/)
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
                <FieldError message={errors.emailRecipients} />
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
