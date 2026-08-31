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
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  BookOpenTextIcon,
  Delete02Icon,
  FilterIcon,
  Link01Icon,
  MoreHorizontalIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type {
  GlossaryConceptRecord,
  GlossaryConceptTermRecord,
  GlossaryProjectRecord,
  GlossaryRecord,
  GlossaryResponse,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { getLocaleLabel } from "@/lib/i18n/locales";
import { cn } from "@/lib/primitives/cn";
import {
  glossaryTermStatusValues,
  selectGlossaryPrimaryTerm,
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

function arrayBufferToBase64(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
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

function teamControlLevelDisplayLabel(
  glossary: GlossaryRecord,
  intl: ReturnType<typeof useIntl>,
): string {
  const teamName = glossary.teamName?.trim();
  if (teamName) {
    return teamName;
  }

  return intl.formatMessage(messages.controlLevelTeam);
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

function ConceptListSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6" aria-busy="true">
      <Skeleton className="h-4 w-24 rounded-full" />
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </section>
      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid min-w-[760px] grid-cols-[2.5rem_1.4fr_2fr_1fr_1fr_1fr] gap-4 border-b border-border bg-muted/30 px-3 py-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-20 max-w-full" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="grid min-w-[760px] grid-cols-[2.5rem_1.4fr_2fr_1fr_1fr_1fr] gap-4 border-b border-border px-3 py-4 last:border-b-0"
            >
              <Skeleton className="size-4 rounded-md" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-36 max-w-full" />
                <TermStatusSkeleton compact />
              </div>
              <Skeleton className="h-4 w-full max-w-xs" />
              <Skeleton className="h-4 w-24 max-w-full" />
              <Skeleton className="h-4 w-28 max-w-full" />
              <Skeleton className="h-4 w-28 max-w-full" />
            </div>
          ))}
        </div>
      </section>
    </main>
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

export function GlossaryDetailPageContent({
  organizationSlug,
  glossaryId,
  canManageGlossaries,
  conceptId,
}: {
  organizationSlug: string;
  glossaryId: string;
  canManageGlossaries: boolean;
  conceptId?: string;
}) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const conceptPageMode = Boolean(conceptId);
  const glossaryHref = `/org/${organizationSlug}/glossaries/${glossaryId}`;
  const conceptHref = (id: string) => `${glossaryHref}/concepts/${id}`;
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(conceptId ?? null);
  const [conceptDraft, setConceptDraft] = useState<ConceptDraft>(emptyConceptDraft);
  const [isCreatingConcept, setIsCreatingConcept] = useState(conceptId === "new");
  const [selectedConceptIds, setSelectedConceptIds] = useState<Set<string>>(new Set());
  const [conceptSort, setConceptSort] = useState<"asc" | "desc">("asc");
  const [languageFilter, setLanguageFilter] = useState("");
  const [localePickerOpen, setLocalePickerOpen] = useState(false);
  const [newTermLocale, setNewTermLocale] = useState<string | null>(null);
  const [newTermDraft, setNewTermDraft] = useState<TermDraft>(emptyTermDraft);
  const [creatingTermDrafts, setCreatingTermDrafts] = useState<CreatingTermDraft[]>([]);
  const [termDrafts, setTermDrafts] = useState<Record<string, TermDraft>>({});
  const [deletedTermIds, setDeletedTermIds] = useState<Set<string>>(new Set());
  const [expandedTermIds, setExpandedTermIds] = useState<Set<string>>(new Set());
  const [expandedCreatingTermIds, setExpandedCreatingTermIds] = useState<Set<string>>(new Set());
  const [termToDeleteId, setTermToDeleteId] = useState<string | null>(null);
  const [deleteGlossaryDialogOpen, setDeleteGlossaryDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const skipNameBlurSave = useRef(false);
  const glossaryFileInputRef = useRef<HTMLInputElement>(null);

  const glossaryQuery = useQuery({
    queryKey: ["glossary", organizationSlug, glossaryId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[":glossaryId"].$get(
        {
          param: { organizationSlug, glossaryId },
        },
      );
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadGlossaryFailed)),
        );
      return (await response.json()) as GlossaryResponse;
    },
  });
  const glossary = glossaryQuery.data?.glossary;
  const glossaryCanContribute = glossaryQuery.data?.canContribute ?? false;
  const isNative = glossary?.source === "native";
  const isLiveCrowdin =
    glossary?.source === "external_tms" && glossary.externalProviderKind === "crowdin";
  const isConceptGlossary = isNative || isLiveCrowdin;
  const canManage = canManageGlossaries && isConceptGlossary;
  const canContribute = isConceptGlossary && (canManage || glossaryCanContribute);
  const sourceLanguage = glossary?.languages.find((language) => language.isSource) ?? {
    locale: glossary?.sourceLocale ?? "",
    name: getLocaleLabel(glossary?.sourceLocale ?? ""),
    isSource: true,
  };

  useEffect(() => {
    if (glossary) setNameDraft(glossary.name);
  }, [glossary?.name]);

  const conceptsQuery = useQuery({
    queryKey: ["glossary-concepts", organizationSlug, glossaryId],
    enabled: Boolean(isConceptGlossary),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts.$get({
        param: { organizationSlug, glossaryId },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadConceptsFailed)),
        );
      return (await response.json()).concepts as GlossaryConceptRecord[];
    },
  });
  const attachedProjectsQuery = useQuery({
    queryKey: ["glossary-projects", organizationSlug, glossaryId],
    enabled: Boolean(isNative || isLiveCrowdin),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].projects.$get({
        param: { organizationSlug, glossaryId },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadProjectsFailed)),
        );
      return (await response.json()).projects as GlossaryProjectRecord[];
    },
  });
  const projectsQuery = useQuery({
    queryKey: ["translation-projects", organizationSlug],
    enabled: Boolean(isNative),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadProjectsFailed)),
        );
      return (await response.json()).projects as Array<{
        id: string;
        name: string;
        sourceLocale: string;
      }>;
    },
  });

  const concepts = conceptsQuery.data ?? [];
  const selectedConcept = concepts.find((concept) => concept.id === selectedConceptId) ?? null;
  const attachedProjectIds = useMemo(
    () => new Set((attachedProjectsQuery.data ?? []).map((project) => project.projectId)),
    [attachedProjectsQuery.data],
  );
  const availableProjects = (projectsQuery.data ?? []).filter(
    (project) => !attachedProjectIds.has(project.id),
  );

  useEffect(() => {
    setSelectedConceptId(conceptId ?? null);
    setIsCreatingConcept(conceptId === "new");
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
      setIsCreatingConcept(false);
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

  const goBack = () => {
    if (conceptPageMode) router.push(glossaryHref);
    else setSelectedConceptId(null);
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
    queryClient.invalidateQueries({
      queryKey: ["glossary-concepts", organizationSlug, glossaryId],
    });
  const invalidateProjects = () =>
    queryClient.invalidateQueries({
      queryKey: ["glossary-projects", organizationSlug, glossaryId],
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
        if (!selectedConceptId) throw new Error(intl.formatMessage(messages.saveConceptFailed));
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
          param: { organizationSlug, glossaryId, conceptId: selectedConceptId },
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
      await invalidateConcepts();
      if (conceptPageMode && created) router.replace(conceptHref(concept.id));
      else {
        setSelectedConceptId(concept.id);
        setIsCreatingConcept(false);
      }
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
      await invalidateConcepts();
      if (conceptPageMode) router.push(glossaryHref);
      else setSelectedConceptId(null);
      toast.success(intl.formatMessage(messages.conceptDeleted));
    },
    onError: (error) => toast.error(error.message),
  });
  const importConcepts = useMutation({
    mutationFn: async (file: File) => {
      const filename = file.name.toLowerCase();
      const isXlsx = filename.endsWith(".xlsx");
      const format = filename.endsWith(".tbx") ? "tbx" : isXlsx ? "xlsx" : "csv";
      const content = isXlsx ? arrayBufferToBase64(await file.arrayBuffer()) : await file.text();
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts["import"].$post({
        param: { organizationSlug, glossaryId },
        json: {
          format,
          content,
          sourceFilename: file.name,
          contentEncoding: isXlsx ? "base64" : "utf8",
          mode: "merge",
          previewForMode: "merge",
          strictLocale: true,
          localeMapping: {},
        },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.importTermsFailed)),
        );
      return response.json();
    },
    onSuccess: async (body) => {
      await invalidateConcepts();
      toast.success(intl.formatMessage(messages.termsImported, { count: body.imported ?? 0 }));
    },
    onError: (error) => toast.error(error.message),
  });
  const exportGlossary = useMutation({
    mutationFn: async (input: {
      format: "csv" | "tbx" | "xlsx";
      scope: "complete" | "filtered";
    }) => {
      const params = new URLSearchParams({ format: input.format, scope: input.scope });
      if (input.scope === "filtered" && normalizedLanguageFilter) {
        params.set("locale", normalizedLanguageFilter);
      }
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/glossaries/${encodeURIComponent(glossaryId)}/export?${params.toString()}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.exportFailed)));
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const filename = encodedFilename
        ? decodeURIComponent(encodedFilename)
        : `glossary.${input.format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      return Number(response.headers.get("x-hyperlocalise-export-warning-count") ?? 0);
    },
    onSuccess: (warningCount) => {
      if (warningCount > 0) {
        toast.warning(intl.formatMessage(messages.exportWarnings, { count: warningCount }));
      } else {
        toast.success(intl.formatMessage(messages.exportComplete));
      }
    },
    onError: (error) => toast.error(error.message),
  });
  const updateGlossaryName = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].$patch({
        param: { organizationSlug, glossaryId },
        json: { name },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.updateGlossaryNameFailed)),
        );
      return (await response.json()).glossary as GlossaryRecord;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["glossary", organizationSlug, glossaryId],
      });
      toast.success(intl.formatMessage(messages.glossaryNameUpdated));
    },
  });
  const deleteGlossary = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].$delete({
        param: { organizationSlug, glossaryId },
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.deleteGlossaryFailed)),
        );
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["glossaries", organizationSlug] }),
        queryClient.invalidateQueries({ queryKey: ["native-glossaries", organizationSlug] }),
      ]);
      toast.success(intl.formatMessage(messages.glossaryDeleted));
      setDeleteGlossaryDialogOpen(false);
      router.push(`/org/${organizationSlug}/glossaries`);
    },
    onError: (error) => toast.error(error.message),
  });

  const saveGlossaryName = async () => {
    const name = nameDraft.trim();
    if (!name || !glossary || name === glossary.name) {
      setNameDraft(glossary?.name ?? nameDraft);
      return;
    }
    try {
      await updateGlossaryName.mutateAsync(name);
    } catch (error) {
      setNameDraft(glossary.name);
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(messages.updateGlossaryNameFailed),
      );
    }
  };
  const attachProject = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].projects.$post({
        param: { organizationSlug, glossaryId },
        json: { projectId, priority: 0 },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.assignProjectFailed)),
        );
    },
    onSuccess: async () => {
      await invalidateProjects();
      setSelectedProjectId("");
      toast.success(intl.formatMessage(messages.projectAssigned));
    },
    onError: (error) => toast.error(error.message),
  });
  const detachProject = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].projects[":projectId"].$delete({
        param: { organizationSlug, glossaryId, projectId },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.removeProjectFailed)),
        );
    },
    onSuccess: async () => {
      await invalidateProjects();
      toast.success(intl.formatMessage(messages.projectRemoved));
    },
    onError: (error) => toast.error(error.message),
  });

  if (glossaryQuery.isLoading || (conceptPageMode && !isCreatingConcept && conceptsQuery.isLoading))
    return conceptPageMode ? <ConceptDetailSkeleton /> : <ConceptListSkeleton />;
  if (!glossary)
    return (
      <TypographyP className="py-8 text-sm text-muted-foreground">
        <FormattedMessage {...messages.notFound} />
      </TypographyP>
    );
  if (!conceptPageMode && conceptsQuery.isLoading) return <ConceptListSkeleton />;

  const filteredConcepts = concepts
    .filter((concept) => {
      const search = languageFilter.trim().toLowerCase();
      return (
        !search ||
        concept.terms.some(
          (term) =>
            term.locale.toLowerCase().includes(search) ||
            getLocaleLabel(term.locale).toLowerCase().includes(search),
        )
      );
    })
    .sort(
      (left, right) =>
        (conceptSort === "asc" ? 1 : -1) * left.primaryTerm.localeCompare(right.primaryTerm),
    );
  const selected = concepts.find((concept) => concept.id === selectedConceptId) ?? null;
  const allSelected =
    filteredConcepts.length > 0 &&
    filteredConcepts.every((concept) => selectedConceptIds.has(concept.id));
  const normalizedLanguageFilter = languageFilter.trim().toLowerCase();
  const availableTermLocales = availableConceptTermLocales();
  const unsortedTermGroups = (selected?.terms ?? [])
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
  if (conceptPageMode && !isCreatingConcept && conceptsQuery.isSuccess && !selected) {
    return (
      <TypographyP className="py-8 text-sm text-muted-foreground">
        <FormattedMessage {...messages.notFound} />
      </TypographyP>
    );
  }

  const conceptEditorFrame = (children: ReactNode) =>
    conceptPageMode ? (
      <section className="grid gap-5 rounded-lg border border-border p-4">{children}</section>
    ) : (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) setSelectedConceptId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-background text-foreground sm:max-w-7xl">
          {children}
        </DialogContent>
      </Dialog>
    );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <Link
        href={conceptPageMode ? glossaryHref : `/org/${organizationSlug}/glossaries`}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={1.8} />
        <FormattedMessage {...(conceptPageMode ? messages.backToGlossary : messages.backToList)} />
      </Link>
      {!conceptPageMode ? (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <HugeiconsIcon
                icon={BookOpenTextIcon}
                className="size-5 text-muted-foreground"
                strokeWidth={1.8}
              />
              <Badge variant="outline">
                {isNative ? (
                  glossary.controlLevel === "team" ? (
                    teamControlLevelDisplayLabel(glossary, intl)
                  ) : (
                    <FormattedMessage {...messages.controlLevelOrg} />
                  )
                ) : (
                  <FormattedMessage {...messages.sourceProvider} />
                )}
              </Badge>
              {glossary.languages.map((language) => (
                <Badge
                  key={language.locale}
                  variant="outline"
                  className={
                    language.isSource
                      ? "border-emerald-500/30 text-emerald-700"
                      : "border-amber-500/30 text-amber-700"
                  }
                >
                  {language.name}{" "}
                  <span className="ml-1 text-[10px] opacity-70">{language.locale}</span>
                </Badge>
              ))}
            </div>
            {canManage ? (
              <>
                <TypographyH1 className="sr-only">{glossary.name}</TypographyH1>
                <Textarea
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.currentTarget.value)}
                  onBlur={() => {
                    if (skipNameBlurSave.current) {
                      skipNameBlurSave.current = false;
                      return;
                    }
                    void saveGlossaryName();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      skipNameBlurSave.current = true;
                      setNameDraft(glossary.name);
                      event.currentTarget.blur();
                    }
                  }}
                  disabled={updateGlossaryName.isPending}
                  aria-label={intl.formatMessage(messages.editName)}
                  rows={1}
                  className={cn(
                    "font-heading min-h-14 shrink-0 resize-none overflow-hidden rounded-none border-transparent bg-transparent px-0 py-1 text-3xl font-semibold text-balance text-foreground shadow-none md:text-5xl lg:text-6xl",
                    "focus-visible:border-transparent focus-visible:ring-0",
                  )}
                />
              </>
            ) : (
              <TypographyH1 className="font-sans text-3xl font-semibold text-balance md:text-5xl lg:text-6xl">
                {glossary.name}
              </TypographyH1>
            )}
            <TypographyP className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {glossary.description || intl.formatMessage(messages.descriptionFallback)}
            </TypographyP>
            {canManage && isNative ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteGlossaryDialogOpen(true)}
                  disabled={deleteGlossary.isPending}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} data-icon="inline-start" />
                  <FormattedMessage {...messages.deleteGlossary} />
                </Button>
              </div>
            ) : null}
          </section>

          {isConceptGlossary ? (
            <section className="grid gap-4 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <TypographyP className="text-sm font-medium text-foreground">
                    <FormattedMessage {...messages.conceptsTitle} />
                  </TypographyP>
                  <TypographyP className="text-xs text-muted-foreground">
                    <FormattedMessage {...messages.conceptsDescription} />
                  </TypographyP>
                </div>
                {canManage || canContribute || isNative ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {isNative ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              disabled={exportGlossary.isPending || importConcepts.isPending}
                              aria-label={intl.formatMessage(messages.glossaryActions)}
                            >
                              {exportGlossary.isPending ? (
                                <Spinner />
                              ) : (
                                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} />
                              )}
                              <FormattedMessage {...messages.glossaryActions} />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={exportGlossary.isPending || importConcepts.isPending}
                            onClick={() =>
                              exportGlossary.mutate({ format: "tbx", scope: "complete" })
                            }
                          >
                            <FormattedMessage {...messages.exportAsTbx} />
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={exportGlossary.isPending || importConcepts.isPending}
                            onClick={() =>
                              exportGlossary.mutate({ format: "csv", scope: "complete" })
                            }
                          >
                            <FormattedMessage {...messages.exportAsCsv} />
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={exportGlossary.isPending || importConcepts.isPending}
                            onClick={() =>
                              exportGlossary.mutate({ format: "xlsx", scope: "complete" })
                            }
                          >
                            <FormattedMessage {...messages.exportAsXlsx} />
                          </DropdownMenuItem>
                          {normalizedLanguageFilter ? (
                            <>
                              <DropdownMenuItem
                                disabled={exportGlossary.isPending || importConcepts.isPending}
                                onClick={() =>
                                  exportGlossary.mutate({ format: "tbx", scope: "filtered" })
                                }
                              >
                                <FormattedMessage {...messages.exportFilteredAsTbx} />
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={exportGlossary.isPending || importConcepts.isPending}
                                onClick={() =>
                                  exportGlossary.mutate({ format: "csv", scope: "filtered" })
                                }
                              >
                                <FormattedMessage {...messages.exportFilteredAsCsv} />
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={exportGlossary.isPending || importConcepts.isPending}
                                onClick={() =>
                                  exportGlossary.mutate({ format: "xlsx", scope: "filtered" })
                                }
                              >
                                <FormattedMessage {...messages.exportFilteredAsXlsx} />
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                    {canManage ? (
                      <div className="flex flex-col items-end gap-1">
                        <input
                          ref={glossaryFileInputRef}
                          id="glossary-file-import"
                          type="file"
                          accept=".csv,.tbx,.xlsx,text/csv,application/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          className="sr-only"
                          aria-label={intl.formatMessage(messages.importGlossary)}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) importConcepts.mutate(file);
                            event.currentTarget.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={importConcepts.isPending || exportGlossary.isPending}
                          aria-controls="glossary-file-import"
                          aria-busy={importConcepts.isPending}
                          onClick={() => glossaryFileInputRef.current?.click()}
                        >
                          {importConcepts.isPending ? (
                            <Spinner />
                          ) : (
                            <HugeiconsIcon
                              icon={Upload01Icon}
                              strokeWidth={1.8}
                              data-icon="inline-start"
                            />
                          )}
                          <FormattedMessage
                            {...(importConcepts.isPending
                              ? messages.importingGlossary
                              : messages.importGlossary)}
                          />
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          <FormattedMessage {...messages.importFormats} />
                        </span>
                      </div>
                    ) : null}
                    {canContribute ? (
                      <Button
                        type="button"
                        onClick={() => router.push(`${glossaryHref}/concepts/new`)}
                      >
                        <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
                        <FormattedMessage {...messages.addConcept} />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {conceptsQuery.isError ? (
                <TypographyP className="text-sm text-destructive">
                  {conceptsQuery.error.message}
                </TypographyP>
              ) : null}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-10 px-3 py-2">
                        <Checkbox
                          aria-label="Select all concepts"
                          checked={
                            allSelected
                              ? true
                              : selectedConceptIds.size > 0
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={(checked) =>
                            setSelectedConceptIds(
                              checked
                                ? new Set(filteredConcepts.map((concept) => concept.id))
                                : new Set(),
                            )
                          }
                        />
                      </th>
                      <th className="px-3 py-2">
                        <button
                          type="button"
                          className="font-medium"
                          onClick={() =>
                            setConceptSort((sort) => (sort === "asc" ? "desc" : "asc"))
                          }
                        >
                          {sourceLanguage.name} {conceptSort === "asc" ? "↑" : "↓"}
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <FormattedMessage {...messages.definitionLabel} />
                      </th>
                      <th className="px-3 py-2">
                        <FormattedMessage {...messages.subjectLabel} />
                      </th>
                      <th className="px-3 py-2">
                        <FormattedMessage {...messages.created} />
                      </th>
                      <th className="px-3 py-2">
                        <FormattedMessage {...messages.lastModified} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConcepts.map((concept) => {
                      const primary = selectGlossaryPrimaryTerm(
                        concept.terms.map((term) => ({
                          id: term.id,
                          locale: term.locale,
                          text: term.term,
                          status: term.status as TermDraft["status"],
                        })),
                        glossary.sourceLocale,
                      );
                      return (
                        <tr
                          key={concept.id}
                          className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/20"
                          onClick={() => router.push(conceptHref(concept.id))}
                        >
                          <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              aria-label={`Select ${concept.primaryTerm}`}
                              checked={selectedConceptIds.has(concept.id)}
                              onCheckedChange={(checked) =>
                                setSelectedConceptIds((current) => {
                                  const next = new Set(current);
                                  if (checked) next.add(concept.id);
                                  else next.delete(concept.id);
                                  return next;
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2 font-medium">
                              {primary?.text ?? concept.primaryTerm}
                              {primary ? (
                                <Badge
                                  variant="outline"
                                  className={statusBadgeClass(primary.status)}
                                >
                                  <StatusLabel status={primary.status} />
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="max-w-xs truncate px-3 py-3 text-muted-foreground">
                            {concept.definition || "—"}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {concept.subject || "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                            {formatDate(concept.createdAt)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                            {formatDate(concept.updatedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {conceptsQuery.isSuccess && filteredConcepts.length === 0 ? (
                  <TypographyP className="px-4 py-8 text-sm text-muted-foreground">
                    <FormattedMessage {...messages.noConcepts} />
                  </TypographyP>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-border p-4">
              <TypographyP className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.providerReadOnly} />
              </TypographyP>
            </section>
          )}
        </>
      ) : null}

      {selectedConceptId
        ? conceptEditorFrame(
            <>
              {conceptPageMode ? (
                <div className="grid gap-1">
                  <TypographyH1 className="font-sans text-2xl font-medium">
                    {isCreatingConcept ? (
                      <FormattedMessage {...messages.addConcept} />
                    ) : (
                      sourceTermText || selectedConceptId
                    )}
                  </TypographyH1>
                  <TypographyP className="text-sm text-muted-foreground">
                    {sourceLanguage.name} · {sourceLanguage.locale}
                  </TypographyP>
                </div>
              ) : (
                <DialogHeader>
                  <DialogTitle>
                    {isCreatingConcept ? (
                      <FormattedMessage {...messages.addConcept} />
                    ) : (
                      <FormattedMessage
                        {...messages.conceptId}
                        values={{ id: selectedConceptId }}
                      />
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {sourceLanguage.name} · {sourceLanguage.locale}
                  </DialogDescription>
                </DialogHeader>
              )}
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
                        onChange={(event) => setLanguageFilter(event.target.value)}
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
                                    <span className="text-xs text-muted-foreground">
                                      {group.locale}
                                    </span>
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
                                        setExpandedCreatingTermIds((current) =>
                                          new Set(current).add(id),
                                        );
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
                                                  autoFocus={
                                                    creatingTermDrafts.at(-1)?.id === term.id
                                                  }
                                                  className="w-48 max-w-full min-h-8 resize-y px-2 py-1.5 text-sm leading-5"
                                                  placeholder={intl.formatMessage(
                                                    messages.termLabel,
                                                  )}
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
                                                  <SelectContent
                                                    className={statusPickerContentClassName}
                                                  >
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
                                                                      description:
                                                                        event.target.value,
                                                                    }
                                                                  : draft,
                                                              ),
                                                            )
                                                          }
                                                        />
                                                      </Field>
                                                      <Field className="gap-1.5">
                                                        <FieldLabel>
                                                          <FormattedMessage
                                                            {...messages.urlLabel}
                                                          />
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
                                                            setExpandedCreatingTermIds(
                                                              (current) => {
                                                                const next = new Set(current);
                                                                next.delete(term.id);
                                                                return next;
                                                              },
                                                            );
                                                          }}
                                                        >
                                                          <HugeiconsIcon
                                                            icon={Delete02Icon}
                                                            strokeWidth={1.8}
                                                          />
                                                          <FormattedMessage
                                                            {...messages.deleteTerm}
                                                          />
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
                                <span className="text-xs text-muted-foreground">
                                  {group.locale}
                                </span>
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
                                                    status: (value ??
                                                      "draft") as TermDraft["status"],
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
                                                <SelectContent
                                                  className={statusPickerContentClassName}
                                                >
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
                                                      <FormattedMessage
                                                        {...messages.descriptionLabel}
                                                      />
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
                                                  <TypographyP className="text-xs text-muted-foreground tabular-nums">
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
                                                newTermIsDirty
                                                  ? "bg-emerald-500"
                                                  : "bg-transparent",
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
                                              <HugeiconsIcon
                                                icon={Delete02Icon}
                                                strokeWidth={1.8}
                                              />
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
                                                  <FormattedMessage
                                                    {...messages.descriptionLabel}
                                                  />
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
                                                    aria-label={intl.formatMessage(
                                                      messages.openTermUrl,
                                                    )}
                                                    disabled={!newTermDraft.url}
                                                    onClick={() =>
                                                      window.open(
                                                        newTermDraft.url,
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
                        deleteConcept.mutate(selectedConceptId);
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
            </>,
          )
        : null}

      {!conceptPageMode && (isNative || isLiveCrowdin) ? (
        <section className="grid gap-4 rounded-lg border border-border p-4">
          <div>
            <TypographyP className="text-sm font-medium text-foreground">
              <FormattedMessage
                {...(isLiveCrowdin ? messages.linkedProjectTitle : messages.assignedProjectsTitle)}
              />
            </TypographyP>
            <TypographyP className="text-xs text-muted-foreground">
              <FormattedMessage
                {...(isLiveCrowdin
                  ? messages.linkedProjectDescription
                  : messages.assignedProjectsDescription)}
              />
            </TypographyP>
          </div>
          {canManage && isNative ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={selectedProjectId || null}
                onValueChange={(value) => setSelectedProjectId(value ?? "")}
              >
                <SelectTrigger className="sm:max-w-sm">
                  <SelectValue>
                    {selectedProjectId
                      ? (availableProjects.find((project) => project.id === selectedProjectId)
                          ?.name ?? selectedProjectId)
                      : intl.formatMessage(messages.selectProjectPlaceholder)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableProjects
                    .filter((project) => project.sourceLocale === glossary.sourceLocale)
                    .map((project) => (
                      <SelectItem key={project.id} value={project.id} label={project.name}>
                        {project.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={!selectedProjectId || attachProject.isPending}
                onClick={() => attachProject.mutate(selectedProjectId)}
              >
                <FormattedMessage {...messages.assignToProject} />
              </Button>
            </div>
          ) : null}
          <div className="grid gap-2">
            {(attachedProjectsQuery.data ?? []).map((project) => (
              <div
                key={project.projectId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                {project.externalUrl ? (
                  <a
                    href={project.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {project.projectName}
                  </a>
                ) : (
                  <Link
                    href={`/org/${organizationSlug}/projects/${project.projectId}`}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {project.projectName}
                  </Link>
                )}
                {canManage && isNative ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => detachProject.mutate(project.projectId)}
                  >
                    <FormattedMessage {...messages.removeProject} />
                  </Button>
                ) : null}
              </div>
            ))}
            {attachedProjectsQuery.isSuccess && (attachedProjectsQuery.data ?? []).length === 0 ? (
              <TypographyP className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.noProjectsAssigned} />
              </TypographyP>
            ) : null}
          </div>
        </section>
      ) : null}

      <AlertDialog
        open={deleteGlossaryDialogOpen}
        onOpenChange={(open) => {
          if (!deleteGlossary.isPending) {
            setDeleteGlossaryDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.confirmDeleteGlossaryTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage(messages.confirmDeleteGlossaryDescription, {
                glossaryName: glossary.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteGlossary.isPending}>
              <FormattedMessage {...messages.cancelEdit} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteGlossary.isPending}
              onClick={() => deleteGlossary.mutate()}
            >
              {deleteGlossary.isPending ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
              )}
              <FormattedMessage {...messages.deleteGlossary} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
