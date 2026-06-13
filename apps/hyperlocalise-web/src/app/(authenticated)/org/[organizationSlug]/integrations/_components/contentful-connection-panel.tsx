"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { SaveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createApiClient } from "@/lib/api-client";
import { getLocaleLabel } from "@/lib/i18n/locales";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

const api = createApiClient();

export type ContentfulConnectionSummary = {
  id: string;
  displayName: string;
  projectId: string;
  spaceId: string;
  environmentId: string;
  sourceLocale: string;
  targetLocales: string[];
  contentTypeIds: string[];
  validationStatus: string;
  validationMessage: string | null;
  maskedTokenSuffix: string;
  webhook: {
    id: string;
    status: string;
    providerWebhookId: string | null;
    url: string | null;
    lastDeliveryId: string | null;
    lastDeliveredAt: string | null;
    lastError: string | null;
  } | null;
};

export type ProjectOption = {
  id: string;
  name: string;
  sourceLocale: string | null;
  targetLocales: string[];
};

export type ContentfulConnectionForm = {
  displayName: string;
  projectId: string;
  spaceId: string;
  environmentId: string;
  contentTypeIds: string[];
  accessToken: string;
};

type ContentfulContentTypeOption = {
  id: string;
  name: string;
};

type SaveContentfulConnectionPayloadBase = {
  projectId: string;
  displayName: string;
  spaceId: string;
  environmentId: string;
  sourceLocale: string;
  targetLocales: string[];
  contentTypeIds: string[];
};

type SaveContentfulConnectionPayload =
  | (SaveContentfulConnectionPayloadBase & {
      connectionId: string;
      accessToken?: string;
    })
  | (SaveContentfulConnectionPayloadBase & {
      connectionId?: undefined;
      accessToken: string;
    });

export function useContentfulConnections(organizationSlug: string) {
  return useQuery({
    queryKey: ["contentful-connections", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["contentful-connections"].$get({
        param: { organizationSlug },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch Contentful connections");
      }
      const data = await res.json();
      return data.contentfulConnections as ContentfulConnectionSummary[];
    },
  });
}

export function useProjectOptions(organizationSlug: string, enabled = true) {
  return useQuery({
    queryKey: ["contentful-project-options", organizationSlug],
    enabled,
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch projects");
      }
      const data = await res.json();
      return data.projects.map((project) => ({
        id: project.id,
        name: project.name,
        sourceLocale: project.sourceLocale ?? null,
        targetLocales: project.targetLocales ?? [],
      })) as ProjectOption[];
    },
  });
}

function useDiscoverContentfulSpace(input: {
  organizationSlug: string;
  spaceId: string;
  environmentId: string;
  accessToken: string;
  connectionId?: string;
  enabled: boolean;
}) {
  const trimmedSpaceId = input.spaceId.trim();
  const trimmedEnvironmentId = input.environmentId.trim() || "master";
  const trimmedAccessToken = input.accessToken.trim();
  const canDiscover =
    input.enabled &&
    trimmedSpaceId.length > 0 &&
    trimmedEnvironmentId.length > 0 &&
    (trimmedAccessToken.length > 0 || Boolean(input.connectionId));

  return useQuery({
    queryKey: [
      "contentful-space-discovery",
      input.organizationSlug,
      trimmedSpaceId,
      trimmedEnvironmentId,
      input.connectionId ?? null,
      trimmedAccessToken ? "token" : "stored",
    ],
    enabled: canDiscover,
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["contentful-connections"].discover.$post({
        param: { organizationSlug: input.organizationSlug },
        json: {
          spaceId: trimmedSpaceId,
          environmentId: trimmedEnvironmentId,
          ...(trimmedAccessToken ? { accessToken: trimmedAccessToken } : {}),
          ...(input.connectionId ? { connectionId: input.connectionId } : {}),
        },
      });
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ message: "Unable to load Contentful metadata" }));
        throw new Error(
          "message" in error ? String(error.message) : "Unable to load Contentful metadata",
        );
      }
      const data = await res.json();
      return data.contentfulSpaceDiscovery as {
        environmentId: string;
        locales: Array<{ code: string; name: string; default: boolean }>;
        contentTypes: ContentfulContentTypeOption[];
      };
    },
  });
}

