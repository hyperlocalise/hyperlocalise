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
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { ProjectOverviewMeshStage } from "../../projects/[projectId]/_components/project-overview-mesh-stage";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { TypographyP } from "@/components/ui/typography";
import { createApiClient } from "@/lib/api-client";
import { readApiResponseError } from "@/lib/api-error";
import {
  defaultContentSyncName,
  defaultContentSyncProjectFolder,
  type ContentSyncProvider,
} from "@/lib/agents/content-sync/content-sync-types";
import {
  isContentSyncAutomation,
  type WorkspaceAutomationRecord,
} from "@/lib/agents/workspace-automation-types";

import { contentSyncCardMessages as messages } from "./content-sync-card.messages";

const api = createApiClient();

type GithubRepositoryOption = {
  id: string;
  fullName: string;
  enabled: boolean;
  archived: boolean;
};

type ContentfulConnectionOption = {
  id: string;
  displayName: string;
  spaceId: string;
};

function providerLabel(provider: ContentSyncProvider) {
  switch (provider) {
    case "github":
      return messages.github;
    case "gitlab":
      return messages.gitlab;
    case "contentful":
      return messages.contentful;
    case "intercom":
      return messages.intercom;
  }
}

export function ContentSyncCard({
  organizationSlug,
  projectId,
  automations,
}: {
  organizationSlug: string;
  projectId?: string;
  automations: WorkspaceAutomationRecord[];
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const syncs = useMemo(
    () =>
      automations.filter(
        (automation) =>
          isContentSyncAutomation(automation) && (!projectId || automation.projectId === projectId),
      ),
    [automations, projectId],
  );

  const githubQuery = useQuery({
    queryKey: ["github-installation", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["github-installation"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load GitHub installation");
      }
      return (await response.json()).installation as { githubInstallationId: string } | null;
    },
  });
  const repositoriesQuery = useQuery({
    queryKey: ["github-installation-repositories", organizationSlug],
    enabled: Boolean(githubQuery.data),
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"][
        "github-installation"
      ].repositories.$get({
        param: { organizationSlug },
        query: {},
      });
      if (!response.ok) {
        return [] as GithubRepositoryOption[];
      }
      return ((await response.json()).repositories ?? []) as GithubRepositoryOption[];
    },
  });
  const contentfulQuery = useQuery({
    queryKey: ["contentful-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["contentful-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        return [] as ContentfulConnectionOption[];
      }
      return ((await response.json()).contentfulConnections ?? []) as ContentfulConnectionOption[];
    },
  });

  const githubConnected = Boolean(githubQuery.data);
  const repositories = (repositoriesQuery.data ?? []).filter(
    (repository) => repository.enabled && !repository.archived,
  );
  const contentfulConnections = contentfulQuery.data ?? [];
  const hasConnection = githubConnected || contentfulConnections.length > 0;
  const tone =
    syncs.some((sync) => sync.lastRunStatus === "failed") || !hasConnection ? "action" : "calm";

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["workspace-automations", organizationSlug, projectId ?? "all"],
    });

  const createSync = useMutation({
    mutationFn: async (input: {
      provider: ContentSyncProvider;
      connectionId: string;
      resourceKey: string;
      providerFolder: string;
      projectFolder: string;
    }) => {
      if (!projectId) {
        throw new Error("Choose a project first.");
      }
      const response = await api.api.orgs[":organizationSlug"].automations.$post({
        param: { organizationSlug },
        json: {
          kind: "content_sync",
          name: defaultContentSyncName(input),
          projectId,
          syncConfig: {
            provider: input.provider,
            connectionId: input.connectionId,
            resourceKey: input.resourceKey,
            providerFolder: input.providerFolder,
            projectFolder: input.projectFolder,
          },
        },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.saveError));
      }
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(messages.saveSuccess));
      setSheetOpen(false);
      void invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveError));
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (input: { automationId: string; status: "active" | "paused" }) => {
      const response = await api.api.orgs[":organizationSlug"].automations[":automationId"].$patch({
        param: { organizationSlug, automationId: input.automationId },
        json: { status: input.status },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.saveError));
      }
    },
    onSuccess: () => {
      void invalidate();
    },
  });

  const runSync = useMutation({
    mutationFn: async (automationId: string) => {
      const response = await api.api.orgs[":organizationSlug"].automations[
        ":automationId"
      ].runs.$post({
        param: { organizationSlug, automationId },
        json: { idempotencyKey: `content-sync:${automationId}:${Date.now()}` },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.runError));
      }
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(messages.runSuccess));
      void invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.runError));
    },
  });

  return (
    <ProjectOverviewMeshStage tone={tone}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h2 className="font-sans text-base font-medium text-foreground">
              <FormattedMessage {...messages.title} />
            </h2>
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...(projectId ? messages.description : messages.orgDescription)} />
            </TypographyP>
          </div>
          {projectId ? (
            <Button size="sm" onClick={() => setSheetOpen(true)} disabled={!hasConnection}>
              <FormattedMessage {...messages.add} />
            </Button>
          ) : null}
        </div>

        {!hasConnection ? (
          <div className="flex flex-wrap items-center gap-3">
            <TypographyP size="small">
              <FormattedMessage {...messages.connectFirst} />
            </TypographyP>
            <Button
              nativeButton={false}
              render={<Link href={`/org/${organizationSlug}/integrations`} />}
              size="sm"
              variant="outline"
            >
              <FormattedMessage {...messages.connect} />
            </Button>
          </div>
        ) : syncs.length === 0 ? (
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.empty} />
          </TypographyP>
        ) : (
          <ul className="flex flex-col gap-3">
            {syncs.map((sync) => (
              <li
                key={sync.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{sync.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {sync.syncConfig
                      ? `${intl.formatMessage(providerLabel(sync.syncConfig.provider))} · ${sync.syncConfig.resourceKey} · ${sync.syncConfig.projectFolder}`
                      : null}
                    {!projectId && sync.projectId ? ` · ${sync.projectId}` : null}
                  </p>
                  {sync.lastRunStatus === "failed" ? (
                    <p className="mt-1 text-xs text-destructive">
                      <FormattedMessage {...messages.lastRunFailed} />
                      {sync.lastRunError ? ` — ${sync.lastRunError}` : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={sync.status === "active"}
                    aria-label={intl.formatMessage(messages.enable)}
                    onCheckedChange={(checked) =>
                      updateStatus.mutate({
                        automationId: sync.id,
                        status: checked ? "active" : "paused",
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sync.status !== "active" || runSync.isPending}
                    onClick={() => runSync.mutate(sync.id)}
                  >
                    <FormattedMessage {...messages.syncNow} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {projectId ? (
        <AddContentSyncSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          repositories={repositories}
          contentfulConnections={contentfulConnections}
          githubConnected={githubConnected}
          isSaving={createSync.isPending}
          onSubmit={(input) => createSync.mutate(input)}
        />
      ) : null}
    </ProjectOverviewMeshStage>
  );
}

function AddContentSyncSheet({
  open,
  onOpenChange,
  repositories,
  contentfulConnections,
  githubConnected,
  isSaving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositories: GithubRepositoryOption[];
  contentfulConnections: ContentfulConnectionOption[];
  githubConnected: boolean;
  isSaving: boolean;
  onSubmit: (input: {
    provider: ContentSyncProvider;
    connectionId: string;
    resourceKey: string;
    providerFolder: string;
    projectFolder: string;
  }) => void;
}) {
  const intl = useIntl();
  const defaultProvider: ContentSyncProvider = githubConnected ? "github" : "contentful";
  const [provider, setProvider] = useState<ContentSyncProvider>(defaultProvider);
  const [connectionId, setConnectionId] = useState("");
  const [providerFolder, setProviderFolder] = useState("locales");
  const [projectFolder, setProjectFolder] = useState("");

  const resourceOptions =
    provider === "github"
      ? repositories.map((repository) => ({
          id: repository.id,
          label: repository.fullName,
          resourceKey: repository.fullName,
        }))
      : contentfulConnections.map((connection) => ({
          id: connection.id,
          label: connection.displayName || connection.spaceId,
          resourceKey: connection.spaceId,
        }));
  const selected =
    resourceOptions.find((option) => option.id === connectionId) ?? resourceOptions[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            <FormattedMessage {...messages.add} />
          </SheetTitle>
          <SheetDescription>
            <FormattedMessage {...messages.description} />
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-6">
          <Field>
            <FieldLabel>
              <FormattedMessage {...messages.provider} />
            </FieldLabel>
            <Select
              value={provider}
              onValueChange={(value) => {
                if (value) {
                  setProvider(value as ContentSyncProvider);
                  setConnectionId("");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {githubConnected ? (
                  <SelectItem value="github" label={intl.formatMessage(messages.github)}>
                    <FormattedMessage {...messages.github} />
                  </SelectItem>
                ) : null}
                {contentfulConnections.length > 0 ? (
                  <SelectItem value="contentful" label={intl.formatMessage(messages.contentful)}>
                    <FormattedMessage {...messages.contentful} />
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>
              <FormattedMessage {...messages.resource} />
            </FieldLabel>
            <Select
              value={selected?.id ?? ""}
              onValueChange={(value) => value && setConnectionId(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resourceOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id} label={option.label}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {provider === "github" ? (
            <Field>
              <FieldLabel>
                <FormattedMessage {...messages.providerFolder} />
              </FieldLabel>
              <Input
                value={providerFolder}
                onChange={(event) => setProviderFolder(event.target.value)}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel>
              <FormattedMessage {...messages.projectFolder} />
            </FieldLabel>
            <Input
              value={
                projectFolder ||
                (selected
                  ? defaultContentSyncProjectFolder({
                      provider,
                      resourceKey: selected.resourceKey,
                    })
                  : "")
              }
              onChange={(event) => setProjectFolder(event.target.value)}
            />
          </Field>
        </div>
        <SheetFooter>
          <Button
            disabled={!selected || isSaving}
            onClick={() => {
              if (!selected) {
                return;
              }
              onSubmit({
                provider,
                connectionId: selected.id,
                resourceKey: selected.resourceKey,
                providerFolder: provider === "github" ? providerFolder : "",
                projectFolder:
                  projectFolder ||
                  defaultContentSyncProjectFolder({
                    provider,
                    resourceKey: selected.resourceKey,
                  }),
              });
            }}
          >
            <FormattedMessage {...messages.enable} />
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
