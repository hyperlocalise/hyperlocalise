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
import { useId, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";
import { buildOrganizationPath, buildProjectPath } from "@/components/app-shell/navigation-config";
import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { GuidelineDocumentAssignments } from "./guideline-document-assignments";
import { guidelineDocumentDetailMessages as messages } from "./guideline-document-detail-content.messages";
import {
  guidelineDocumentsQueryKey,
  guidelineDocumentDisplayStatus,
} from "./guideline-documents-section";
import { GuidelineTextDocumentDialog } from "./guideline-text-document-dialog";

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

/**
 * Dedicated page for a single guideline document: metadata, content
 * preview, and (for org-wide documents) project assignments.
 */
export function GuidelineDocumentDetailContent({
  organizationSlug,
  projectId,
  documentId,
  canUpdate,
}: {
  organizationSlug: string;
  projectId?: string;
  documentId: string;
  canUpdate: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client, loading } = useGoSvcClient();
  const switchId = useId();
  const [editing, setEditing] = useState(false);

  const backHref = projectId
    ? buildProjectPath(organizationSlug, projectId, "knowledge")
    : buildOrganizationPath(organizationSlug, "knowledge");

  const documentQuery = useQuery({
    queryKey: ["guideline-document", organizationSlug, projectId, documentId],
    enabled: !loading,
    queryFn: ({ signal }) =>
      client.guidelines.getDocument(organizationSlug, documentId, projectId, { signal }),
  });

  const updateMandatory = useMutation({
    mutationFn: (mandatory: boolean) =>
      client.guidelines.updateDocument(organizationSlug, documentId, { mandatory }, projectId),
    onError: () => toast.error(intl.formatMessage(messages.updateFailed)),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["guideline-document", organizationSlug, projectId, documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: guidelineDocumentsQueryKey(organizationSlug, projectId),
      });
    },
  });

  if (loading || documentQuery.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (documentQuery.isError) {
    return (
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
        <FormattedMessage {...messages.loadFailed} />
        <Button type="button" variant="outline" size="sm" onClick={() => documentQuery.refetch()}>
          <FormattedMessage {...messages.retry} />
        </Button>
      </div>
    );
  }

  const document = documentQuery.data;
  const isText = document.contentType.startsWith("text/");
  const mandatory = updateMandatory.isPending
    ? (updateMandatory.variables ?? document.mandatory)
    : document.mandatory;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <Button
          type="button"
          nativeButton={false}
          variant="ghost"
          size="sm"
          render={<Link href={backHref} />}
        >
          <FormattedMessage {...messages.backToGuideline} />
        </Button>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TypographyH1>{document.title}</TypographyH1>
          <StatusBadge status={guidelineDocumentDisplayStatus(document)} />
        </div>
        <TypographyP tone="subtle">
          {document.filename} · {document.locale ?? intl.formatMessage(messages.allLocales)} ·{" "}
          <FormattedMessage {...messages.characters} values={{ count: document.characterCount }} />
        </TypographyP>
      </div>

      {canUpdate ? (
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor={switchId}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Switch
              id={switchId}
              size="sm"
              checked={mandatory}
              disabled={updateMandatory.isPending || document.status === "failed"}
              onCheckedChange={(checked) => updateMandatory.mutate(checked)}
            />
            <FormattedMessage {...messages.mandatory} />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilSimpleIcon data-icon="inline-start" />
            <FormattedMessage {...messages.edit} />
          </Button>
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <TypographyH2 className="pb-0 text-lg tracking-[-0.02em]">
          <FormattedMessage {...messages.contentTitle} />
        </TypographyH2>
        {isText ? (
          <div className="rounded-xl border border-border px-4 py-3">
            <Streamdown>{document.content ?? ""}</Streamdown>
          </div>
        ) : (
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.binaryContentNotice} />
          </TypographyP>
        )}
      </section>

      {!projectId && document.projectId == null ? (
        <GuidelineDocumentAssignments
          organizationSlug={organizationSlug}
          documentId={document.id}
          canUpdate={canUpdate}
        />
      ) : null}

      {canUpdate ? (
        <GuidelineTextDocumentDialog
          open={editing}
          onOpenChange={setEditing}
          organizationSlug={organizationSlug}
          projectId={projectId}
          document={editing ? document : null}
        />
      ) : null}
    </div>
  );
}