export function useSaveContentfulConnection(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SaveContentfulConnectionPayload) => {
      const fieldConfig = { fieldMode: "auto" as const, overwriteDraftLocales: false };
      const accessToken = payload.accessToken?.trim();

      const res = await (payload.connectionId
        ? api.api.orgs[":organizationSlug"]["contentful-connections"][":connectionId"].$patch({
            param: { organizationSlug, connectionId: payload.connectionId },
            json: {
              projectId: payload.projectId,
              displayName: payload.displayName,
              spaceId: payload.spaceId,
              environmentId: payload.environmentId,
              sourceLocale: payload.sourceLocale,
              targetLocales: payload.targetLocales,
              contentTypeIds: payload.contentTypeIds,
              fieldConfig,
              enabled: true,
              ...(accessToken ? { accessToken } : {}),
            },
          })
        : (() => {
            if (!accessToken) {
              throw new Error("accessToken is required for new Contentful connections");
            }
            return api.api.orgs[":organizationSlug"]["contentful-connections"].$post({
              param: { organizationSlug },
              json: {
                projectId: payload.projectId,
                displayName: payload.displayName,
                spaceId: payload.spaceId,
                environmentId: payload.environmentId,
                sourceLocale: payload.sourceLocale,
                targetLocales: payload.targetLocales,
                contentTypeIds: payload.contentTypeIds,
                fieldConfig,
                enabled: true,
                accessToken,
              },
            });
          })());
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "contentful_connection_failed" }));
        throw new Error(
          "message" in error ? String(error.message) : "Unable to save Contentful connection",
        );
      }
      return res.json();
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ["contentful-connections", organizationSlug],
      });
      toast.success("Contentful connection saved");
      if (result.webhookSecret) {
        toast.message("Contentful webhook registered", {
          description:
            "Hyperlocalise created the Contentful webhook automatically. Save the secret below if you need to re-register manually.",
        });
      } else if (result.contentfulConnection.webhook?.providerWebhookId) {
        toast.message("Contentful webhook synced", {
          description: "Hyperlocalise updated the Contentful webhook configuration.",
        });
      } else if (result.contentfulConnection.webhook?.lastError) {
        toast.message("Contentful webhook needs attention", {
          description: result.contentfulConnection.webhook.lastError,
        });
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function ProjectLocalesSummary({ project }: { project: ProjectOption | undefined }) {
  if (!project) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a Hyperlocalise project to use its source and target locales.
      </p>
    );
  }

  if (!project.sourceLocale || project.targetLocales.length === 0) {
    return (
      <p className="text-sm text-destructive">
        This project does not have locales configured yet. Set them in project settings before
        connecting Contentful.
      </p>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm">
      <div>
        <span className="text-muted-foreground">Source: </span>
        <span>
          {getLocaleLabel(project.sourceLocale)} ({project.sourceLocale})
        </span>
      </div>
      <div>
        <span className="text-muted-foreground">Targets: </span>
        <span>{project.targetLocales.join(", ")}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Locales come from the selected Hyperlocalise project.
      </p>
    </div>
  );
}

