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
import { useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TrashIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { guidelineDocumentsSectionMessages as messages } from "./guideline-documents-section.messages";

const PROCESSING_POLL_MS = 3000;

export function guidelineDocumentsQueryKey(organizationSlug: string, projectId?: string) {
  return projectId
    ? (["guideline-documents", organizationSlug, projectId] as const)
    : (["guideline-documents", organizationSlug] as const);
}

function errorMessage(code: string | null): MessageDescriptor {
  switch (code) {
    case "no_text":
      return messages.errorNoText;
    case "unsupported_format":
      return messages.errorUnsupported;
    case "too_large":
      return messages.errorTooLarge;
    case "encrypted":
      return messages.errorEncrypted;
    case "malformed":
      return messages.errorMalformed;
    default:
      return messages.errorGeneric;
  }
}

function StatusBadge({ status }: { status: GuidelineDocument["status"] }) {
  if (status === "ready") {
    return (
      <Badge variant="outline">
        <FormattedMessage {...messages.ready} />
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive">
        <FormattedMessage {...messages.failed} />
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <FormattedMessage {...messages.processing} />
    </Badge>
  );
}

/** Uploads one file and refreshes the matching document list. */
export function useGuidelineDocumentUpload(organizationSlug: string, projectId?: string) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client } = useGoSvcClient();

  return useMutation({
    mutationFn: (file: File) =>
      client.guidelines.uploadDocument(organizationSlug, { file, filename: file.name }, projectId),
    onSuccess: (_document, file) => {
      toast.success(intl.formatMessage(messages.uploadStarted, { filename: file.name }));
    },
    onError: (error, file) => {
      toast.error(intl.formatMessage(messages.uploadFailed, { filename: file.name }), {
        description: error.message,
      });
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: guidelineDocumentsQueryKey(organizationSlug, projectId),
      }),
  });
}

function GuidelineDocumentRow({
  client,
  organizationSlug,
  projectId,
  document,
  canUpdate,
}: {
  client: GoSvcClient;
  organizationSlug: string;
  projectId?: string;
  document: GuidelineDocument;
  canUpdate: boolean;
}) {
  const intl = useIntl();
  const switchId = useId();
  const queryClient = useQueryClient();
  const queryKey = guidelineDocumentsQueryKey(organizationSlug, projectId);

  const updateMandatory = useMutation({
    mutationFn: (mandatory: boolean) =>
      client.guidelines.updateDocument(organizationSlug, document.id, { mandatory }, projectId),
    onError: () => toast.error(intl.formatMessage(messages.updateFailed)),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: () => client.guidelines.deleteDocument(organizationSlug, document.id, projectId),
    onError: () => toast.error(intl.formatMessage(messages.deleteFailed)),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const mandatory = updateMandatory.isPending
    ? (updateMandatory.variables ?? document.mandatory)
    : document.mandatory;

  return (
    <Item variant="outline" size="sm">
      <ItemContent className="min-w-0">
        <ItemTitle className="flex flex-wrap items-center gap-2">
          <span className="truncate">{document.title}</span>
          <StatusBadge status={document.status} />
        </ItemTitle>
        <ItemDescription className="flex flex-wrap gap-x-2">
          <span className="truncate">{document.filename}</span>
          <span aria-hidden="true">·</span>
          <span>{document.locale ?? <FormattedMessage {...messages.allLocales} />}</span>
          {document.status === "ready" ? (
            <>
              <span aria-hidden="true">·</span>
              <FormattedMessage
                {...messages.characters}
                values={{ count: document.characterCount }}
              />
            </>
          ) : null}
        </ItemDescription>
        {document.status === "failed" ? (
          <p className="text-xs text-destructive">
            <FormattedMessage {...errorMessage(document.errorCode)} />
          </p>
        ) : null}
        {document.status === "ready" && document.truncated ? (
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...messages.truncated} />
          </p>
        ) : null}
      </ItemContent>
      {canUpdate ? (
        <ItemActions>
          <label
            htmlFor={switchId}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Switch
              id={switchId}
              size="sm"
              checked={mandatory}
              disabled={updateMandatory.isPending || document.status === "failed"}
              onCheckedChange={(checked) => updateMandatory.mutate(checked)}
            />
            <FormattedMessage {...messages.alwaysApply} />
          </label>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={intl.formatMessage(messages.delete)}
                  disabled={remove.isPending}
                />
              }
            >
              <TrashIcon />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <FormattedMessage {...messages.deleteTitle} />
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <FormattedMessage {...messages.deleteBody} values={{ title: document.title }} />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <FormattedMessage {...messages.cancel} />
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending}
                >
                  <FormattedMessage {...messages.delete} />
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ItemActions>
      ) : null}
    </Item>
  );
}

export function GuidelineDocumentsSection({
  organizationSlug,
  projectId,
  canUpdate,
}: {
  organizationSlug: string;
  projectId?: string;
  canUpdate: boolean;
}) {
  const { client, loading } = useGoSvcClient();
  const query = useQuery({
    queryKey: guidelineDocumentsQueryKey(organizationSlug, projectId),
    enabled: !loading,
    queryFn: ({ signal }) =>
      client.guidelines.listDocuments(organizationSlug, projectId, { signal }),
    refetchInterval: (current) =>
      current.state.data?.some((document) => document.status === "processing")
        ? PROCESSING_POLL_MS
        : false,
  });

  if (loading || query.isPending) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (query.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
        <FormattedMessage {...messages.loadFailed} />
        <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
          <FormattedMessage {...messages.retry} />
        </Button>
      </div>
    );
  }
  if (query.data.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-base font-medium text-foreground">
          <FormattedMessage {...messages.title} />
        </h2>
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.description} />
        </p>
      </div>
      <ItemGroup className="gap-2">
        {query.data.map((document) => (
          <GuidelineDocumentRow
            key={document.id}
            client={client}
            organizationSlug={organizationSlug}
            projectId={projectId}
            document={document}
            canUpdate={canUpdate}
          />
        ))}
      </ItemGroup>
    </section>
  );
}
