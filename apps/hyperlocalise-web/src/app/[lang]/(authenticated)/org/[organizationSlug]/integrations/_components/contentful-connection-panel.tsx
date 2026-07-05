"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { SaveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { contentfulConnectionPanelMessages } from "./contentful-connection-panel.messages";
import { createApiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const api = createApiClient();

export type ContentfulConnectionSummary = {
  id: string;
  displayName: string;
  /** @deprecated Project configuration lives on automations. */
  projectId: string | null;
  spaceId: string;
  environmentId: string;
  /** @deprecated Locale configuration lives on automations. */
  sourceLocale: string | null;
  /** @deprecated Locale configuration lives on automations. */
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

export type ContentfulConnectionForm = {
  displayName: string;
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
  displayName: string;
  spaceId: string;
  environmentId: string;
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
  const intl = useIntl();

  return useQuery({
    queryKey: ["contentful-connections", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["contentful-connections"].$get({
        param: { organizationSlug },
      });
      if (!res.ok) {
        throw new Error(
          intl.formatMessage(contentfulConnectionPanelMessages.fetchConnectionsFailed),
        );
      }
      const data = await res.json();
      return data.contentfulConnections as ContentfulConnectionSummary[];
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
  const intl = useIntl();
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
      trimmedAccessToken || "stored",
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
        const fallbackMessage = intl.formatMessage(
          contentfulConnectionPanelMessages.loadMetadataFailed,
        );
        const error = await res.json().catch(() => ({ message: fallbackMessage }));
        const message =
          typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string" &&
          error.message.length > 0
            ? error.message
            : typeof error === "object" &&
                error !== null &&
                "error" in error &&
                typeof error.error === "string"
              ? error.error.replaceAll("_", " ")
              : fallbackMessage;
        throw new Error(message);
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
  const intl = useIntl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SaveContentfulConnectionPayload) => {
      const fieldConfig = { fieldMode: "auto" as const, overwriteDraftLocales: false };
      const accessToken = payload.accessToken?.trim();

      const res = await (payload.connectionId
        ? api.api.orgs[":organizationSlug"]["contentful-connections"][":connectionId"].$patch({
            param: { organizationSlug, connectionId: payload.connectionId },
            json: {
              displayName: payload.displayName,
              spaceId: payload.spaceId,
              environmentId: payload.environmentId,
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
                displayName: payload.displayName,
                spaceId: payload.spaceId,
                environmentId: payload.environmentId,
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
          "message" in error
            ? String(error.message)
            : intl.formatMessage(contentfulConnectionPanelMessages.saveConnectionFailed),
        );
      }
      return res.json();
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ["contentful-connections", organizationSlug],
      });
      toast.success(intl.formatMessage(contentfulConnectionPanelMessages.connectionSavedToast));
      if (result.webhookSecret) {
        toast.message(
          intl.formatMessage(contentfulConnectionPanelMessages.webhookRegisteredToastTitle),
          {
            description: intl.formatMessage(
              contentfulConnectionPanelMessages.webhookRegisteredToastDescription,
            ),
          },
        );
      } else if (result.contentfulConnection.webhook?.providerWebhookId) {
        toast.message(
          intl.formatMessage(contentfulConnectionPanelMessages.webhookSyncedToastTitle),
          {
            description: intl.formatMessage(
              contentfulConnectionPanelMessages.webhookSyncedToastDescription,
            ),
          },
        );
      } else if (result.contentfulConnection.webhook?.lastError) {
        toast.message(
          intl.formatMessage(contentfulConnectionPanelMessages.webhookNeedsAttentionToastTitle),
          {
            description: result.contentfulConnection.webhook.lastError,
          },
        );
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function ContentfulTokenGuidance() {
  return (
    <FieldDescription>
      <FormattedMessage {...contentfulConnectionPanelMessages.tokenGuidance} />
    </FieldDescription>
  );
}

function ContentTypePicker({
  contentTypes,
  disabled,
  isLoading,
  loadError,
  labelledBy,
  selectedIds,
  onChange,
  requiresCredentials,
}: {
  contentTypes: ContentfulContentTypeOption[];
  disabled: boolean;
  isLoading: boolean;
  loadError: string | null;
  labelledBy: string;
  selectedIds: string[];
  onChange: (contentTypeIds: string[]) => void;
  requiresCredentials: boolean;
}) {
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
        <FormattedMessage {...contentfulConnectionPanelMessages.enterCredentialsForContentTypes} />
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        <FormattedMessage {...contentfulConnectionPanelMessages.loadingContentTypes} />
      </p>
    );
  }

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  if (contentTypes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <FormattedMessage {...contentfulConnectionPanelMessages.noContentTypesFound} />
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={labelledBy}>
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
  organizationSlug,
}: {
  connection?: ContentfulConnectionSummary;
  disabled: boolean;
  lastWebhookSecret: string;
  onSave: () => void;
  isSaving: boolean;
  form: ContentfulConnectionForm;
  onFormChange: (form: ContentfulConnectionForm) => void;
  organizationSlug: string;
}) {
  const intl = useIntl();
  const contentTypesFieldId = useId();
  const [isReplacingToken, setIsReplacingToken] = useState(false);
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
          <Badge variant="outline">
            {intl.formatMessage(contentfulConnectionPanelMessages.tokenBadge, {
              suffix: connection.maskedTokenSuffix,
            })}
          </Badge>
          <Badge variant="outline">
            {connection.spaceId}/{connection.environmentId}
          </Badge>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Field className="gap-2 lg:col-span-2">
          <FieldLabel>
            {intl.formatMessage(contentfulConnectionPanelMessages.displayNameLabel)}
          </FieldLabel>
          <Input
            value={form.displayName}
            disabled={disabled}
            placeholder={intl.formatMessage(
              contentfulConnectionPanelMessages.displayNamePlaceholder,
            )}
            onChange={(event) => onFormChange({ ...form, displayName: event.target.value })}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel>
            {intl.formatMessage(contentfulConnectionPanelMessages.spaceIdLabel)}
          </FieldLabel>
          <Input
            value={form.spaceId}
            disabled={disabled}
            onChange={(event) => onFormChange({ ...form, spaceId: event.target.value })}
          />
        </Field>
        <Field className="gap-2">
          <FieldLabel>
            {intl.formatMessage(contentfulConnectionPanelMessages.environmentIdLabel)}
          </FieldLabel>
          <Input
            value={form.environmentId}
            disabled={disabled}
            placeholder={intl.formatMessage(
              contentfulConnectionPanelMessages.environmentIdPlaceholder,
            )}
            onChange={(event) => onFormChange({ ...form, environmentId: event.target.value })}
          />
        </Field>
        {!connection || isReplacingToken ? (
          <Field className="gap-2 lg:col-span-2">
            <FieldLabel>
              {intl.formatMessage(contentfulConnectionPanelMessages.cmaTokenLabel)}
            </FieldLabel>
            <ContentfulTokenGuidance />
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
                  {intl.formatMessage(contentfulConnectionPanelMessages.cancel)}
                </Button>
              ) : null}
            </div>
          </Field>
        ) : (
          <Field className="gap-2 lg:col-span-2">
            <FieldLabel>
              {intl.formatMessage(contentfulConnectionPanelMessages.cmaTokenLabel)}
            </FieldLabel>
            <ContentfulTokenGuidance />
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="justify-start"
              onClick={() => setIsReplacingToken(true)}
            >
              {intl.formatMessage(contentfulConnectionPanelMessages.replaceToken)}
            </Button>
          </Field>
        )}
        <Field className="gap-2 lg:col-span-2">
          <FieldLabel id={contentTypesFieldId}>
            {intl.formatMessage(contentfulConnectionPanelMessages.contentTypesLabel)}
          </FieldLabel>
          <ContentTypePicker
            contentTypes={discoveredContentTypes}
            disabled={disabled}
            isLoading={discoveryQuery.isFetching}
            loadError={discoveryQuery.error?.message ?? null}
            labelledBy={contentTypesFieldId}
            selectedIds={form.contentTypeIds}
            onChange={(contentTypeIds) => onFormChange({ ...form, contentTypeIds })}
            requiresCredentials={!canDiscoverContentTypes}
          />
        </Field>
      </div>

      {connection?.webhook ? (
        <div className="text-sm">
          <h4 className="font-medium">
            <FormattedMessage {...contentfulConnectionPanelMessages.webhookHeading} />
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            <FormattedMessage {...contentfulConnectionPanelMessages.webhookDescription} />
          </p>
          <div className="mt-3 grid gap-2 rounded-lg bg-muted/50 p-3 text-xs">
            <span>
              {intl.formatMessage(contentfulConnectionPanelMessages.registrationLabel)}{" "}
              {intl.formatMessage(
                connection.webhook.providerWebhookId
                  ? contentfulConnectionPanelMessages.registrationRegistered
                  : connection.webhook.lastError
                    ? contentfulConnectionPanelMessages.registrationNotRegistered
                    : contentfulConnectionPanelMessages.registrationPending,
              )}
            </span>
            <span className="font-mono break-all">
              {intl.formatMessage(contentfulConnectionPanelMessages.webhookUrl, {
                url:
                  connection.webhook.url ??
                  intl.formatMessage(contentfulConnectionPanelMessages.webhookUrlUnset),
              })}
            </span>
            {connection.webhook.providerWebhookId ? (
              <span className="font-mono break-all">
                {intl.formatMessage(contentfulConnectionPanelMessages.contentfulWebhookId, {
                  webhookId: connection.webhook.providerWebhookId,
                })}
              </span>
            ) : null}
            {lastWebhookSecret ? (
              <span className="font-mono break-all">
                {intl.formatMessage(contentfulConnectionPanelMessages.webhookSecret, {
                  secret: lastWebhookSecret,
                })}
              </span>
            ) : null}
            {connection.webhook.lastError ? (
              <span className="text-destructive">{connection.webhook.lastError}</span>
            ) : null}
            <span>
              {connection.webhook.lastDeliveredAt
                ? intl.formatMessage(contentfulConnectionPanelMessages.lastDeliveryAt, {
                    timestamp: connection.webhook.lastDeliveredAt,
                  })
                : intl.formatMessage(contentfulConnectionPanelMessages.lastDeliveryNone)}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={disabled || isSaving || !canSaveContentfulConnection}
          onClick={onSave}
        >
          <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
          {isSaving
            ? intl.formatMessage(contentfulConnectionPanelMessages.saving)
            : connection
              ? intl.formatMessage(contentfulConnectionPanelMessages.updateConnection)
              : intl.formatMessage(contentfulConnectionPanelMessages.saveConnection)}
        </Button>
      </div>
    </div>
  );
}
