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
import { Fragment, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { PlusIcon, CaretDownIcon, TrashIcon, FunnelIcon, LinkIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type {
  GlossaryConceptRecord,
  GlossaryTermPageResponse,
} from "@/api/routes/glossary/glossary.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAppShellBreadcrumbAppend } from "@/components/app-shell/store/use-app-shell-breadcrumb";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import {
  GenderDisplay,
  GenderPicker,
  PartOfSpeechDisplay,
  PartOfSpeechPicker,
  StatusLabel,
  TermTypeDisplay,
  TermTypePicker,
  statusBadgeClass,
  statusPickerContentClassName,
  statusPickerItemClass,
  statusPickerTriggerClass,
} from "@/components/glossary/glossary-term-property-pickers";
import { ApiResponseError, readApiError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { getLocaleLabel } from "@/lib/i18n/locales";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { cn } from "@/lib/primitives/cn";
import { glossaryTermStatusValues } from "@/lib/glossary/glossary";

import { useUnsavedChangesLeaveGuard } from "../../../_components/unsaved-changes-leave-guard";
import { availableConceptTermLocales } from "./available-concept-term-locales";
import { glossaryDetailPageContentMessages as messages } from "./glossary-detail-page-content.messages";
import {
  GlossaryConceptDetailStoreProvider,
  useGlossaryConceptDetailStore,
} from "../store/glossary-concept-detail-store-context";
import type { TermDraft } from "../store/glossary-concept-detail-store";

const statusOptions = glossaryTermStatusValues;

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}

function TermStatusSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2",
        compact ? "h-5" : "h-7 w-full",
      )}
      aria-hidden="true"
    >
      <Skeleton className={cn("rounded-full", compact ? "size-2.5" : "size-3")} />
      <Skeleton className={cn("h-2.5", compact ? "w-14" : "w-20")} />
    </span>
  );
}

function ConceptDetailSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6" aria-busy="true">
      <Skeleton className="h-4 w-32 rounded-full" />
      <section className="grid gap-5 rounded-lg border border-border p-4">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid min-h-[36rem] gap-5 lg:grid-cols-[minmax(13rem,0.6fr)_minmax(0,1.8fr)]">
          <div className="grid content-start gap-4 border-b border-border pb-5 lg:border-r lg:border-b-0 lg:pr-5 lg:pb-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="grid content-start gap-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-9 w-full max-w-sm" />
              <Skeleton className="h-9 w-28" />
            </div>
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center justify-between border-b border-border px-3 py-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-7 w-20" />
                </div>
                <div className="grid gap-3 p-3">
                  {Array.from({ length: 2 }).map((__, rowIndex) => (
                    <div key={rowIndex} className="grid grid-cols-5 gap-3">
                      <Skeleton className="h-7 w-full" />
                      <Skeleton className="h-7 w-full" />
                      <Skeleton className="h-7 w-full" />
                      <Skeleton className="h-7 w-full" />
                      <TermStatusSkeleton />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-between border-t border-border pt-4">
          <Skeleton className="h-9 w-28" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      </section>
    </main>
  );
}

import { useGlossary } from "./use-glossary";

export function GlossaryConceptDetail({
  organizationSlug,
  glossaryId,
  conceptId,
  canManageGlossaries,
}: {
  organizationSlug: string;
  glossaryId: string;
  conceptId: string;
  canManageGlossaries: boolean;
}) {
  return (
    <GlossaryConceptDetailStoreProvider
      organizationSlug={organizationSlug}
      glossaryId={glossaryId}
      conceptId={conceptId}
    >
      <GlossaryConceptDetailView
        organizationSlug={organizationSlug}
        glossaryId={glossaryId}
        conceptId={conceptId}
        canManageGlossaries={canManageGlossaries}
      />
    </GlossaryConceptDetailStoreProvider>
  );
}

const GlossaryConceptDetailView = observer(function GlossaryConceptDetailView({
  organizationSlug,
  glossaryId,
  conceptId,
  canManageGlossaries,
}: {
  organizationSlug: string;
  glossaryId: string;
  conceptId: string;
  canManageGlossaries: boolean;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const queryClient = useQueryClient();
  const store = useGlossaryConceptDetailStore();
  const glossaryHref = store.glossaryHref;
  const { glossaryQuery, glossary, canContribute, isConceptGlossary, sourceLanguage } = useGlossary(
    {
      organizationSlug,
      glossaryId,
      canManageGlossaries,
    },
  );

  const isCreatingConcept = store.isCreatingConcept;
  const availableTermLocales = availableConceptTermLocales();
  const conceptQuery = useQuery({
    queryKey: ["glossary-concept", organizationSlug, glossaryId, conceptId],
    enabled: Boolean(isConceptGlossary) && !isCreatingConcept,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts[":conceptId"].$get({
        param: { organizationSlug, glossaryId, conceptId },
        query: { includeTerms: "false" },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.loadConceptsFailed));
      }
      return (await response.json()).concept as GlossaryConceptRecord;
    },
  });
  const conceptRecord = conceptQuery.data ?? null;
  const termsQuery = useQuery({
    queryKey: [
      "glossary-concept-terms-page",
      organizationSlug,
      glossaryId,
      conceptId,
      store.termCursor,
      store.languageFilter,
    ],
    enabled: Boolean(conceptRecord) && !isCreatingConcept,
    queryFn: async ({ signal }) => {
      const locale = store.resolvedTermLocaleFilter(availableTermLocales);
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts[":conceptId"].terms.page.$get(
        {
          param: { organizationSlug, glossaryId, conceptId },
          query: {
            limit: "50",
            sort: "locale",
            sortDir: "asc",
            includeArchived: "false",
            ...(store.termCursor ? { cursor: store.termCursor } : {}),
            ...(locale ? { locale } : {}),
          },
        },
        { init: { signal } },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.loadConceptsFailed));
      }
      return (await response.json()) as GlossaryTermPageResponse;
    },
    placeholderData: (previous) => previous,
  });
  const selectedConcept = store.selectedConcept;
  useEffect(() => {
    store.setSourceLocale(sourceLanguage.locale);
    if (store.isCreatingConcept) store.initializeNewConcept(sourceLanguage.locale);
  }, [store, sourceLanguage.locale]);

  useEffect(() => {
    if (!conceptRecord) return;
    store.hydrateFromServer({ ...conceptRecord, terms: termsQuery.data?.terms ?? [] });
  }, [store, conceptRecord, termsQuery.data?.terms]);

  const sourceTermText = store.sourceTermText;
  const conceptBreadcrumbLabel = isCreatingConcept
    ? intl.formatMessage(messages.addConcept)
    : sourceTermText || conceptId;

  useAppShellBreadcrumbAppend({
    id: "glossary-concept-detail",
    label: conceptBreadcrumbLabel,
    isLoading:
      glossaryQuery.isLoading || (!isCreatingConcept && conceptQuery.isLoading && !sourceTermText),
  });

  const goBack = () => router.push(glossaryHref);
  const goToNextTermPage = () => store.goToNextTermPage(termsQuery.data?.nextCursor);
  const goToPreviousTermPage = () => store.goToPreviousTermPage();

  const invalidateConcepts = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["glossary-concepts", organizationSlug, glossaryId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["glossary-concepts-page", organizationSlug, glossaryId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["provider-glossary-concepts", organizationSlug, glossaryId],
      }),
    ]);

  const invalidateConceptDetail = () =>
    queryClient.invalidateQueries({
      queryKey: ["glossary-concept", organizationSlug, glossaryId, conceptId],
    });
  const saveConcept = useMutation({
    mutationFn: async () => {
      if (!store.sourceTermText.trim()) {
        throw new Error(intl.formatMessage(messages.saveConceptFailed));
      }
      if (store.isCreatingConcept) {
        const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
          ":glossaryId"
        ].concepts.$post({
          param: { organizationSlug, glossaryId },
          json: store.buildCreateBody(),
        });
        if (!response.ok)
          throw new Error(
            await readApiError(response, intl.formatMessage(messages.saveConceptFailed)),
          );
        return {
          concept: (await response.json()).concept as GlossaryConceptRecord,
          created: true,
        };
      }
      if (!conceptId) throw new Error(intl.formatMessage(messages.saveConceptFailed));
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts[":conceptId"].$patch({
        param: { organizationSlug, glossaryId, conceptId },
        json: store.buildUpdateBody(),
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.saveConceptFailed)),
        );
      return {
        concept: (await response.json()).concept as GlossaryConceptRecord,
        created: false,
      };
    },
    onSuccess: async ({ concept, created }) => {
      await Promise.all([invalidateConcepts(), invalidateConceptDetail()]);
      store.applySavedConcept(concept);
      if (created) leaveTo(store.conceptHref(concept.id));
      toast.success(intl.formatMessage(created ? messages.conceptAdded : messages.conceptSaved));
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteConcept = useMutation({
    mutationFn: async (conceptId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts[":conceptId"].$delete({
        param: { organizationSlug, glossaryId, conceptId },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.deleteConceptFailed)),
        );
    },
    onSuccess: async () => {
      await Promise.all([invalidateConcepts(), invalidateConceptDetail()]);
      leaveTo(glossaryHref);
      toast.success(intl.formatMessage(messages.conceptDeleted));
    },
    onError: (error) => toast.error(error.message),
  });

  const termGroups = store.termGroups;
  const creatingTermGroups = store.creatingTermGroups;
  const newTermIsDirty = store.newTermIsDirty;
  const isDirty = store.isDirty;
  const { leaveGuardDialog, leaveTo } = useUnsavedChangesLeaveGuard(store.hasUnsavedChanges);

  if (glossaryQuery.isLoading || (!isCreatingConcept && conceptQuery.isLoading))
    return <ConceptDetailSkeleton />;
  const conceptNotFound =
    conceptQuery.error instanceof ApiResponseError && conceptQuery.error.status === 404;
  if (
    !glossary ||
    (!isCreatingConcept && (conceptNotFound || (conceptQuery.isSuccess && !selectedConcept)))
  ) {
    return (
      <TypographyP className="py-8" size="small" tone="subtle">
        <FormattedMessage {...messages.notFound} />
      </TypographyP>
    );
  }
  if (!isCreatingConcept && conceptQuery.isError) {
    return (
      <TypographyP className="py-8" size="small" tone="subtle">
        {conceptQuery.error.message}
      </TypographyP>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <section className="grid gap-5 rounded-lg border border-border p-4">
        <div className="grid gap-1">
          <TypographyH1 className="text-2xl" weight="medium">
            {isCreatingConcept ? (
              <FormattedMessage {...messages.addConcept} />
            ) : (
              sourceTermText || conceptId
            )}
          </TypographyH1>
          <TypographyP size="small" tone="subtle">
            {sourceLanguage.name} · {sourceLanguage.locale}
          </TypographyP>
        </div>
        <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(13rem,0.6fr)_minmax(0,1.8fr)]">
          <div className="flex min-w-0 flex-col gap-4 border-b border-border pb-5 lg:border-r lg:border-b-0 lg:pr-5 lg:pb-0">
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...messages.primaryTermLabel} />
              </FieldLabel>
              <Input value={sourceTermText} disabled={!canContribute} readOnly />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...messages.subjectLabel} />
              </FieldLabel>
              <Input
                value={store.conceptDraft.subject}
                onChange={(event) => store.updateConceptDraft({ subject: event.target.value })}
                disabled={!canContribute}
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...messages.definitionLabel} />
              </FieldLabel>
              <Textarea
                value={store.conceptDraft.definition}
                onChange={(event) => store.updateConceptDraft({ definition: event.target.value })}
                disabled={!canContribute}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={store.conceptDraft.translatable}
                onCheckedChange={(checked) =>
                  store.updateConceptDraft({ translatable: Boolean(checked) })
                }
                disabled={!canContribute}
              />
              <FormattedMessage {...messages.translatableLabel} />
            </label>
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                <FormattedMessage {...messages.conceptDetails} />
              </summary>
              <div className="mt-3 grid gap-3">
                <Field className="gap-1.5">
                  <FieldLabel>
                    <FormattedMessage {...messages.noteLabel} />
                  </FieldLabel>
                  <Textarea
                    value={store.conceptDraft.note}
                    onChange={(event) => store.updateConceptDraft({ note: event.target.value })}
                    disabled={!canContribute}
                  />
                </Field>
                <Field className="gap-1.5">
                  <FieldLabel>
                    <FormattedMessage {...messages.urlLabel} />
                  </FieldLabel>
                  <Input
                    value={store.conceptDraft.url}
                    onChange={(event) => store.updateConceptDraft({ url: event.target.value })}
                    disabled={!canContribute}
                  />
                </Field>
              </div>
            </details>
          </div>
          <div className="min-h-0 min-w-0">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative min-w-0 flex-1">
                <FunnelIcon className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder={intl.formatMessage(messages.filterLanguages)}
                  value={store.languageFilter}
                  disabled={isDirty}
                  onChange={(event) => store.setLanguageFilter(event.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={!canContribute || availableTermLocales.length === 0}
                onClick={() => store.setLocalePickerOpen(true)}
              >
                <PlusIcon />
                <FormattedMessage {...messages.addTerm} />
              </Button>
            </div>
            {!isCreatingConcept &&
            termsQuery.data &&
            (termsQuery.data.pagination.hasMore || store.termCursor) ? (
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!store.termCursor || isDirty || termsQuery.isFetching}
                  onClick={goToPreviousTermPage}
                >
                  Previous terms
                </Button>
                <TypographyP size="xsmall" tone="subtle" className="tabular-nums">
                  {termsQuery.data.pagination.returned} of {termsQuery.data.total}
                </TypographyP>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!termsQuery.data.nextCursor || isDirty || termsQuery.isFetching}
                  onClick={goToNextTermPage}
                >
                  Next terms
                </Button>
              </div>
            ) : null}
            <Dialog
              open={store.localePickerOpen}
              onOpenChange={(open) => store.setLocalePickerOpen(open)}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    <FormattedMessage {...messages.chooseTermLanguage} />
                  </DialogTitle>
                  <DialogDescription>
                    <FormattedMessage {...messages.chooseTermLanguageDescription} />
                  </DialogDescription>
                </DialogHeader>
                <div className="grid max-h-[min(60dvh,24rem)] gap-2 overflow-y-auto pr-1">
                  {availableTermLocales.map((locale) => (
                    <Button
                      key={locale}
                      type="button"
                      variant="outline"
                      className="justify-between"
                      onClick={() => {
                        if (isCreatingConcept) {
                          store.addCreatingTerm(locale, `new-${crypto.randomUUID()}`);
                        } else {
                          store.startNewTerm(locale);
                        }
                      }}
                    >
                      <span>{getLocaleLabel(locale)}</span>
                      <span className="text-xs text-muted-foreground">{locale}</span>
                    </Button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <div className="max-h-[calc(100dvh-18rem)] overflow-y-auto pr-1">
              <div className="grid gap-4">
                {isCreatingConcept && creatingTermGroups.length > 0
                  ? creatingTermGroups.map((group) => {
                      const isSource = group.locale === sourceLanguage.locale;
                      return (
                        <div
                          key={group.locale}
                          className="overflow-hidden rounded-lg border border-border"
                        >
                          <div
                            className={`flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm font-medium ${isSource ? "bg-emerald-500/5" : "bg-amber-500/5"}`}
                          >
                            <span>
                              {getLocaleLabel(group.locale)}{" "}
                              <span className="text-xs text-muted-foreground">{group.locale}</span>
                              {isSource ? (
                                <Badge
                                  variant="outline"
                                  className="ml-2 border-emerald-500/30 text-emerald-700"
                                >
                                  <FormattedMessage {...messages.sourceBadge} />
                                </Badge>
                              ) : null}
                            </span>
                            {canContribute ? (
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                onClick={() =>
                                  store.addCreatingTerm(group.locale, `new-${crypto.randomUUID()}`)
                                }
                              >
                                <PlusIcon />
                                <FormattedMessage {...messages.addTerm} />
                              </Button>
                            ) : null}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-[680px] w-full text-left text-xs">
                              <thead className="text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2">
                                    <FormattedMessage {...messages.termLabel} />
                                  </th>
                                  <th className="px-3 py-2">
                                    <FormattedMessage {...messages.partOfSpeechLabel} />
                                  </th>
                                  <th className="px-3 py-2">
                                    <FormattedMessage {...messages.genderLabel} />
                                  </th>
                                  <th className="px-3 py-2">
                                    <FormattedMessage {...messages.typeLabel} />
                                  </th>
                                  <th className="px-3 py-2">
                                    <FormattedMessage {...messages.statusLabel} />
                                  </th>
                                  <th className="w-10 px-3 py-2" />
                                </tr>
                              </thead>
                              <tbody>
                                {group.terms.map((term) => {
                                  const isExpanded = store.expandedCreatingTermIds.has(term.id);
                                  const isSourceTerm = term.locale === sourceLanguage.locale;
                                  return (
                                    <Fragment key={term.id}>
                                      <tr className="border-t border-border">
                                        <td className="px-3 py-2">
                                          <Textarea
                                            autoFocus={
                                              store.creatingTermDrafts.at(-1)?.id === term.id
                                            }
                                            className="w-48 max-w-full min-h-8 resize-y px-2 py-1.5 text-sm leading-5"
                                            placeholder={intl.formatMessage(messages.termLabel)}
                                            value={term.term}
                                            required={isSourceTerm}
                                            onChange={(event) =>
                                              store.updateCreatingTermDraft(term.id, {
                                                term: event.target.value,
                                              })
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <PartOfSpeechPicker
                                            value={term.partOfSpeech}
                                            onValueChange={(value) =>
                                              store.updateCreatingTermDraft(term.id, {
                                                partOfSpeech: value,
                                              })
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <GenderPicker
                                            value={term.gender ?? ""}
                                            onValueChange={(value) =>
                                              store.updateCreatingTermDraft(term.id, {
                                                gender: value,
                                              })
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <TermTypePicker
                                            value={term.termType ?? ""}
                                            onValueChange={(value) =>
                                              store.updateCreatingTermDraft(term.id, {
                                                termType: value,
                                              })
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Select
                                            value={term.status}
                                            onValueChange={(value) =>
                                              store.updateCreatingTermDraft(term.id, {
                                                status: (value ?? "draft") as TermDraft["status"],
                                              })
                                            }
                                          >
                                            <SelectTrigger
                                              showIcon={false}
                                              className={statusPickerTriggerClass()}
                                            >
                                              <SelectValue>
                                                <StatusLabel status={term.status} />
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent className={statusPickerContentClassName}>
                                              {statusOptions.map((option) => (
                                                <SelectItem
                                                  key={option}
                                                  value={option}
                                                  className={statusPickerItemClass(option)}
                                                >
                                                  <StatusLabel status={option} />
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <Button
                                            type="button"
                                            size="icon-xs"
                                            variant="outline"
                                            aria-expanded={isExpanded}
                                            aria-label={intl.formatMessage(
                                              isExpanded
                                                ? messages.collapseTerm
                                                : messages.expandTerm,
                                            )}
                                            onClick={() =>
                                              store.toggleExpandedCreatingTerm(term.id)
                                            }
                                          >
                                            <CaretDownIcon
                                              className={isExpanded ? "" : "-rotate-90"}
                                            />
                                          </Button>
                                        </td>
                                      </tr>
                                      {isExpanded ? (
                                        <tr className="border-t border-border bg-muted/10">
                                          <td colSpan={6} className="px-3 py-4">
                                            <div className="grid gap-4">
                                              <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]">
                                                <Field className="gap-1.5">
                                                  <FieldLabel>
                                                    <FormattedMessage
                                                      {...messages.descriptionLabel}
                                                    />
                                                  </FieldLabel>
                                                  <Textarea
                                                    rows={3}
                                                    placeholder={intl.formatMessage(
                                                      messages.termDescriptionPlaceholder,
                                                    )}
                                                    value={term.description}
                                                    onChange={(event) =>
                                                      store.updateCreatingTermDraft(term.id, {
                                                        description: event.target.value,
                                                      })
                                                    }
                                                  />
                                                </Field>
                                                <Field className="gap-1.5">
                                                  <FieldLabel>
                                                    <FormattedMessage {...messages.urlLabel} />
                                                  </FieldLabel>
                                                  <div className="flex gap-2">
                                                    <Input
                                                      placeholder={intl.formatMessage(
                                                        messages.termUrlPlaceholder,
                                                      )}
                                                      value={term.url}
                                                      onChange={(event) =>
                                                        store.updateCreatingTermDraft(term.id, {
                                                          url: event.target.value,
                                                        })
                                                      }
                                                    />
                                                    <Button
                                                      type="button"
                                                      size="icon"
                                                      variant="secondary"
                                                      aria-label={intl.formatMessage(
                                                        messages.openTermUrl,
                                                      )}
                                                      disabled={!term.url}
                                                      onClick={() =>
                                                        window.open(
                                                          term.url,
                                                          "_blank",
                                                          "noopener,noreferrer",
                                                        )
                                                      }
                                                    >
                                                      <LinkIcon />
                                                    </Button>
                                                  </div>
                                                </Field>
                                              </div>
                                              <Field className="gap-1.5">
                                                <FieldLabel>
                                                  <FormattedMessage {...messages.noteLabel} />
                                                </FieldLabel>
                                                <Textarea
                                                  rows={2}
                                                  placeholder={intl.formatMessage(
                                                    messages.termNotePlaceholder,
                                                  )}
                                                  value={term.note}
                                                  onChange={(event) =>
                                                    store.updateCreatingTermDraft(term.id, {
                                                      note: event.target.value,
                                                    })
                                                  }
                                                />
                                              </Field>
                                              {!isSourceTerm ? (
                                                <div className="flex justify-end border-t border-border pt-3">
                                                  <Button
                                                    type="button"
                                                    variant="destructive"
                                                    onClick={() =>
                                                      store.removeCreatingTerm(term.id)
                                                    }
                                                  >
                                                    <TrashIcon />
                                                    <FormattedMessage {...messages.deleteTerm} />
                                                  </Button>
                                                </div>
                                              ) : null}
                                            </div>
                                          </td>
                                        </tr>
                                      ) : null}
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  : null}
                {termGroups.map((group) => {
                  const isSource = group.locale === glossary.sourceLocale;
                  return (
                    <div
                      key={group.locale}
                      className="overflow-hidden rounded-lg border border-border"
                    >
                      <div
                        className={`flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm font-medium ${isSource ? "bg-emerald-500/5" : "bg-amber-500/5"}`}
                      >
                        <span>
                          {getLocaleLabel(group.locale)}{" "}
                          <span className="text-xs text-muted-foreground">{group.locale}</span>
                          {isSource ? (
                            <Badge
                              variant="outline"
                              className="ml-2 border-emerald-500/30 text-emerald-700"
                            >
                              <FormattedMessage {...messages.sourceBadge} />
                            </Badge>
                          ) : null}
                        </span>
                        {canContribute ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() => store.startNewTerm(group.locale)}
                          >
                            <PlusIcon />
                            <FormattedMessage {...messages.addTerm} />
                          </Button>
                        ) : null}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-[680px] w-full text-left text-xs">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2">
                                <FormattedMessage {...messages.termLabel} />
                              </th>
                              <th className="px-3 py-2">
                                <FormattedMessage {...messages.partOfSpeechLabel} />
                              </th>
                              <th className="px-3 py-2">
                                <FormattedMessage {...messages.genderLabel} />
                              </th>
                              <th className="px-3 py-2">
                                <FormattedMessage {...messages.typeLabel} />
                              </th>
                              <th className="px-3 py-2">
                                <FormattedMessage {...messages.statusLabel} />
                              </th>
                              <th className="w-10 px-3 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {group.terms.map((term) => {
                              const draft = store.termDraftFor(term);
                              const isTermDirty = store.isTermDirty(term);
                              const isExpanded = store.expandedTermIds.has(term.id);
                              return (
                                <Fragment key={term.id}>
                                  <tr className="border-t border-border">
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-2">
                                        {canContribute ? (
                                          <Textarea
                                            className="w-48 max-w-full min-h-8 resize-y px-2 py-1.5 text-sm leading-5"
                                            value={draft.term}
                                            onChange={(event) =>
                                              store.updateTermDraft(term.id, {
                                                term: event.target.value,
                                              })
                                            }
                                          />
                                        ) : (
                                          <span className="font-medium">{term.term}</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      {canContribute ? (
                                        <PartOfSpeechPicker
                                          value={draft.partOfSpeech}
                                          onValueChange={(value) =>
                                            store.updateTermDraft(term.id, {
                                              partOfSpeech: value,
                                            })
                                          }
                                        />
                                      ) : (
                                        <PartOfSpeechDisplay value={term.partOfSpeech} />
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {canContribute ? (
                                        <GenderPicker
                                          value={draft.gender ?? ""}
                                          onValueChange={(value) =>
                                            store.updateTermDraft(term.id, { gender: value })
                                          }
                                        />
                                      ) : (
                                        <GenderDisplay value={term.gender} />
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {canContribute ? (
                                        <TermTypePicker
                                          value={draft.termType ?? ""}
                                          onValueChange={(value) =>
                                            store.updateTermDraft(term.id, { termType: value })
                                          }
                                        />
                                      ) : (
                                        <TermTypeDisplay value={term.termType} />
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {canContribute ? (
                                        <Select
                                          value={draft.status}
                                          onValueChange={(value) =>
                                            store.updateTermDraft(term.id, {
                                              status: (value ?? "draft") as TermDraft["status"],
                                            })
                                          }
                                        >
                                          <SelectTrigger
                                            showIcon={false}
                                            className={statusPickerTriggerClass()}
                                          >
                                            <SelectValue>
                                              <StatusLabel status={draft.status} />
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent className={statusPickerContentClassName}>
                                            {statusOptions.map((option) => (
                                              <SelectItem
                                                key={option}
                                                value={option}
                                                className={statusPickerItemClass(option)}
                                              >
                                                <StatusLabel status={option} />
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <Badge
                                          variant="outline"
                                          className={statusBadgeClass(term.status)}
                                        >
                                          <StatusLabel status={term.status} />
                                        </Badge>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <span
                                          className={cn(
                                            "size-2 shrink-0 rounded-full",
                                            isTermDirty ? "bg-emerald-500" : "bg-transparent",
                                          )}
                                          aria-hidden="true"
                                        />
                                        <Button
                                          type="button"
                                          size="icon-xs"
                                          variant="outline"
                                          aria-expanded={isExpanded}
                                          aria-label={intl.formatMessage(
                                            isExpanded
                                              ? messages.collapseTerm
                                              : messages.expandTerm,
                                          )}
                                          onClick={() => store.toggleExpandedTerm(term.id)}
                                        >
                                          <CaretDownIcon
                                            className={isExpanded ? "" : "-rotate-90"}
                                          />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                  {isExpanded ? (
                                    <tr className="border-t border-border bg-muted/10">
                                      <td colSpan={6} className="px-3 py-4">
                                        <div className="grid gap-4">
                                          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]">
                                            <Field className="gap-1.5">
                                              <FieldLabel>
                                                <FormattedMessage {...messages.descriptionLabel} />
                                              </FieldLabel>
                                              <Textarea
                                                rows={3}
                                                placeholder={intl.formatMessage(
                                                  messages.termDescriptionPlaceholder,
                                                )}
                                                value={draft.description}
                                                disabled={!canContribute}
                                                onChange={(event) =>
                                                  store.updateTermDraft(term.id, {
                                                    description: event.target.value,
                                                  })
                                                }
                                              />
                                            </Field>
                                            <Field className="gap-1.5">
                                              <FieldLabel>
                                                <FormattedMessage {...messages.urlLabel} />
                                              </FieldLabel>
                                              <div className="flex gap-2">
                                                <Input
                                                  placeholder={intl.formatMessage(
                                                    messages.termUrlPlaceholder,
                                                  )}
                                                  value={draft.url}
                                                  disabled={!canContribute}
                                                  onChange={(event) =>
                                                    store.updateTermDraft(term.id, {
                                                      url: event.target.value,
                                                    })
                                                  }
                                                />
                                                <Button
                                                  type="button"
                                                  size="icon"
                                                  variant="secondary"
                                                  aria-label={intl.formatMessage(
                                                    messages.openTermUrl,
                                                  )}
                                                  disabled={!draft.url}
                                                  onClick={() =>
                                                    window.open(
                                                      draft.url,
                                                      "_blank",
                                                      "noopener,noreferrer",
                                                    )
                                                  }
                                                >
                                                  <LinkIcon />
                                                </Button>
                                              </div>
                                            </Field>
                                          </div>
                                          <Field className="gap-1.5">
                                            <FieldLabel>
                                              <FormattedMessage {...messages.noteLabel} />
                                            </FieldLabel>
                                            <Textarea
                                              rows={2}
                                              placeholder={intl.formatMessage(
                                                messages.termNotePlaceholder,
                                              )}
                                              value={draft.note}
                                              disabled={!canContribute}
                                              onChange={(event) =>
                                                store.updateTermDraft(term.id, {
                                                  note: event.target.value,
                                                })
                                              }
                                            />
                                          </Field>
                                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                                            <TypographyP
                                              className="tabular-nums"
                                              size="xsmall"
                                              tone="subtle"
                                            >
                                              ID {term.id} · {formatDate(term.createdAt)} ·{" "}
                                              {formatDate(term.updatedAt)}
                                            </TypographyP>
                                            {canContribute ? (
                                              <Button
                                                type="button"
                                                variant="destructive"
                                                onClick={() => store.setTermToDeleteId(term.id)}
                                              >
                                                <TrashIcon />
                                                <FormattedMessage {...messages.deleteTerm} />
                                              </Button>
                                            ) : null}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  ) : null}
                                </Fragment>
                              );
                            })}
                            {store.newTermLocale === group.locale && canContribute ? (
                              <Fragment>
                                <tr className="border-t border-emerald-500/30 bg-emerald-500/5">
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <Textarea
                                        autoFocus
                                        className="w-48 max-w-full min-h-8 resize-y px-2 py-1.5 text-sm leading-5"
                                        placeholder={intl.formatMessage(messages.termLabel)}
                                        value={store.newTermDraft.term}
                                        onChange={(event) =>
                                          store.updateNewTermDraft({ term: event.target.value })
                                        }
                                      />
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <PartOfSpeechPicker
                                      value={store.newTermDraft.partOfSpeech}
                                      onValueChange={(value) =>
                                        store.updateNewTermDraft({ partOfSpeech: value })
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <GenderPicker
                                      value={store.newTermDraft.gender ?? ""}
                                      onValueChange={(value) =>
                                        store.updateNewTermDraft({ gender: value })
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <TermTypePicker
                                      value={store.newTermDraft.termType ?? ""}
                                      onValueChange={(value) =>
                                        store.updateNewTermDraft({ termType: value })
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <Select
                                      value={store.newTermDraft.status}
                                      onValueChange={(value) =>
                                        store.updateNewTermDraft({
                                          status: (value ?? "draft") as TermDraft["status"],
                                        })
                                      }
                                    >
                                      <SelectTrigger
                                        showIcon={false}
                                        className={statusPickerTriggerClass()}
                                      >
                                        <SelectValue>
                                          <StatusLabel status={store.newTermDraft.status} />
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent className={statusPickerContentClassName}>
                                        {statusOptions.map((option) => (
                                          <SelectItem
                                            key={option}
                                            value={option}
                                            className={statusPickerItemClass(option)}
                                          >
                                            <StatusLabel status={option} />
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                      <span
                                        className={cn(
                                          "size-2 shrink-0 rounded-full",
                                          newTermIsDirty ? "bg-emerald-500" : "bg-transparent",
                                        )}
                                        aria-hidden="true"
                                      />
                                      <Button
                                        type="button"
                                        size="icon-xs"
                                        variant="ghost"
                                        aria-label={intl.formatMessage(messages.cancelEdit)}
                                        onClick={() => store.cancelNewTerm()}
                                      >
                                        <TrashIcon />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                                <tr className="border-t border-emerald-500/30 bg-emerald-500/5">
                                  <td colSpan={6} className="px-3 py-4">
                                    <div className="grid gap-4">
                                      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]">
                                        <Field className="gap-1.5">
                                          <FieldLabel>
                                            <FormattedMessage {...messages.descriptionLabel} />
                                          </FieldLabel>
                                          <Textarea
                                            rows={3}
                                            placeholder={intl.formatMessage(
                                              messages.termDescriptionPlaceholder,
                                            )}
                                            value={store.newTermDraft.description}
                                            onChange={(event) =>
                                              store.updateNewTermDraft({
                                                description: event.target.value,
                                              })
                                            }
                                          />
                                        </Field>
                                        <Field className="gap-1.5">
                                          <FieldLabel>
                                            <FormattedMessage {...messages.urlLabel} />
                                          </FieldLabel>
                                          <div className="flex gap-2">
                                            <Input
                                              placeholder={intl.formatMessage(
                                                messages.termUrlPlaceholder,
                                              )}
                                              value={store.newTermDraft.url}
                                              onChange={(event) =>
                                                store.updateNewTermDraft({
                                                  url: event.target.value,
                                                })
                                              }
                                            />
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="secondary"
                                              aria-label={intl.formatMessage(messages.openTermUrl)}
                                              disabled={!store.newTermDraft.url}
                                              onClick={() =>
                                                window.open(
                                                  store.newTermDraft.url,
                                                  "_blank",
                                                  "noopener,noreferrer",
                                                )
                                              }
                                            >
                                              <LinkIcon />
                                            </Button>
                                          </div>
                                        </Field>
                                      </div>
                                      <Field className="gap-1.5">
                                        <FieldLabel>
                                          <FormattedMessage {...messages.noteLabel} />
                                        </FieldLabel>
                                        <Textarea
                                          rows={2}
                                          placeholder={intl.formatMessage(
                                            messages.termNotePlaceholder,
                                          )}
                                          value={store.newTermDraft.note}
                                          onChange={(event) =>
                                            store.updateNewTermDraft({ note: event.target.value })
                                          }
                                        />
                                      </Field>
                                    </div>
                                  </td>
                                </tr>
                              </Fragment>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {canContribute ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (window.confirm(intl.formatMessage(messages.confirmDeleteConcept)))
                  deleteConcept.mutate(conceptId);
              }}
            >
              <TrashIcon />
              <FormattedMessage {...messages.deleteConcept} />
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={goBack}>
                <FormattedMessage {...messages.cancelEdit} />
              </Button>
              <Button
                type="button"
                aria-busy={saveConcept.isPending}
                disabled={!store.canSave || saveConcept.isPending}
                onClick={() => saveConcept.mutate()}
              >
                {saveConcept.isPending ? <Spinner className="size-4" /> : null}
                <FormattedMessage {...messages.save} />
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <AlertDialog
        open={Boolean(store.termToDeleteId)}
        onOpenChange={(open) => {
          if (!open) store.setTermToDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.confirmDeleteTermTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.confirmDeleteTermDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <FormattedMessage {...messages.cancelEdit} />
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (store.termToDeleteId) store.markTermForDeletion(store.termToDeleteId);
              }}
            >
              <FormattedMessage {...messages.deleteTerm} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {leaveGuardDialog}
    </main>
  );
});