function ContentTypePicker({
  contentTypes,
  disabled,
  isLoading,
  loadError,
  selectedIds,
  onChange,
  requiresCredentials,
}: {
  contentTypes: ContentfulContentTypeOption[];
  disabled: boolean;
  isLoading: boolean;
  loadError: string | null;
  selectedIds: string[];
  onChange: (contentTypeIds: string[]) => void;
  requiresCredentials: boolean;
}) {
  const fieldId = useId();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleContentType(contentTypeId: string) {
    if (selected.has(contentTypeId)) {
      onChange(selectedIds.filter((id) => id !== contentTypeId));
      return;
    }
    onChange([...selectedIds, contentTypeId].toSorted());
  }

  if (requiresCredentials) {
    return (
      <p className="text-sm text-muted-foreground">
        Enter your Space ID and Management API token to load content types from Contentful.
      </p>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading content types...</p>;
  }

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  if (contentTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">No content types found in this space.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={fieldId}>
      {contentTypes.map((contentType) => {
        const isSelected = selected.has(contentType.id);
        return (
          <Button
            key={contentType.id}
            type="button"
            size="sm"
            variant={isSelected ? "default" : "outline"}
            disabled={disabled}
            onClick={() => toggleContentType(contentType.id)}
            className="h-7 px-2.5 text-xs"
          >
            {contentType.name}
          </Button>
        );
      })}
    </div>
  );
}

export function ContentfulConnectionPanel({
  connection,
  disabled,
  lastWebhookSecret,
  onSave,
  isSaving,
  form,
  onFormChange,
  projects,
  isLoadingProjects,
  organizationSlug,
}: {
  connection?: ContentfulConnectionSummary;
  disabled: boolean;
  lastWebhookSecret: string;
  onSave: () => void;
  isSaving: boolean;
  form: ContentfulConnectionForm;
  onFormChange: (form: ContentfulConnectionForm) => void;
  projects: ProjectOption[];
  isLoadingProjects: boolean;
  organizationSlug: string;
}) {
  const [isReplacingToken, setIsReplacingToken] = useState(false);
  const selectedProject = projects.find((project) => project.id === form.projectId);
  const projectLabel =
    selectedProject?.name ?? (form.projectId ? "Unknown project" : "Select project");
  const projectLocalesReady = Boolean(
    selectedProject?.sourceLocale && selectedProject.targetLocales.length > 0,
  );
  const tokenRequired = !connection || isReplacingToken;
  const canDiscoverContentTypes =
    form.spaceId.trim().length > 0 &&
    (form.accessToken.trim().length > 0 || Boolean(connection?.id));
  const discoveryQuery = useDiscoverContentfulSpace({
    organizationSlug,
    spaceId: form.spaceId,
    environmentId: form.environmentId,
    accessToken: form.accessToken,
    connectionId: connection?.id,
    enabled: canDiscoverContentTypes,
  });
  const discoveredContentTypes = discoveryQuery.data?.contentTypes ?? [];
  const canSaveContentfulConnection =
    form.displayName.trim().length > 0 &&
    form.projectId.trim().length > 0 &&
    projectLocalesReady &&
    form.spaceId.trim().length > 0 &&
    form.environmentId.trim().length > 0 &&
    form.contentTypeIds.length > 0 &&
    (!tokenRequired || form.accessToken.trim().length > 0);

  useEffect(() => {
    setIsReplacingToken(false);
  }, [connection?.id]);

  useEffect(() => {
    if (!discoveryQuery.data || form.contentTypeIds.length === 0) {
      return;
    }

    const availableIds = new Set(
      discoveryQuery.data.contentTypes.map((contentType) => contentType.id),
    );
    const nextIds = form.contentTypeIds.filter((id) => availableIds.has(id));
    if (nextIds.length !== form.contentTypeIds.length) {
      onFormChange({ ...form, contentTypeIds: nextIds });
    }
    // Prune stale selections only when Contentful metadata is refreshed.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid loops on selection changes
  }, [discoveryQuery.data]);

  return (
    <div className="flex flex-col gap-5">
      {connection ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Token ...{connection.maskedTokenSuffix}</Badge>
          <Badge variant="outline">
            {connection.spaceId}/{connection.environmentId}
          </Badge>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Field className="gap-2">
          <FieldLabel>Display name</FieldLabel>
          <Input
            value={form.displayName}
            disabled={disabled}
            placeholder="Contentful Help Center"
            onChange={(event) => onFormChange({ ...form, displayName: event.target.value })}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel>Project</FieldLabel>
          <Select
            value={form.projectId || undefined}
            disabled={disabled || isLoadingProjects || projects.length === 0}
            onValueChange={(value) => {
              if (!value) {
                return;
              }
              onFormChange({ ...form, projectId: value });
            }}
          >
            <SelectTrigger className="w-full">
              <span className="truncate">
                {isLoadingProjects ? "Loading projects..." : projectLabel}
              </span>
            </SelectTrigger>
            <SelectContent>
              {projects.length === 0 ? (
                <SelectItem value="__empty" disabled>
                  No projects found
                </SelectItem>
              ) : null}
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="gap-2 lg:col-span-2">
          <FieldLabel>Project locales</FieldLabel>
          <ProjectLocalesSummary project={selectedProject} />
        </Field>
        <Field className="gap-2">
          <FieldLabel>Space ID</FieldLabel>
          <Input
            value={form.spaceId}
            disabled={disabled}
            onChange={(event) => onFormChange({ ...form, spaceId: event.target.value })}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel>Environment ID</FieldLabel>
          <Input
            value={form.environmentId}
            disabled={disabled}
            placeholder="master"
            onChange={(event) => onFormChange({ ...form, environmentId: event.target.value })}
          />
        </Field>
        {!connection || isReplacingToken ? (
          <Field className="gap-2 lg:col-span-2">
            <FieldLabel>Management API token</FieldLabel>
            <div className="flex gap-2">
              <Input
                type="password"
                value={form.accessToken}
                disabled={disabled}
                autoComplete="off"
                onChange={(event) => onFormChange({ ...form, accessToken: event.target.value })}
              />
              {connection ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => {
                    setIsReplacingToken(false);
                    onFormChange({ ...form, accessToken: "" });
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </Field>
        ) : (
          <Field className="gap-2 lg:col-span-2">
            <FieldLabel>Management API token</FieldLabel>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="justify-start"
              onClick={() => setIsReplacingToken(true)}
            >
              Replace token
            </Button>
          </Field>
        )}
        <Field className="gap-2 lg:col-span-2">
          <FieldLabel>Content types</FieldLabel>
          <ContentTypePicker
            contentTypes={discoveredContentTypes}
            disabled={disabled}
            isLoading={discoveryQuery.isFetching}
            loadError={discoveryQuery.error?.message ?? null}
            selectedIds={form.contentTypeIds}
            onChange={(contentTypeIds) => onFormChange({ ...form, contentTypeIds })}
            requiresCredentials={!canDiscoverContentTypes}
          />
        </Field>
      </div>

      {connection?.webhook ? (
        <div className="text-sm">
          <h4 className="font-medium">Webhook</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Hyperlocalise registers a Contentful webhook for entry publish events when you save or
            validate this connection. Automations with a Contentful trigger use it to start
            translation runs.
          </p>
          <div className="mt-3 grid gap-2 rounded-lg bg-muted/50 p-3 text-xs">
            <span>
              Registration:{" "}
              {connection.webhook.providerWebhookId
                ? "Registered in Contentful"
                : connection.webhook.lastError
                  ? "Not registered"
                  : "Pending registration"}
            </span>
            <span className="font-mono break-all">
              URL: {connection.webhook.url ?? "Set HYPERLOCALISE_PUBLIC_APP_URL"}
            </span>
            {connection.webhook.providerWebhookId ? (
              <span className="font-mono break-all">
                Contentful webhook ID: {connection.webhook.providerWebhookId}
              </span>
            ) : null}
            {lastWebhookSecret ? (
              <span className="font-mono break-all">Secret: {lastWebhookSecret}</span>
            ) : null}
            {connection.webhook.lastError ? (
              <span className="text-destructive">{connection.webhook.lastError}</span>
            ) : null}
            <span>Last delivery: {connection.webhook.lastDeliveredAt ?? "No deliveries yet"}</span>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={disabled || isSaving || isLoadingProjects || !canSaveContentfulConnection}
          onClick={onSave}
        >
          <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
          {isSaving ? "Saving..." : connection ? "Update connection" : "Save connection"}
        </Button>
      </div>
    </div>
  );
}

export function getProjectLocales(project: ProjectOption | undefined) {
  if (!project?.sourceLocale || project.targetLocales.length === 0) {
    return null;
  }

  return {
    sourceLocale: project.sourceLocale,
    targetLocales: project.targetLocales,
  };
}
