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
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  Delete02Icon,
  FilterIcon,
  Link01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type {
  GlossaryConceptRecord,
  GlossaryConceptTermRecord,
  GlossaryTermPageResponse,
  CreateGlossaryConceptBody,
  UpsertGlossaryConceptTermBody,
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
import { cn } from "@/lib/primitives/cn";
import {
  glossaryTermStatusValues,
  type GlossaryPartOfSpeech,
  type GlossaryTermStatus,
} from "@/lib/glossary/glossary";

import { availableConceptTermLocales } from "./available-concept-term-locales";
import { selectConceptDetailSourceTermText } from "./concept-detail-source-term";
import { sortConceptDetailTermGroups } from "./concept-detail-term-order";
import { glossaryDetailPageContentMessages as messages } from "./glossary-detail-page-content.messages";

type ConceptDraft = {
  primaryTerm: string;
  subject: string;
  definition: string;
  translatable: boolean;
  note: string;
  url: string;
};

type TermDraft = {
  term: string;
  partOfSpeech: string;
  gender: string | null;
  termType: string | null;
  status: GlossaryTermStatus;
  description: string;
  note: string;
  url: string;
};

type CreatingTermDraft = TermDraft & { id: string; locale: string };

const emptyConceptDraft: ConceptDraft = {
  primaryTerm: "",
  subject: "",
  definition: "",
  translatable: true,
  note: "",
  url: "",
};
const statusOptions = glossaryTermStatusValues;
const emptyTermDraft: TermDraft = {
  term: "",
  partOfSpeech: "",
  gender: null,
  termType: null,
  status: "draft",
  description: "",
  note: "",
  url: "",
};

function createCreatingTermDraft(locale: string, id: string): CreatingTermDraft {
  return { ...emptyTermDraft, id, locale };
}

function conceptDraftFromRecord(concept: GlossaryConceptRecord): ConceptDraft {
  return {
    primaryTerm: concept.primaryTerm,
    subject: concept.subject,
    definition: concept.definition,
    translatable: concept.translatable,
    note: concept.note,
    url: concept.url ?? "",
  };
}

function termDraftFromRecord(term: GlossaryConceptTermRecord): TermDraft {
  return {
    term: term.term,
    partOfSpeech: normalizePartOfSpeech(term.partOfSpeech) ?? "",
    gender: term.gender,
    termType: term.termType,
    status: term.status,
    description: term.description,
    note: term.note,
    url: term.url ?? "",
  };
}

function normalizePartOfSpeech(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return (normalized === "preposition" ? "adposition" : normalized) as GlossaryPartOfSpeech;
}

function areTermDraftsEqual(left: TermDraft, right: TermDraft) {
  return (
    left.term === right.term &&
    left.partOfSpeech === right.partOfSpeech &&
    left.gender === right.gender &&
    left.termType === right.termType &&
    left.status === right.status &&
    left.description === right.description &&
    left.note === right.note &&
    left.url === right.url
  );
}

function areConceptDraftsEqual(left: ConceptDraft, right: ConceptDraft) {
  return (
    left.subject === right.subject &&
    left.definition === right.definition &&
    left.translatable === right.translatable &&
    left.note === right.note &&
    left.url === right.url
  );
}

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
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const glossaryHref = `/org/${organizationSlug}/glossaries/${glossaryId}`;
  const conceptHref = (id: string) => `${glossaryHref}/concepts/${id}`;
  const [languageFilter, setLanguageFilter] = useState("");
  const [termCursor, setTermCursor] = useState<string | undefined>();
  const [, setTermCursorStack] = useState<string[]>([]);
  const [localePickerOpen, setLocalePickerOpen] = useState(false);
  const [newTermLocale, setNewTermLocale] = useState<string | null>(null);
  const [newTermDraft, setNewTermDraft] = useState<TermDraft>(emptyTermDraft);
  const [creatingTermDrafts, setCreatingTermDrafts] = useState<CreatingTermDraft[]>([]);
  const [termDrafts, setTermDrafts] = useState<Record<string, TermDraft>>({});
  const [deletedTermIds, setDeletedTermIds] = useState<Set<string>>(new Set());
  const [expandedTermIds, setExpandedTermIds] = useState<Set<string>>(new Set());
  const [expandedCreatingTermIds, setExpandedCreatingTermIds] = useState<Set<string>>(new Set());
  const [termToDeleteId, setTermToDeleteId] = useState<string | null>(null);
  const [conceptDraft, setConceptDraft] = useState<ConceptDraft>(emptyConceptDraft);
  const { glossaryQuery, glossary, canContribute, isConceptGlossary, sourceLanguage } = useGlossary(
    {
      organizationSlug,
      glossaryId,
      canManageGlossaries,
    },
  );

  const isCreatingConcept = conceptId === "new";
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
      termCursor,
      languageFilter,
    ],
    enabled: Boolean(conceptRecord) && !isCreatingConcept,
    queryFn: async ({ signal }) => {
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
            ...(termCursor ? { cursor: termCursor } : {}),
            ...(languageFilter.trim() ? { search: languageFilter.trim() } : {}),
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
  const selectedConcept = conceptRecord
    ? { ...conceptRecord, terms: termsQuery.data?.terms ?? [] }
    : null;
  useEffect(() => {
    if (conceptId === "new") {
      setConceptDraft(emptyConceptDraft);
      setTermDrafts({});
      setDeletedTermIds(new Set());
      setCreatingTermDrafts(
        sourceLanguage.locale
          ? [createCreatingTermDraft(sourceLanguage.locale, `new-source-${sourceLanguage.locale}`)]
          : [],
      );
      setNewTermLocale(null);
      setNewTermDraft(emptyTermDraft);
      setExpandedTermIds(new Set());
      setExpandedCreatingTermIds(new Set());
    }
  }, [conceptId, sourceLanguage.locale]);

  useEffect(() => {
    if (selectedConcept) {
      setConceptDraft(conceptDraftFromRecord(selectedConcept));
      setTermDrafts(
        Object.fromEntries(
          selectedConcept.terms.map((term) => [term.id, termDraftFromRecord(term)]),
        ),
      );
      setDeletedTermIds(new Set());
      setNewTermLocale(null);
      setNewTermDraft(emptyTermDraft);
      setCreatingTermDrafts([]);
      setExpandedTermIds(new Set());
      setExpandedCreatingTermIds(new Set());
    }
  }, [selectedConcept]);

  const conceptTermCandidates = isCreatingConcept
    ? creatingTermDrafts
    : [
        ...(selectedConcept?.terms ?? [])
          .filter((term) => !deletedTermIds.has(term.id))
          .map((term) => {
            const draft = termDrafts[term.id] ?? termDraftFromRecord(term);
            return {
              id: term.id,
              locale: term.locale,
              term: draft.term,
              status: draft.status,
            };
          }),
        ...(newTermLocale
          ? [
              {
                locale: newTermLocale,
                term: newTermDraft.term,
                status: newTermDraft.status,
              },
            ]
          : []),
      ];

  const sourceTermText = selectConceptDetailSourceTermText(
    conceptTermCandidates,
    sourceLanguage.locale,
  );

  const goBack = () => router.push(glossaryHref);

  const goToNextTermPage = () => {
    const nextCursor = termsQuery.data?.nextCursor;
    if (!nextCursor || isDirty) return;
    setTermCursorStack((current) => [...current, termCursor ?? ""]);
    setTermCursor(nextCursor);
  };

  const goToPreviousTermPage = () => {
    if (isDirty) return;
    setTermCursorStack((current) => {
      const next = [...current];
      setTermCursor(next.pop() || undefined);
      return next;
    });
  };

  const updateTermDraft = (termId: string, patch: Partial<TermDraft>) => {
    setTermDrafts((current) => {
      const draft = current[termId];
      return draft ? { ...current, [termId]: { ...draft, ...patch } } : current;
    });
  };

  const markTermForDeletion = (termId: string) => {
    setDeletedTermIds((current) => {
      const next = new Set(current);
      next.add(termId);
      return next;
    });
    setExpandedTermIds((current) => {
      const next = new Set(current);
      next.delete(termId);
      return next;
    });
    setTermToDeleteId(null);
  };

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
    mutationFn: async (draft: ConceptDraft) => {
      let concept: GlossaryConceptRecord;
      let created = false;
      const primaryTerm = sourceTermText.trim();
      if (!primaryTerm) throw new Error(intl.formatMessage(messages.saveConceptFailed));
      if (isCreatingConcept) {
        const terms: NonNullable<CreateGlossaryConceptBody["terms"]> = creatingTermDrafts
          .filter(({ term }) => term.trim())
          .map(({ id: _id, ...term }) => ({
            ...term,
            term: term.term.trim(),
            partOfSpeech: normalizePartOfSpeech(term.partOfSpeech),
            gender: term.gender as NonNullable<
              CreateGlossaryConceptBody["terms"]
            >[number]["gender"],
            termType: term.termType as NonNullable<
              CreateGlossaryConceptBody["terms"]
            >[number]["termType"],
            caseSensitive: false,
            forbidden: false,
          }));
        const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
          ":glossaryId"
        ].concepts.$post({
          param: { organizationSlug, glossaryId },
          json: {
            ...draft,
            primaryTerm,
            url: draft.url || undefined,
            terms: terms.map((term) => ({
              ...term,
              partOfSpeech: term.partOfSpeech as GlossaryPartOfSpeech,
            })),
          },
        });
        if (!response.ok)
          throw new Error(
            await readApiError(response, intl.formatMessage(messages.saveConceptFailed)),
          );
        concept = (await response.json()).concept as GlossaryConceptRecord;
        created = true;
      } else {
        if (!conceptId) throw new Error(intl.formatMessage(messages.saveConceptFailed));
        const terms: UpsertGlossaryConceptTermBody[] = selectedConcept
          ? selectedConcept.terms
              .filter((term) => !deletedTermIds.has(term.id))
              .map((term) => {
                const termDraft = termDrafts[term.id] ?? termDraftFromRecord(term);
                return {
                  id: term.id,
                  locale: term.locale,
                  term: termDraft.term,
                  partOfSpeech: normalizePartOfSpeech(termDraft.partOfSpeech),
                  gender: termDraft.gender as UpsertGlossaryConceptTermBody["gender"],
                  termType: termDraft.termType as UpsertGlossaryConceptTermBody["termType"],
                  status: termDraft.status,
                  description: termDraft.description,
                  note: termDraft.note,
                  url: termDraft.url,
                  caseSensitive: term.caseSensitive,
                  forbidden: term.forbidden,
                };
              })
          : [];
        if (newTermLocale && newTermDraft.term.trim()) {
          terms.push({
            locale: newTermLocale,
            term: newTermDraft.term,
            partOfSpeech: normalizePartOfSpeech(newTermDraft.partOfSpeech),
            gender: newTermDraft.gender as UpsertGlossaryConceptTermBody["gender"],
            termType: newTermDraft.termType as UpsertGlossaryConceptTermBody["termType"],
            status: newTermDraft.status,
            description: newTermDraft.description,
            note: newTermDraft.note,
            url: newTermDraft.url,
            caseSensitive: false,
            forbidden: false,
          });
        }
        const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
          ":glossaryId"
        ].concepts[":conceptId"].$patch({
          param: { organizationSlug, glossaryId, conceptId: conceptId },
          json: {
            ...draft,
            primaryTerm,
            url: draft.url || undefined,
            terms: terms.map((term) => ({
              ...term,
              partOfSpeech: term.partOfSpeech as GlossaryPartOfSpeech,
            })),
          },
        });
        if (!response.ok)
          throw new Error(
            await readApiError(response, intl.formatMessage(messages.saveConceptFailed)),
          );
        concept = (await response.json()).concept as GlossaryConceptRecord;
      }

      return { concept, created };
    },
    onSuccess: async ({ concept, created }) => {
      await Promise.all([invalidateConcepts(), invalidateConceptDetail()]);
      if (created) router.replace(conceptHref(concept.id));
      setNewTermLocale(null);
      setNewTermDraft(emptyTermDraft);
      setCreatingTermDrafts([]);
      setExpandedCreatingTermIds(new Set());
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
      router.push(glossaryHref);
      toast.success(intl.formatMessage(messages.conceptDeleted));
    },
    onError: (error) => toast.error(error.message),
  });

  const normalizedLanguageFilter = languageFilter.trim().toLowerCase();
  const availableTermLocales = availableConceptTermLocales();
  const unsortedTermGroups = (selectedConcept?.terms ?? [])
    .filter((term) => !deletedTermIds.has(term.id))
    .filter(
      (term) =>
        !normalizedLanguageFilter ||
        getLocaleLabel(term.locale).toLowerCase().includes(normalizedLanguageFilter) ||
        term.locale.toLowerCase().includes(normalizedLanguageFilter),
    )
    .reduce<Array<{ locale: string; terms: GlossaryConceptTermRecord[] }>>((groups, term) => {
      const group = groups.find((item) => item.locale === term.locale);
      if (group) group.terms.push(term);
      else groups.push({ locale: term.locale, terms: [term] });
      return groups;
    }, []);
  const termGroupsWithPendingLocale =
    newTermLocale &&
    !unsortedTermGroups.some((group) => group.locale === newTermLocale) &&
    (!normalizedLanguageFilter ||
      getLocaleLabel(newTermLocale).toLowerCase().includes(normalizedLanguageFilter) ||
      newTermLocale.toLowerCase().includes(normalizedLanguageFilter))
      ? [...unsortedTermGroups, { locale: newTermLocale, terms: [] }]
      : unsortedTermGroups;
  const termGroups = sortConceptDetailTermGroups(
    termGroupsWithPendingLocale,
    sourceLanguage.locale,
  );
  const creatingTermGroups = sortConceptDetailTermGroups(
    creatingTermDrafts
      .filter(
        (term) =>
          !normalizedLanguageFilter ||
          getLocaleLabel(term.locale).toLowerCase().includes(normalizedLanguageFilter) ||
          term.locale.toLowerCase().includes(normalizedLanguageFilter),
      )
      .reduce<Array<{ locale: string; terms: CreatingTermDraft[] }>>((groups, term) => {
        const group = groups.find((item) => item.locale === term.locale);
        if (group) group.terms.push(term);
        else groups.push({ locale: term.locale, terms: [term] });
        return groups;
      }, []),
    sourceLanguage.locale,
  );
  const conceptIsDirty = isCreatingConcept
    ? Boolean(sourceTermText.trim())
    : selectedConcept
      ? !areConceptDraftsEqual(conceptDraft, conceptDraftFromRecord(selectedConcept))
      : false;
  const termsAreDirty =
    deletedTermIds.size > 0 ||
    Boolean(
      selectedConcept?.terms.some((term) => {
        const draft = termDrafts[term.id];
        return draft && !areTermDraftsEqual(draft, termDraftFromRecord(term));
      }),
    );
  const newTermIsDirty = Boolean(newTermLocale && newTermDraft.term.trim());
  const isDirty =
    conceptIsDirty || termsAreDirty || newTermIsDirty || creatingTermDrafts.length > 0;

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
      <Link
        href={glossaryHref}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={1.8} />
        <FormattedMessage {...messages.backToGlossary} />
      </Link>
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
                value={conceptDraft.subject}
                onChange={(event) =>
                  setConceptDraft((draft) => ({ ...draft, subject: event.target.value }))
                }
                disabled={!canContribute}
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...messages.definitionLabel} />
              </FieldLabel>
              <Textarea
                value={conceptDraft.definition}
                onChange={(event) =>
                  setConceptDraft((draft) => ({ ...draft, definition: event.target.value }))
                }
                disabled={!canContribute}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={conceptDraft.translatable}
                onCheckedChange={(checked) =>
                  setConceptDraft((draft) => ({ ...draft, translatable: Boolean(checked) }))
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
                    value={conceptDraft.note}
                    onChange={(event) =>
                      setConceptDraft((draft) => ({ ...draft, note: event.target.value }))
                    }
                    disabled={!canContribute}
                  />
                </Field>
                <Field className="gap-1.5">
                  <FieldLabel>
                    <FormattedMessage {...messages.urlLabel} />
                  </FieldLabel>
                  <Input
                    value={conceptDraft.url}
                    onChange={(event) =>
                      setConceptDraft((draft) => ({ ...draft, url: event.target.value }))
                    }
                    disabled={!canContribute}
                  />
                </Field>
              </div>
            </details>
          </div>
          <div className="min-h-0 min-w-0">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative min-w-0 flex-1">
                <HugeiconsIcon
                  icon={FilterIcon}
                  className="absolute left-2 top-2.5 size-4 text-muted-foreground"
                  strokeWidth={1.8}
                />
                <Input
                  className="pl-8"
                  placeholder={intl.formatMessage(messages.filterLanguages)}
                  value={languageFilter}
                  onChange={(event) => {
                    setLanguageFilter(event.target.value);
                    setTermCursor(undefined);
                    setTermCursorStack([]);
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={!canContribute || availableTermLocales.length === 0}
                onClick={() => setLocalePickerOpen(true)}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
                <FormattedMessage {...messages.addTerm} />
              </Button>
            </div>
            {!isCreatingConcept &&
            termsQuery.data &&
            (termsQuery.data.pagination.hasMore || termCursor) ? (
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!termCursor || isDirty || termsQuery.isFetching}
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
            <Dialog open={localePickerOpen} onOpenChange={setLocalePickerOpen}>
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
                          const id = `new-${crypto.randomUUID()}`;
                          setCreatingTermDrafts((drafts) => [
                            ...drafts,
                            {
                              ...emptyTermDraft,
                              id,
                              locale,
                            },
                          ]);
                          setExpandedCreatingTermIds((current) => new Set(current).add(id));
                        } else {
                          setNewTermLocale(locale);
                          setNewTermDraft(emptyTermDraft);
                        }
                        setLocalePickerOpen(false);
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
                                onClick={() => {
                                  const id = `new-${crypto.randomUUID()}`;
                                  setCreatingTermDrafts((drafts) => [
                                    ...drafts,
                                    {
                                      ...emptyTermDraft,
                                      id,
                                      locale: group.locale,
                                    },
                                  ]);
                                  setExpandedCreatingTermIds((current) => new Set(current).add(id));
                                }}
                              >
                                <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
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
                                  const isExpanded = expandedCreatingTermIds.has(term.id);
                                  const isSourceTerm = term.locale === sourceLanguage.locale;
                                  return (
                                    <Fragment key={term.id}>
                                      <tr className="border-t border-border">
                                        <td className="px-3 py-2">
                                          <Textarea
                                            autoFocus={creatingTermDrafts.at(-1)?.id === term.id}
                                            className="w-48 max-w-full min-h-8 resize-y px-2 py-1.5 text-sm leading-5"
                                            placeholder={intl.formatMessage(messages.termLabel)}
                                            value={term.term}
                                            required={isSourceTerm}
                                            onChange={(event) =>
                                              setCreatingTermDrafts((drafts) =>
                                                drafts.map((draft) =>
                                                  draft.id === term.id
                                                    ? { ...draft, term: event.target.value }
                                                    : draft,
                                                ),
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <PartOfSpeechPicker
                                            value={term.partOfSpeech}
                                            onValueChange={(value) =>
                                              setCreatingTermDrafts((drafts) =>
                                                drafts.map((draft) =>
                                                  draft.id === term.id
                                                    ? { ...draft, partOfSpeech: value }
                                                    : draft,
                                                ),
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <GenderPicker
                                            value={term.gender ?? ""}
                                            onValueChange={(value) =>
                                              setCreatingTermDrafts((drafts) =>
                                                drafts.map((draft) =>
                                                  draft.id === term.id
                                                    ? { ...draft, gender: value }
                                                    : draft,
                                                ),
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <TermTypePicker
                                            value={term.termType ?? ""}
                                            onValueChange={(value) =>
                                              setCreatingTermDrafts((drafts) =>
                                                drafts.map((draft) =>
                                                  draft.id === term.id
                                                    ? { ...draft, termType: value }
                                                    : draft,
                                                ),
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <Select
                                            value={term.status}
                                            onValueChange={(value) =>
                                              setCreatingTermDrafts((drafts) =>
                                                drafts.map((draft) =>
                                                  draft.id === term.id
                                                    ? {
                                                        ...draft,
                                                        status: (value ??
                                                          "draft") as TermDraft["status"],
                                                      }
                                                    : draft,
                                                ),
                                              )
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
                                              setExpandedCreatingTermIds((current) => {
                                                const next = new Set(current);
                                                if (next.has(term.id)) next.delete(term.id);
                                                else next.add(term.id);
                                                return next;
                                              })
                                            }
                                          >
                                            <HugeiconsIcon
                                              icon={ArrowDown01Icon}
                                              strokeWidth={1.8}
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
                                                      setCreatingTermDrafts((drafts) =>
                                                        drafts.map((draft) =>
                                                          draft.id === term.id
                                                            ? {
                                                                ...draft,
                                                                description: event.target.value,
                                                              }
                                                            : draft,
                                                        ),
                                                      )
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
                                                        setCreatingTermDrafts((drafts) =>
                                                          drafts.map((draft) =>
                                                            draft.id === term.id
                                                              ? {
                                                                  ...draft,
                                                                  url: event.target.value,
                                                                }
                                                              : draft,
                                                          ),
                                                        )
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
                                                      <HugeiconsIcon
                                                        icon={Link01Icon}
                                                        strokeWidth={1.8}
                                                      />
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
                                                    setCreatingTermDrafts((drafts) =>
                                                      drafts.map((draft) =>
                                                        draft.id === term.id
                                                          ? {
                                                              ...draft,
                                                              note: event.target.value,
                                                            }
                                                          : draft,
                                                      ),
                                                    )
                                                  }
                                                />
                                              </Field>
                                              {!isSourceTerm ? (
                                                <div className="flex justify-end border-t border-border pt-3">
                                                  <Button
                                                    type="button"
                                                    variant="destructive"
                                                    onClick={() => {
                                                      setCreatingTermDrafts((drafts) =>
                                                        drafts.filter(
                                                          (draft) => draft.id !== term.id,
                                                        ),
                                                      );
                                                      setExpandedCreatingTermIds((current) => {
                                                        const next = new Set(current);
                                                        next.delete(term.id);
                                                        return next;
                                                      });
                                                    }}
                                                  >
                                                    <HugeiconsIcon
                                                      icon={Delete02Icon}
                                                      strokeWidth={1.8}
                                                    />
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
                            onClick={() => {
                              setNewTermLocale(group.locale);
                              setNewTermDraft(emptyTermDraft);
                            }}
                          >
                            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
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
                              const draft = termDrafts[term.id] ?? termDraftFromRecord(term);
                              const isTermDirty = !areTermDraftsEqual(
                                draft,
                                termDraftFromRecord(term),
                              );
                              const isExpanded = expandedTermIds.has(term.id);
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
                                              updateTermDraft(term.id, {
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
                                            updateTermDraft(term.id, {
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
                                            updateTermDraft(term.id, { gender: value })
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
                                            updateTermDraft(term.id, { termType: value })
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
                                            updateTermDraft(term.id, {
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
                                          onClick={() =>
                                            setExpandedTermIds((current) => {
                                              const next = new Set(current);
                                              if (next.has(term.id)) next.delete(term.id);
                                              else next.add(term.id);
                                              return next;
                                            })
                                          }
                                        >
                                          <HugeiconsIcon
                                            icon={ArrowDown01Icon}
                                            strokeWidth={1.8}
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
                                                  updateTermDraft(term.id, {
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
                                                    updateTermDraft(term.id, {
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
                                                  <HugeiconsIcon
                                                    icon={Link01Icon}
                                                    strokeWidth={1.8}
                                                  />
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
                                                updateTermDraft(term.id, {
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
                                                onClick={() => setTermToDeleteId(term.id)}
                                              >
                                                <HugeiconsIcon
                                                  icon={Delete02Icon}
                                                  strokeWidth={1.8}
                                                />
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
                            {newTermLocale === group.locale && canContribute ? (
                              <Fragment>
                                <tr className="border-t border-emerald-500/30 bg-emerald-500/5">
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <Textarea
                                        autoFocus
                                        className="w-48 max-w-full min-h-8 resize-y px-2 py-1.5 text-sm leading-5"
                                        placeholder={intl.formatMessage(messages.termLabel)}
                                        value={newTermDraft.term}
                                        onChange={(event) =>
                                          setNewTermDraft({
                                            ...newTermDraft,
                                            term: event.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <PartOfSpeechPicker
                                      value={newTermDraft.partOfSpeech}
                                      onValueChange={(value) =>
                                        setNewTermDraft({
                                          ...newTermDraft,
                                          partOfSpeech: value,
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <GenderPicker
                                      value={newTermDraft.gender ?? ""}
                                      onValueChange={(value) =>
                                        setNewTermDraft({
                                          ...newTermDraft,
                                          gender: value,
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <TermTypePicker
                                      value={newTermDraft.termType ?? ""}
                                      onValueChange={(value) =>
                                        setNewTermDraft({
                                          ...newTermDraft,
                                          termType: value,
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <Select
                                      value={newTermDraft.status}
                                      onValueChange={(value) =>
                                        setNewTermDraft({
                                          ...newTermDraft,
                                          status: (value ?? "draft") as TermDraft["status"],
                                        })
                                      }
                                    >
                                      <SelectTrigger
                                        showIcon={false}
                                        className={statusPickerTriggerClass()}
                                      >
                                        <SelectValue>
                                          <StatusLabel status={newTermDraft.status} />
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
                                        onClick={() => {
                                          setNewTermLocale(null);
                                          setNewTermDraft(emptyTermDraft);
                                        }}
                                      >
                                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
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
                                            value={newTermDraft.description}
                                            onChange={(event) =>
                                              setNewTermDraft({
                                                ...newTermDraft,
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
                                              value={newTermDraft.url}
                                              onChange={(event) =>
                                                setNewTermDraft({
                                                  ...newTermDraft,
                                                  url: event.target.value,
                                                })
                                              }
                                            />
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="secondary"
                                              aria-label={intl.formatMessage(messages.openTermUrl)}
                                              disabled={!newTermDraft.url}
                                              onClick={() =>
                                                window.open(
                                                  newTermDraft.url,
                                                  "_blank",
                                                  "noopener,noreferrer",
                                                )
                                              }
                                            >
                                              <HugeiconsIcon icon={Link01Icon} strokeWidth={1.8} />
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
                                          value={newTermDraft.note}
                                          onChange={(event) =>
                                            setNewTermDraft({
                                              ...newTermDraft,
                                              note: event.target.value,
                                            })
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
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
              <FormattedMessage {...messages.deleteConcept} />
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={goBack}>
                <FormattedMessage {...messages.cancelEdit} />
              </Button>
              <Button
                type="button"
                aria-busy={saveConcept.isPending}
                disabled={!sourceTermText.trim() || !isDirty || saveConcept.isPending}
                onClick={() => saveConcept.mutate(conceptDraft)}
              >
                {saveConcept.isPending ? <Spinner className="size-4" /> : null}
                <FormattedMessage {...messages.save} />
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <AlertDialog
        open={Boolean(termToDeleteId)}
        onOpenChange={(open) => {
          if (!open) setTermToDeleteId(null);
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
                if (termToDeleteId) markTermForDeletion(termToDeleteId);
              }}
            >
              <FormattedMessage {...messages.deleteTerm} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
