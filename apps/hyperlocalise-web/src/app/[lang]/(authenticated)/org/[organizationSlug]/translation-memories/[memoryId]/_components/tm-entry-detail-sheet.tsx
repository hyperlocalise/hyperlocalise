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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedDate, FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type {
  MemoryEntryActor,
  MemoryEntryAuditEventRecord,
  MemoryEntryDetailResponse,
} from "@/api/routes/memory/memory.schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
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
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";
import { ApiResponseError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { formatLocaleOptionLabel } from "@/lib/i18n/locale-display-names.messages";

import { tmEntryDetailMessages as messages } from "./tm-entry-detail.messages";
import {
  fetchTmEntryDetail,
  isStaleMemoryEntryError,
  tmEntryDetailQueryKey,
} from "./tm-entry-detail";
import { TmEntryLocaleField } from "./tm-entry-locale-field";
import { buildTmEntryLocaleOptions } from "./tm-entry-list-state";
import { TM_ENTRY_SEARCH_QUERY_KEY } from "./tm-entry-search";

type EntryForm = {
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  reviewStatus: "approved" | "pending" | "rejected";
  context: string;
};

const REVIEW_STATUSES = ["approved", "pending", "rejected"] as const;

function formFromDetail(detail: MemoryEntryDetailResponse): EntryForm {
  return {
    sourceLocale: detail.memoryEntry.sourceLocale,
    targetLocale: detail.memoryEntry.targetLocale,
    sourceText: detail.memoryEntry.sourceText,
    targetText: detail.memoryEntry.targetText,
    reviewStatus:
      detail.memoryEntry.reviewStatus === "pending" ||
      detail.memoryEntry.reviewStatus === "rejected"
        ? detail.memoryEntry.reviewStatus
        : "approved",
    context: detail.provenance.context ?? "",
  };
}

function eventLabel(event: MemoryEntryAuditEventRecord) {
  switch (event.eventType) {
    case "created":
      return messages.eventCreated;
    case "updated":
      return messages.eventUpdated;
    case "reviewed":
      return messages.eventReviewed;
    case "imported":
      return messages.eventImported;
    case "synced":
      return messages.eventSynced;
  }
}

function ProvenanceRow({
  label,
  actor,
  empty,
}: {
  label: ReactNode;
  actor: MemoryEntryActor;
  empty: string;
}) {
  if (!actor.at && !actor.displayName && !actor.userId) {
    return (
      <div className="grid gap-0.5">
        <TypographyP className="text-xs font-medium text-muted-foreground">{label}</TypographyP>
        <TypographyP className="text-sm text-muted-foreground">{empty}</TypographyP>
      </div>
    );
  }

  return (
    <div className="grid gap-0.5">
      <TypographyP className="text-xs font-medium text-muted-foreground">{label}</TypographyP>
      <TypographyP className="text-sm">
        {actor.displayName ?? empty}
        {actor.at ? (
          <>
            {" · "}
            <FormattedDate
              value={actor.at}
              year="numeric"
              month="short"
              day="numeric"
              hour="numeric"
              minute="2-digit"
            />
          </>
        ) : null}
      </TypographyP>
    </div>
  );
}

export function TmEntryDetailSheet({
  organizationSlug,
  memoryId,
  entryId,
  localeCoverage,
  canManageMemories,
  open,
  onOpenChange,
  onOpenVariant,
  startInEditMode = false,
}: {
  organizationSlug: string;
  memoryId: string;
  entryId: string | null;
  localeCoverage: string[];
  canManageMemories: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenVariant: (entryId: string) => void;
  startInEditMode?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [staleConflict, setStaleConflict] = useState(false);
  const [form, setForm] = useState<EntryForm | null>(null);

  const detailQuery = useQuery({
    queryKey: entryId ? tmEntryDetailQueryKey(organizationSlug, memoryId, entryId) : ["idle"],
    enabled: Boolean(open && entryId),
    queryFn: ({ signal }) =>
      fetchTmEntryDetail({
        organizationSlug,
        memoryId,
        entryId: entryId ?? "",
        signal,
        fallbackMessage: intl.formatMessage(messages.error),
      }),
  });

  const detail = detailQuery.data;
  const canEdit = Boolean(canManageMemories && detail?.capabilities.canEdit);

  useEffect(() => {
    if (!detail) {
      return;
    }
    setForm(formFromDetail(detail));
    setStaleConflict(false);
    setIsEditing(startInEditMode && canManageMemories && detail.capabilities.canEdit);
  }, [canManageMemories, detail, startInEditMode]);

  const localeOptions = useMemo(
    () =>
      buildTmEntryLocaleOptions({
        localeCoverage: [
          ...localeCoverage,
          detail?.memoryEntry.sourceLocale,
          detail?.memoryEntry.targetLocale,
          form?.sourceLocale,
          form?.targetLocale,
        ].filter((locale): locale is string => Boolean(locale)),
      }),
    [
      detail?.memoryEntry.sourceLocale,
      detail?.memoryEntry.targetLocale,
      form?.sourceLocale,
      form?.targetLocale,
      localeCoverage,
    ],
  );

  const saveEntry = useMutation({
    mutationFn: async (values: EntryForm) => {
      if (!detail || !entryId) {
        throw new Error(intl.formatMessage(messages.saveFailed));
      }
      const nextMetadata = {
        ...detail.memoryEntry.metadata,
        ...(values.context.trim() ? { context: values.context.trim() } : { context: undefined }),
      };
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].entries[":entryId"].$patch({
        param: { organizationSlug, memoryId, entryId },
        json: {
          expectedVersion: detail.memoryEntry.version,
          sourceLocale: values.sourceLocale.trim(),
          targetLocale: values.targetLocale.trim(),
          sourceText: values.sourceText.trim(),
          targetText: values.targetText.trim(),
          reviewStatus: values.reviewStatus,
          metadata: Object.fromEntries(
            Object.entries(nextMetadata).filter(([, value]) => value !== undefined),
          ),
        },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.saveFailed));
      }
      return (await response.json()) as MemoryEntryDetailResponse;
    },
    onSuccess: async (body) => {
      if (entryId) {
        queryClient.setQueryData(tmEntryDetailQueryKey(organizationSlug, memoryId, entryId), body);
      }
      await queryClient.invalidateQueries({
        queryKey: [TM_ENTRY_SEARCH_QUERY_KEY, organizationSlug, memoryId],
      });
      setIsEditing(false);
      setStaleConflict(false);
      toast.success(intl.formatMessage(messages.saved));
    },
    onError: (error) => {
      if (isStaleMemoryEntryError(error)) {
        setStaleConflict(true);
        return;
      }
      toast.error(error instanceof ApiResponseError ? error.message : error.message);
    },
  });

  const metadataEntries = Object.entries(detail?.memoryEntry.metadata ?? {}).filter(
    ([key, value]) => key !== "context" && value !== undefined && value !== null && value !== "",
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
        aria-busy={detailQuery.isFetching}
      >
        <SheetHeader>
          <SheetTitle>
            <FormattedMessage {...messages.title} />
          </SheetTitle>
          <SheetDescription>
            <FormattedMessage {...messages.description} />
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 px-6 pb-6">
          {detailQuery.isLoading ? (
            <TypographyP className="text-sm text-muted-foreground">
              <FormattedMessage {...messages.loading} />
            </TypographyP>
          ) : null}

          {detailQuery.isError ? (
            <div className="grid gap-3">
              <TypographyP className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.error} />
              </TypographyP>
              <Button type="button" variant="outline" onClick={() => detailQuery.refetch()}>
                <FormattedMessage {...messages.retry} />
              </Button>
            </div>
          ) : null}

          {detail && form ? (
            <>
              {staleConflict ? (
                <Alert>
                  <AlertDescription className="flex flex-col gap-2">
                    <FormattedMessage {...messages.staleConflict} />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setStaleConflict(false);
                        void detailQuery.refetch();
                      }}
                    >
                      <FormattedMessage {...messages.loadLatest} />
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {!canEdit ? (
                <TypographyP className="text-sm text-muted-foreground">
                  <FormattedMessage {...messages.readOnlyNotice} />
                </TypographyP>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{detail.memoryEntry.reviewStatus}</Badge>
                <Badge variant="outline">{detail.provenance.origin}</Badge>
                {detail.provenance.provider ? (
                  <Badge variant="outline">{detail.provenance.provider}</Badge>
                ) : null}
              </div>

              {isEditing && canEdit ? (
                <div className="grid gap-3">
                  <TmEntryLocaleField
                    label={intl.formatMessage(messages.sourceLocaleLabel)}
                    value={form.sourceLocale}
                    locales={localeOptions}
                    onValueChange={(locale) =>
                      setForm((current) =>
                        current ? { ...current, sourceLocale: locale } : current,
                      )
                    }
                  />
                  <TmEntryLocaleField
                    label={intl.formatMessage(messages.targetLocaleLabel)}
                    value={form.targetLocale}
                    locales={localeOptions}
                    onValueChange={(locale) =>
                      setForm((current) =>
                        current ? { ...current, targetLocale: locale } : current,
                      )
                    }
                  />
                  <Field className="gap-1.5">
                    <FieldLabel>
                      <FormattedMessage {...messages.sourceTextLabel} />
                    </FieldLabel>
                    <Textarea
                      value={form.sourceText}
                      onChange={(event) =>
                        setForm((current) =>
                          current ? { ...current, sourceText: event.target.value } : current,
                        )
                      }
                    />
                  </Field>
                  <Field className="gap-1.5">
                    <FieldLabel>
                      <FormattedMessage {...messages.targetTextLabel} />
                    </FieldLabel>
                    <Textarea
                      value={form.targetText}
                      onChange={(event) =>
                        setForm((current) =>
                          current ? { ...current, targetText: event.target.value } : current,
                        )
                      }
                    />
                  </Field>
                  <Field className="gap-1.5">
                    <FieldLabel>
                      <FormattedMessage {...messages.reviewStatusLabel} />
                    </FieldLabel>
                    <Select
                      value={form.reviewStatus}
                      onValueChange={(value) => {
                        if (value === "approved" || value === "pending" || value === "rejected") {
                          setForm((current) =>
                            current ? { ...current, reviewStatus: value } : current,
                          );
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REVIEW_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className="gap-1.5">
                    <FieldLabel>
                      <FormattedMessage {...messages.contextLabel} />
                    </FieldLabel>
                    <Textarea
                      value={form.context}
                      onChange={(event) =>
                        setForm((current) =>
                          current ? { ...current, context: event.target.value } : current,
                        )
                      }
                    />
                  </Field>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div>
                    <TypographyP className="text-xs font-medium text-muted-foreground">
                      <FormattedMessage {...messages.sourceTextLabel} />
                    </TypographyP>
                    <TypographyP className="text-sm">{detail.memoryEntry.sourceText}</TypographyP>
                    <TypographyP className="text-xs text-muted-foreground">
                      {formatLocaleOptionLabel(intl, detail.memoryEntry.sourceLocale)}
                    </TypographyP>
                  </div>
                  <div>
                    <TypographyP className="text-xs font-medium text-muted-foreground">
                      <FormattedMessage {...messages.targetTextLabel} />
                    </TypographyP>
                    <TypographyP className="text-sm">{detail.memoryEntry.targetText}</TypographyP>
                    <TypographyP className="text-xs text-muted-foreground">
                      {formatLocaleOptionLabel(intl, detail.memoryEntry.targetLocale)}
                    </TypographyP>
                  </div>
                  <div>
                    <TypographyP className="text-xs font-medium text-muted-foreground">
                      <FormattedMessage {...messages.contextLabel} />
                    </TypographyP>
                    <TypographyP className="text-sm">
                      {detail.provenance.context ?? intl.formatMessage(messages.contextEmpty)}
                    </TypographyP>
                  </div>
                </div>
              )}

              <section className="grid gap-3">
                <TypographyP className="text-sm font-medium">
                  <FormattedMessage {...messages.provenanceTitle} />
                </TypographyP>
                <div className="grid gap-3">
                  <div className="grid gap-0.5">
                    <TypographyP className="text-xs font-medium text-muted-foreground">
                      <FormattedMessage {...messages.originLabel} />
                    </TypographyP>
                    <TypographyP className="text-sm">{detail.provenance.origin}</TypographyP>
                  </div>
                  {detail.provenance.provider ? (
                    <div className="grid gap-0.5">
                      <TypographyP className="text-xs font-medium text-muted-foreground">
                        <FormattedMessage {...messages.providerLabel} />
                      </TypographyP>
                      <TypographyP className="text-sm">{detail.provenance.provider}</TypographyP>
                    </div>
                  ) : null}
                  {detail.provenance.importBatchId ? (
                    <div className="grid gap-0.5">
                      <TypographyP className="text-xs font-medium text-muted-foreground">
                        <FormattedMessage {...messages.importBatchLabel} />
                      </TypographyP>
                      <TypographyP className="text-sm">
                        {detail.provenance.importBatchId}
                      </TypographyP>
                    </div>
                  ) : null}
                  <ProvenanceRow
                    label={<FormattedMessage {...messages.createdLabel} />}
                    actor={detail.provenance.created}
                    empty={intl.formatMessage(messages.unknownActor)}
                  />
                  <ProvenanceRow
                    label={<FormattedMessage {...messages.modifiedLabel} />}
                    actor={detail.provenance.modified}
                    empty={intl.formatMessage(messages.unknownActor)}
                  />
                  <ProvenanceRow
                    label={<FormattedMessage {...messages.reviewedLabel} />}
                    actor={detail.provenance.reviewed}
                    empty={intl.formatMessage(messages.unknownActor)}
                  />
                  <ProvenanceRow
                    label={<FormattedMessage {...messages.importedLabel} />}
                    actor={detail.provenance.imported}
                    empty={intl.formatMessage(messages.unknownActor)}
                  />
                  <ProvenanceRow
                    label={<FormattedMessage {...messages.providerSuppliedLabel} />}
                    actor={detail.provenance.providerSupplied}
                    empty={intl.formatMessage(messages.unknownActor)}
                  />
                </div>
              </section>

              {metadataEntries.length > 0 ? (
                <section className="grid gap-2">
                  <TypographyP className="text-sm font-medium">
                    <FormattedMessage {...messages.metadataTitle} />
                  </TypographyP>
                  {metadataEntries.map(([key, value]) => (
                    <div key={key} className="grid gap-0.5">
                      <TypographyP className="text-xs font-medium text-muted-foreground">
                        {key}
                      </TypographyP>
                      <TypographyP className="text-sm">
                        {typeof value === "string" ? value : JSON.stringify(value)}
                      </TypographyP>
                    </div>
                  ))}
                </section>
              ) : null}

              <section className="grid gap-2">
                <TypographyP className="text-sm font-medium">
                  <FormattedMessage {...messages.variantsTitle} />
                </TypographyP>
                {detail.variants.length === 0 ? (
                  <TypographyP className="text-sm text-muted-foreground">
                    <FormattedMessage {...messages.variantsEmpty} />
                  </TypographyP>
                ) : (
                  detail.variants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      className="rounded-lg border border-border px-3 py-2 text-left"
                      onClick={() => onOpenVariant(variant.id)}
                    >
                      <TypographyP className="text-sm font-medium">
                        <FormattedMessage
                          {...messages.openVariant}
                          values={{
                            targetLocale: formatLocaleOptionLabel(intl, variant.targetLocale),
                          }}
                        />
                      </TypographyP>
                      <TypographyP className="text-xs text-muted-foreground">
                        {variant.targetText}
                        {variant.context ? ` · ${variant.context}` : ""}
                      </TypographyP>
                    </button>
                  ))
                )}
              </section>

              <section className="grid gap-2">
                <TypographyP className="text-sm font-medium">
                  <FormattedMessage {...messages.auditTitle} />
                </TypographyP>
                {detail.auditEvents.length === 0 ? (
                  <TypographyP className="text-sm text-muted-foreground">
                    <FormattedMessage {...messages.auditEmpty} />
                  </TypographyP>
                ) : (
                  <ol className="grid gap-3">
                    {detail.auditEvents.map((event) => (
                      <li key={event.id} className="grid gap-0.5">
                        <TypographyP className="text-sm font-medium">
                          <FormattedMessage {...eventLabel(event)} />
                        </TypographyP>
                        <TypographyP className="text-xs text-muted-foreground">
                          {event.actorDisplayName ?? intl.formatMessage(messages.unknownActor)}
                          {" · "}
                          <FormattedDate
                            value={event.occurredAt}
                            year="numeric"
                            month="short"
                            day="numeric"
                            hour="numeric"
                            minute="2-digit"
                          />
                        </TypographyP>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          ) : null}
        </div>

        <SheetFooter>
          {canEdit && detail && form ? (
            isEditing ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={
                    !form.sourceText.trim() ||
                    !form.targetText.trim() ||
                    saveEntry.isPending ||
                    staleConflict
                  }
                  onClick={() => saveEntry.mutate(form)}
                >
                  <FormattedMessage {...messages.save} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setForm(formFromDetail(detail));
                    setIsEditing(false);
                    setStaleConflict(false);
                  }}
                >
                  <FormattedMessage {...messages.cancel} />
                </Button>
              </div>
            ) : (
              <Button type="button" onClick={() => setIsEditing(true)}>
                <FormattedMessage {...messages.edit} />
              </Button>
            )
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <FormattedMessage {...messages.close} />
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
