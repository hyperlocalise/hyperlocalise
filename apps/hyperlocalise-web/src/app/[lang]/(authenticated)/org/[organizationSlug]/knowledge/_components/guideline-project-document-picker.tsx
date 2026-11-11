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
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import {
  guidelineDocumentAssignmentsQueryKey,
} from "./guideline-document-assignments";
import { guidelineDocumentsQueryKey } from "./guideline-documents-section";
import { guidelineProjectDocumentPickerMessages as messages } from "./guideline-project-document-picker.messages";

/** Org-wide guidelines that can be attached to a project (not global, not already assigned). */
export function assignableGuidelinesForProject(
  documents: GuidelineDocument[],
  assignments: Map<string, string[]>,
  projectId: string,
): GuidelineDocument[] {
  return documents.filter((document) => {
    if (document.isGlobal) {
      return false;
    }
    if (document.projectId != null) {
      return false;
    }
    const projectIds = assignments.get(document.id) ?? [];
    return !projectIds.includes(projectId);
  });
}

export function GuidelineProjectDocumentPicker({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client, loading } = useGoSvcClient();
  const [selected, setSelected] = useState("");

  const documentsQuery = useQuery({
    queryKey: guidelineDocumentsQueryKey(organizationSlug),
    enabled: !loading,
    queryFn: ({ signal }) => client.guidelines.listDocuments(organizationSlug, undefined, { signal }),
  });
  const assignmentsQuery = useQuery({
    queryKey: guidelineDocumentAssignmentsQueryKey(organizationSlug),
    enabled: !loading,
    queryFn: ({ signal }) =>
      client.guidelines.listAllDocumentAssignments(organizationSlug, { signal }),
  });

  const assignments = useMemo(
    () =>
      new Map(
        (assignmentsQuery.data?.assignments ?? []).map((entry) => [
          entry.documentId,
          entry.projectIds,
        ] as const),
      ),
    [assignmentsQuery.data],
  );

  const available = useMemo(
    () =>
      assignableGuidelinesForProject(documentsQuery.data ?? [], assignments, projectId).sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
    [assignments, documentsQuery.data, projectId],
  );

  const attach = useMutation({
    mutationFn: async (documentId: string) => {
      try {
        await client.guidelines.attachDocumentProject(organizationSlug, documentId, projectId);
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.assignFailed)), {
          cause: error,
        });
      }
    },
    onSuccess: () => {
      setSelected("");
      void queryClient.invalidateQueries({
        queryKey: guidelineDocumentAssignmentsQueryKey(organizationSlug),
      });
      void queryClient.invalidateQueries({
        queryKey: guidelineDocumentsQueryKey(organizationSlug, projectId),
      });
    },
    onError: (error) => toast.error(error.message),
  });

  const selectedTitle = selected
    ? (available.find((document) => document.id === selected)?.title ?? selected)
    : null;

  if (loading || documentsQuery.isPending || assignmentsQuery.isPending) {
    return <Skeleton className="h-20 w-full" />;
  }
  if (available.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <TypographyH2 className="pb-0 text-lg tracking-[-0.02em]">
          <FormattedMessage {...messages.sectionTitle} />
        </TypographyH2>
        <TypographyP size="small" tone="subtle" className="mt-1 max-w-2xl leading-6">
          <FormattedMessage {...messages.sectionDescription} />
        </TypographyP>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-4 py-3">
        <Select value={selected} onValueChange={(value) => setSelected(value ?? "")}>
          <SelectTrigger className="w-full min-w-56 sm:w-72">
            {selectedTitle ? (
              <span className="truncate">{selectedTitle}</span>
            ) : (
              <SelectValue placeholder={intl.formatMessage(messages.selectGuideline)} />
            )}
          </SelectTrigger>
          <SelectContent>
            {available.map((document) => (
              <SelectItem key={document.id} value={document.id} label={document.title}>
                {document.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!selected || attach.isPending}
          onClick={() => attach.mutate(selected)}
        >
          <FormattedMessage {...messages.assign} />
        </Button>
      </div>
    </section>
  );
}
