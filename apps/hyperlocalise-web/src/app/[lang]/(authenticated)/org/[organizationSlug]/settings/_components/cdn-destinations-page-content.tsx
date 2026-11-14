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
import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

import { cdnDestinationsPageContentMessages as messages } from "./cdn-destinations-page-content.messages";
import { SettingsPageBody, SettingsPageHeader } from "./settings-page-chrome";

type CdnDestinationView = {
  id: string;
  name: string;
  bucket: string;
  region: string;
  endpoint: string | null;
  publicBaseUrl: string;
  usePathStyle: boolean;
  maskedSecretSuffix: string;
  validationStatus: string;
  validationMessage: string | null;
};

function destinationsApi() {
  return apiClient.api.orgs[":organizationSlug"]["cdn-destinations"];
}

function queryKey(organizationSlug: string) {
  return ["cdn-destinations", organizationSlug];
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return fallback;
}

export function CdnDestinationsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const api = destinationsApi();
  const param = { organizationSlug };

  const listQuery = useQuery({
    queryKey: queryKey(organizationSlug),
    queryFn: async () => {
      const response = await api.$get({ param });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadFailed));
      }
      const body = (await response.json()) as { destinations?: CdnDestinationView[] };
      return body.destinations ?? [];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKey(organizationSlug) });

  const deleteDestination = useMutation({
    mutationFn: async (destinationId: string) => {
      const response = await api[":destinationId"].$delete({
        param: { ...param, destinationId },
      });
      if (!response.ok) {
        throw new Error(await readError(response, intl.formatMessage(messages.actionFailed)));
      }
    },
    onSuccess: async () => {
      setDeletingId(null);
      toast.success(intl.formatMessage(messages.deleted));
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const destinations = listQuery.data ?? [];

  return (
    <SettingsPageBody width="wide">
      <Rows spacing="4u">
        <Row spacing="2u" align="spaceBetween" alignY="start">
          <div className="min-w-0 flex-1">
            <SettingsPageHeader title={intl.formatMessage(messages.pageTitle)} />
            <TypographyP className="mt-1 max-w-2xl" size="small" tone="subtle">
              <FormattedMessage {...messages.pageDescription} />
            </TypographyP>
          </div>
          <Button type="button" className="shrink-0" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            <FormattedMessage {...messages.addButton} />
          </Button>
        </Row>

        <section aria-label={intl.formatMessage(messages.sectionAriaLabel)}>
          {listQuery.isLoading ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.loading} />
            </TypographyP>
          ) : listQuery.isError ? (
            <TypographyP size="small" weight="medium" tone="critical">
              <FormattedMessage {...messages.loadFailed} />
            </TypographyP>
          ) : destinations.length === 0 ? (
            <Rows spacing="1u">
              <TypographyP size="small" weight="medium" tone="content">
                <FormattedMessage {...messages.emptyTitle} />
              </TypographyP>
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...messages.emptyDescription} />
              </TypographyP>
            </Rows>
          ) : (
            <ul className="divide-y rounded-lg border">
              {destinations.map((destination) => (
                <li key={destination.id} className="grid gap-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <TypographyP size="small" weight="medium">
                        {destination.name}
                      </TypographyP>
                      <TypographyP size="xsmall" tone="subtle">
                        {destination.bucket} · {destination.region}
                        {destination.usePathStyle ? " · path-style" : ""}
                      </TypographyP>
                      <code className="truncate font-mono text-xs">
                        {destination.publicBaseUrl}
                      </code>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">…{destination.maskedSecretSuffix}</Badge>
                        <Badge variant="outline">{destination.validationStatus}</Badge>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeletingId(destination.id)}
                    >
                      <FormattedMessage {...messages.delete} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Rows>

      <CreateDestinationDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={async (payload) => {
          const response = await api.$post({ param, json: payload });
          if (!response.ok) {
            throw new Error(await readError(response, intl.formatMessage(messages.actionFailed)));
          }
          toast.success(intl.formatMessage(messages.created));
          setIsCreateOpen(false);
          await invalidate();
        }}
      />

      <Dialog open={Boolean(deletingId)} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.deleteTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.deleteDescription} />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingId(null)}>
              <FormattedMessage {...messages.cancel} />
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deletingId || deleteDestination.isPending}
              onClick={() => deletingId && deleteDestination.mutate(deletingId)}
            >
              <FormattedMessage {...messages.delete} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageBody>
  );
}

function CreateDestinationDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    name: string;
    bucket: string;
    region: string;
    endpoint?: string | null;
    publicBaseUrl: string;
    usePathStyle: boolean;
    accessKeyId: string;
    secretAccessKey: string;
  }) => Promise<void>;
}) {
  const intl = useIntl();
  const [name, setName] = useState("");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [endpoint, setEndpoint] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [usePathStyle, setUsePathStyle] = useState(false);
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        bucket,
        region,
        endpoint: endpoint.trim() || null,
        publicBaseUrl,
        usePathStyle,
        accessKeyId,
        secretAccessKey,
      });
      setName("");
      setBucket("");
      setRegion("us-east-1");
      setEndpoint("");
      setPublicBaseUrl("");
      setUsePathStyle(false);
      setAccessKeyId("");
      setSecretAccessKey("");
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
        <div className="grid gap-3">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cdn-destination-name">
              <FormattedMessage {...messages.nameLabel} />
            </FieldLabel>
            <Input
              id="cdn-destination-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cdn-destination-bucket">
              <FormattedMessage {...messages.bucketLabel} />
            </FieldLabel>
            <Input
              id="cdn-destination-bucket"
              value={bucket}
              onChange={(event) => setBucket(event.target.value)}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cdn-destination-region">
              <FormattedMessage {...messages.regionLabel} />
            </FieldLabel>
            <Input
              id="cdn-destination-region"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cdn-destination-endpoint">
              <FormattedMessage {...messages.endpointLabel} />
            </FieldLabel>
            <Input
              id="cdn-destination-endpoint"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cdn-destination-public-url">
              <FormattedMessage {...messages.publicBaseUrlLabel} />
            </FieldLabel>
            <Input
              id="cdn-destination-public-url"
              value={publicBaseUrl}
              onChange={(event) => setPublicBaseUrl(event.target.value)}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cdn-destination-access-key">
              <FormattedMessage {...messages.accessKeyLabel} />
            </FieldLabel>
            <Input
              id="cdn-destination-access-key"
              value={accessKeyId}
              autoComplete="off"
              onChange={(event) => setAccessKeyId(event.target.value)}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cdn-destination-secret">
              <FormattedMessage {...messages.secretKeyLabel} />
            </FieldLabel>
            <Input
              id="cdn-destination-secret"
              type="password"
              value={secretAccessKey}
              autoComplete="new-password"
              onChange={(event) => setSecretAccessKey(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={usePathStyle}
              onCheckedChange={(checked) => setUsePathStyle(checked === true)}
            />
            <FormattedMessage {...messages.pathStyleLabel} />
          </label>
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
              bucket.trim().length === 0 ||
              publicBaseUrl.trim().length === 0 ||
              accessKeyId.length < 16 ||
              secretAccessKey.length < 16
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
