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
import { useState } from "react";
import { BroadcastIcon, CopyIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

import { projectCdnDistributionsPanelMessages as messages } from "./project-cdn-distributions-panel.messages";
import { ProjectSettingsSectionHeading } from "./project-settings-section-heading";

const HOSTED_DESTINATION = "hosted";

type OtaDistributionView = {
  id: string;
  name: string;
  publicHash: string;
  format: "json" | "android_xml" | "ios_strings";
  fileIds: string[];
  locales: string[];
  destinationId: string | null;
  destinationName: string | null;
  manifestUrl: string | null;
  revokedAt: string | null;
  latestRelease: { releasedAt: string; status: string } | null;
};

type OtaFileOption = { id: string; sourcePath: string };
type OtaDestinationOption = { id: string; name: string };

const FORMAT_MESSAGES = {
  json: messages.formatJson,
  android_xml: messages.formatAndroid,
  ios_strings: messages.formatIos,
} as const;

function distributionsApi() {
  return apiClient.api.orgs[":organizationSlug"].projects[":projectId"]["ota-distributions"];
}

function queryKey(organizationSlug: string, projectId: string) {
  return ["ota-distributions", organizationSlug, projectId];
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return fallback;
}

export function ProjectCdnDistributionsPanel({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const api = distributionsApi();
  const param = { organizationSlug, projectId };

  const listQuery = useQuery({
    queryKey: queryKey(organizationSlug, projectId),
    queryFn: async () => {
      const response = await api.$get({ param });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadFailed));
      }
      const body = (await response.json()) as {
        distributions?: OtaDistributionView[];
        files?: OtaFileOption[];
        locales?: string[];
        destinations?: OtaDestinationOption[];
      };
      return {
        distributions: body.distributions ?? [],
        files: body.files ?? [],
        locales: body.locales ?? [],
        destinations: body.destinations ?? [],
      };
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKey(organizationSlug, projectId) });

  const release = useMutation({
    mutationFn: async (distributionId: string) => {
      const response = await api[":distributionId"].release.$post({
        param: { ...param, distributionId },
      });
      if (!response.ok) {
        throw new Error(await readError(response, intl.formatMessage(messages.actionFailed)));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.releasedToast));
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const rotate = useMutation({
    mutationFn: async (distributionId: string) => {
      const response = await api[":distributionId"].rotate.$post({
        param: { ...param, distributionId },
      });
      if (!response.ok) {
        throw new Error(await readError(response, intl.formatMessage(messages.actionFailed)));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.rotatedToast));
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: async (distributionId: string) => {
      const response = await api[":distributionId"].revoke.$post({
        param: { ...param, distributionId },
      });
      if (!response.ok) {
        throw new Error(await readError(response, intl.formatMessage(messages.actionFailed)));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.revokedToast));
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  async function copyManifestUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(intl.formatMessage(messages.copied));
    } catch {
      toast.error(intl.formatMessage(messages.actionFailed));
    }
  }

  const distributions = listQuery.data?.distributions ?? [];

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
      <ProjectSettingsSectionHeading
        icon={BroadcastIcon}
        tone="beam"
        title={<FormattedMessage {...messages.title} />}
        description={<FormattedMessage {...messages.description} />}
        actions={
          <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon className="size-4" />
            <FormattedMessage {...messages.addButton} />
          </Button>
        }
      />

      {listQuery.isLoading ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.loading} />
        </TypographyP>
      ) : listQuery.isError ? (
        <TypographyP size="small" tone="critical">
          <FormattedMessage {...messages.loadFailed} />
        </TypographyP>
      ) : distributions.length === 0 ? (
        <div className="grid gap-1">
          <TypographyP size="small" weight="medium">
            <FormattedMessage {...messages.emptyTitle} />
          </TypographyP>
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.emptyDescription} />
          </TypographyP>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border border-border bg-background">
          {distributions.map((distribution) => (
            <li key={distribution.id} className="grid gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <TypographyP size="small" weight="medium">
                      {distribution.name}
                    </TypographyP>
                    <Badge variant="outline">
                      <FormattedMessage {...FORMAT_MESSAGES[distribution.format]} />
                    </Badge>
                    {distribution.revokedAt ? (
                      <Badge variant="destructive">
                        <FormattedMessage {...messages.revoked} />
                      </Badge>
                    ) : null}
                  </div>
                  <TypographyP size="xsmall" tone="subtle">
                    {distribution.destinationName ?? intl.formatMessage(messages.hostedCdn)}
                  </TypographyP>
                  {distribution.manifestUrl ? (
                    <code className="truncate font-mono text-xs">{distribution.manifestUrl}</code>
                  ) : null}
                  <TypographyP size="xsmall" tone="subtle">
                    {distribution.latestRelease ? (
                      <FormattedMessage
                        {...messages.released}
                        values={{
                          when: new Date(distribution.latestRelease.releasedAt).toLocaleString(),
                        }}
                      />
                    ) : (
                      <FormattedMessage {...messages.neverReleased} />
                    )}
                  </TypographyP>
                </div>
                {distribution.revokedAt ? null : (
                  <div className="flex flex-wrap gap-2">
                    {distribution.manifestUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => copyManifestUrl(distribution.manifestUrl!)}
                      >
                        <CopyIcon className="size-4" />
                        <FormattedMessage {...messages.copyUrl} />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      disabled={release.isPending}
                      onClick={() => release.mutate(distribution.id)}
                    >
                      <FormattedMessage {...messages.release} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={rotate.isPending}
                      onClick={() => rotate.mutate(distribution.id)}
                    >
                      <FormattedMessage {...messages.rotate} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={revoke.isPending}
                      onClick={() => setRevokeId(distribution.id)}
                    >
                      <FormattedMessage {...messages.revoke} />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={revokeId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.revokeConfirmTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.revokeConfirmDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <FormattedMessage {...messages.cancel} />
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={revoke.isPending || revokeId === null}
              onClick={() => {
                if (!revokeId) {
                  return;
                }
                revoke.mutate(revokeId, {
                  onSettled: () => setRevokeId(null),
                });
              }}
            >
              <FormattedMessage {...messages.revokeConfirm} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateDistributionDialog
        open={isCreateOpen}
        files={listQuery.data?.files ?? []}
        locales={listQuery.data?.locales ?? []}
        destinations={listQuery.data?.destinations ?? []}
        onOpenChange={setIsCreateOpen}
        onSubmit={async (payload) => {
          const response = await api.$post({ param, json: payload });
          if (!response.ok) {
            throw new Error(await readError(response, intl.formatMessage(messages.actionFailed)));
          }
          toast.success(intl.formatMessage(messages.createdToast));
          setIsCreateOpen(false);
          await invalidate();
        }}
      />
    </section>
  );
}

function CreateDistributionDialog({
  open,
  files,
  locales,
  destinations,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  files: OtaFileOption[];
  locales: string[];
  destinations: OtaDestinationOption[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    name: string;
    format: "json" | "android_xml" | "ios_strings";
    fileIds: string[];
    locales: string[];
    destinationId: string | null;
  }) => Promise<void>;
}) {
  const intl = useIntl();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<"json" | "android_xml" | "ios_strings">("json");
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
  const [destinationId, setDestinationId] = useState(HOSTED_DESTINATION);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleValue(current: string[], value: string) {
    return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        format,
        fileIds,
        locales: selectedLocales,
        destinationId: destinationId === HOSTED_DESTINATION ? null : destinationId,
      });
      setName("");
      setFormat("json");
      setFileIds([]);
      setSelectedLocales([]);
      setDestinationId(HOSTED_DESTINATION);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.actionFailed),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.dialogTitle} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.dialogDescription} />
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cdn-distribution-name">
              <FormattedMessage {...messages.nameLabel} />
            </FieldLabel>
            <Input
              id="cdn-distribution-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel>
              <FormattedMessage {...messages.formatLabel} />
            </FieldLabel>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as "json" | "android_xml" | "ios_strings")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">
                  <FormattedMessage {...messages.formatJson} />
                </SelectItem>
                <SelectItem value="android_xml">
                  <FormattedMessage {...messages.formatAndroid} />
                </SelectItem>
                <SelectItem value="ios_strings">
                  <FormattedMessage {...messages.formatIos} />
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field className="gap-1.5">
            <FieldLabel>
              <FormattedMessage {...messages.filesLabel} />
            </FieldLabel>
            <div className="grid gap-2">
              {files.map((file) => (
                <label key={file.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={fileIds.includes(file.id)}
                    onCheckedChange={() => setFileIds((current) => toggleValue(current, file.id))}
                  />
                  <span className="font-mono text-xs">{file.sourcePath}</span>
                </label>
              ))}
            </div>
          </Field>
          <Field className="gap-1.5">
            <FieldLabel>
              <FormattedMessage {...messages.localesLabel} />
            </FieldLabel>
            <div className="flex flex-wrap gap-2">
              {locales.map((locale) => (
                <label key={locale} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedLocales.includes(locale)}
                    onCheckedChange={() =>
                      setSelectedLocales((current) => toggleValue(current, locale))
                    }
                  />
                  {locale}
                </label>
              ))}
            </div>
          </Field>
          <Field className="gap-1.5">
            <FieldLabel>
              <FormattedMessage {...messages.destinationLabel} />
            </FieldLabel>
            <Select
              value={destinationId}
              onValueChange={(value) => {
                if (value) {
                  setDestinationId(value);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HOSTED_DESTINATION}>
                  <FormattedMessage {...messages.hostedCdn} />
                </SelectItem>
                {destinations.map((destination) => (
                  <SelectItem key={destination.id} value={destination.id}>
                    {destination.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              <FormattedMessage {...messages.customDestinationsHint} />
            </FieldDescription>
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            disabled={
              isSubmitting ||
              name.trim().length === 0 ||
              fileIds.length === 0 ||
              selectedLocales.length === 0
            }
            onClick={() => void handleSubmit()}
          >
            <FormattedMessage {...messages.create} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
