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
import { useEffect, useId, useMemo, useState } from "react";
import { EyeIcon, EyeSlashIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createApiClient } from "@/lib/api-client";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";
import {
  STORYBLOK_PIPES_SLUG,
  STORYBLOK_REGIONS,
  type StoryblokRegion,
} from "@/lib/storyblok/constants";
import type { StoryblokConnectionSummary, StoryblokDiscoveryResult } from "@/lib/storyblok/types";

import { IntegrationLogo } from "./integration-logo";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { CollapsibleIntegrationRow } from "./integration-row";
import { storyblokConnectionPanelMessages as messages } from "./storyblok-connection-panel.messages";

const api = createApiClient();

const REGION_LABELS: Record<StoryblokRegion, MessageDescriptor> = {
  eu: messages.regionEu,
  us: messages.regionUs,
  ca: messages.regionCa,
  ap: messages.regionAp,
  cn: messages.regionCn,
};

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  if (body && typeof body === "object") {
    const message = (body as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

export function useStoryblokConnections(organizationSlug: string) {
  const intl = useIntl();
  return useQuery({
    queryKey: ["storyblok-connections", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["storyblok-connections"].$get({
        param: { organizationSlug },
      });
      if (!res.ok) {
        throw new Error(intl.formatMessage(messages.fetchConnectionsFailed));
      }
      const data = await res.json();
      return data.storyblokConnections as StoryblokConnectionSummary[];
    },
  });
}

export function StoryblokConnectionPanel({
  organizationSlug,
  disabled,
  isLast = false,
}: {
  organizationSlug: string;
  disabled?: boolean;
  isLast?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const displayNameId = useId();
  const accessTokenId = useId();
  const [expanded, setExpanded] = useState(false);
  const [displayName, setDisplayName] = useState("Storyblok");
  const [region, setRegion] = useState<StoryblokRegion>("eu");
  const [accessToken, setAccessToken] = useState("");
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [spaceId, setSpaceId] = useState("");
  const [folderSlugs, setFolderSlugs] = useState<string[]>([]);
  const [discovery, setDiscovery] = useState<StoryblokDiscoveryResult | null>(null);

  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, STORYBLOK_PIPES_SLUG),
    [intl],
  );
  const providerName = summary?.name ?? "Storyblok";

  const connectionsQuery = useStoryblokConnections(organizationSlug);
  const connection = connectionsQuery.data?.[0] ?? null;
  const isConnected = Boolean(connection && connection.validationStatus === "valid");

  useEffect(() => {
    if (!connection) {
      return;
    }
    setDisplayName(connection.displayName);
    setRegion(connection.region);
    setSpaceId(connection.spaceId);
    setFolderSlugs(connection.folderSlugs ?? []);
  }, [connection]);

  const discoverMutation = useMutation({
    mutationFn: async (input: { spaceId?: string }) => {
      const trimmedToken = accessToken.trim();
      const res = await api.api.orgs[":organizationSlug"]["storyblok-connections"].discover.$post({
        param: { organizationSlug },
        json: {
          region,
          accessToken: trimmedToken || undefined,
          connectionId: trimmedToken ? undefined : connection?.id,
          spaceId: input.spaceId?.trim() || undefined,
        },
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, intl.formatMessage(messages.discoverFailed)));
      }
      const body = await res.json();
      return body.storyblokDiscovery as StoryblokDiscoveryResult;
    },
    onSuccess: (result) => {
      setDiscovery(result);
      if (result.space?.id) {
        setSpaceId(result.space.id);
        if ((!displayName.trim() || displayName === "Storyblok") && result.space.name) {
          setDisplayName(result.space.name);
        }
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.discoverFailed),
      );
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = accessToken.trim();
      if (!connection && !token) {
        throw new Error(intl.formatMessage(messages.tokenRequired));
      }
      if (!spaceId.trim()) {
        throw new Error(intl.formatMessage(messages.spaceRequired));
      }
      const fields = {
        displayName: displayName.trim() || "Storyblok",
        spaceId: spaceId.trim(),
        region,
        folderSlugs,
      };

      const res = connection
        ? await api.api.orgs[":organizationSlug"]["storyblok-connections"][":connectionId"].$patch({
            param: { organizationSlug, connectionId: connection.id },
            json: { ...fields, ...(token ? { accessToken: token } : {}) },
          })
        : await api.api.orgs[":organizationSlug"]["storyblok-connections"].$post({
            param: { organizationSlug },
            json: { ...fields, accessToken: token, enabled: true },
          });
      if (!res.ok) {
        const body: unknown = await res
          .clone()
          .json()
          .catch(() => null);
        if (
          body &&
          typeof body === "object" &&
          (body as Record<string, unknown>).error === "workspace_resource_limit_reached"
        ) {
          throw new Error(
            await readErrorMessage(res, intl.formatMessage(messages.saveLimitReached)),
          );
        }
        throw new Error(await readErrorMessage(res, intl.formatMessage(messages.saveFailed)));
      }
      return res.json();
    },
    onSuccess: async () => {
      setAccessToken("");
      await queryClient.invalidateQueries({
        queryKey: ["storyblok-connections", organizationSlug],
      });
      toast.success(intl.formatMessage(messages.saveSuccess));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveFailed));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!connection) {
        return;
      }
      const res = await api.api.orgs[":organizationSlug"]["storyblok-connections"][
        ":connectionId"
      ].$delete({
        param: { organizationSlug, connectionId: connection.id },
      });
      if (!res.ok) {
        throw new Error(intl.formatMessage(messages.deleteFailed));
      }
    },
    onSuccess: async () => {
      setDiscovery(null);
      setFolderSlugs([]);
      await queryClient.invalidateQueries({
        queryKey: ["storyblok-connections", organizationSlug],
      });
      toast.success(intl.formatMessage(messages.deleteSuccess));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.deleteFailed),
      );
    },
  });

  const spaces = discovery?.spaces ?? [];
  const folders = discovery?.folders ?? [];
  const languages = discovery?.space?.languages ?? [];
  // Folders and languages belong to the discovered space. Only allow saving
  // once discovery ran for the selected space and its plan allows export.
  const trimmedSpaceId = spaceId.trim();
  const discoveredSelectedSpace = discovery?.space?.id === trimmedSpaceId && trimmedSpaceId !== "";
  const canSave = discoveredSelectedSpace && Boolean(discovery?.translationExportAvailable);

  return (
    <CollapsibleIntegrationRow
      name={providerName}
      description={summary?.detail ?? ""}
      icon={
        summary?.logoSrc ? (
          <IntegrationLogo src={summary.logoSrc} muted={!isConnected} />
        ) : summary?.icon ? (
          <SimpleBrandIcon icon={summary.icon} colored={isConnected} />
        ) : null
      }
      isConnected={isConnected}
      userIsAdmin={!disabled}
      expanded={expanded}
      onExpandedChange={setExpanded}
      isLoading={connectionsQuery.isLoading}
      isLast={isLast}
    >
      <div className="flex flex-col gap-4 p-4 pt-0">
        {connection?.validationStatus !== "valid" && connection?.validationMessage ? (
          <Badge variant="destructive">{connection.validationMessage}</Badge>
        ) : null}
        {connection?.maskedTokenSuffix ? (
          <p className="text-muted-foreground text-sm">
            <FormattedMessage
              {...messages.maskedToken}
              values={{ suffix: connection.maskedTokenSuffix }}
            />
          </p>
        ) : null}

        <Field>
          <FieldLabel htmlFor={displayNameId}>
            <FormattedMessage {...messages.displayNameLabel} />
          </FieldLabel>
          <Input
            id={displayNameId}
            value={displayName}
            disabled={disabled}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
          />
        </Field>

        <Field>
          <FieldLabel>
            <FormattedMessage {...messages.regionLabel} />
          </FieldLabel>
          <FieldDescription>
            <FormattedMessage {...messages.regionDescription} />
          </FieldDescription>
          <Select
            value={region}
            disabled={disabled}
            onValueChange={(value) => {
              if (!value) {
                return;
              }
              setRegion(value as StoryblokRegion);
              setDiscovery(null);
            }}
          >
            <SelectTrigger>
              <SelectValue>{intl.formatMessage(REGION_LABELS[region])}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STORYBLOK_REGIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  <FormattedMessage {...REGION_LABELS[option]} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor={accessTokenId}>
            <FormattedMessage {...messages.accessTokenLabel} />
          </FieldLabel>
          <FieldDescription>
            <FormattedMessage {...messages.accessTokenDescription} />
          </FieldDescription>
          <div className="flex gap-2">
            <Input
              id={accessTokenId}
              type={showAccessToken ? "text" : "password"}
              value={accessToken}
              disabled={disabled}
              autoComplete="off"
              onChange={(event) => {
                setAccessToken(event.currentTarget.value);
                setDiscovery(null);
              }}
              placeholder={
                connection ? intl.formatMessage(messages.accessTokenKeepPlaceholder) : undefined
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              onClick={() => setShowAccessToken((current) => !current)}
            >
              {showAccessToken ? <EyeSlashIcon /> : <EyeIcon />}
            </Button>
          </div>
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || discoverMutation.isPending}
            onClick={() => discoverMutation.mutate({ spaceId })}
          >
            <FormattedMessage {...messages.loadSpaces} />
          </Button>
        </div>

        {spaces.length > 0 ? (
          <Field>
            <FieldLabel>
              <FormattedMessage {...messages.spaceLabel} />
            </FieldLabel>
            <Select
              value={spaceId}
              disabled={disabled || discoverMutation.isPending}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }
                setSpaceId(value);
                setFolderSlugs([]);
                discoverMutation.mutate({ spaceId: value });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={intl.formatMessage(messages.spacePlaceholder)}>
                  {spaces.find((space) => space.id === spaceId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {spaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {discoveredSelectedSpace && !discovery?.translationExportAvailable ? (
          <Badge variant="destructive">
            <FormattedMessage {...messages.exportUnavailable} />
          </Badge>
        ) : null}

        {discoveredSelectedSpace ? (
          languages.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              <FormattedMessage
                {...messages.languagesLabel}
                values={{
                  languages: intl.formatList(
                    languages.map((language) => language.name || language.code),
                    { type: "conjunction" },
                  ),
                }}
              />
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              <FormattedMessage {...messages.noLanguages} />
            </p>
          )
        ) : null}

        {discoveredSelectedSpace && folders.length > 0 ? (
          <Field>
            <FieldLabel>
              <FormattedMessage {...messages.foldersLabel} />
            </FieldLabel>
            <FieldDescription>
              <FormattedMessage {...messages.foldersDescription} />
            </FieldDescription>
            <div className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-md border p-3">
              {folders.map((folder) => {
                const checked = folderSlugs.includes(folder.fullSlug);
                return (
                  <label key={folder.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(next) => {
                        setFolderSlugs((current) =>
                          next === true
                            ? [...current, folder.fullSlug]
                            : current.filter((slug) => slug !== folder.fullSlug),
                        );
                      }}
                    />
                    <span>
                      {folder.name}{" "}
                      <span className="text-muted-foreground">({folder.fullSlug})</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canSave ? (
            <Button
              type="button"
              disabled={disabled || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <FloppyDiskIcon />
              <FormattedMessage {...messages.saveConnection} />
            </Button>
          ) : null}
          {connection ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              <FormattedMessage {...messages.disconnect} />
            </Button>
          ) : null}
        </div>
      </div>
    </CollapsibleIntegrationRow>
  );
}
