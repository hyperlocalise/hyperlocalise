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
  AlertCircleIcon,
  BookOpenTextIcon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Delete02Icon,
  FilterIcon,
  InformationCircleIcon,
  Link01Icon,
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
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { COMMON_LOCALES, getLocaleLabel } from "@/lib/i18n/locales";
import { cn } from "@/lib/primitives/cn";
import {
  glossaryGenderValues,
  glossaryPartOfSpeechValues,
  glossaryTermStatusValues,
  glossaryTermTypeValues,
  selectGlossaryPrimaryTerm,
  type GlossaryPartOfSpeech,
  type GlossaryTermStatus,
} from "@/lib/glossary/glossary";

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
const genderOptions = glossaryGenderValues;
const termTypeOptions = glossaryTermTypeValues;
const partOfSpeechOptions = glossaryPartOfSpeechValues;
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

function isValidPartOfSpeech(value: string | undefined): value is GlossaryPartOfSpeech {
  return value !== undefined && partOfSpeechOptions.includes(value as GlossaryPartOfSpeech);
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
    left.primaryTerm === right.primaryTerm &&
    left.subject === right.subject &&
    left.definition === right.definition &&
    left.translatable === right.translatable &&
    left.note === right.note &&
    left.url === right.url
  );
}

function readableEnumLabel(value: string) {
  const label = value.replace(/_/g, " ");
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : label;
}

function partOfSpeechOptionsFor(value: string) {
  return value && !partOfSpeechOptions.includes(value as GlossaryPartOfSpeech)
    ? [value, ...partOfSpeechOptions]
    : partOfSpeechOptions;
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}

const termPropertyTriggerClassName =
  "h-7 border-transparent bg-transparent px-2 text-xs font-normal shadow-none hover:bg-muted/60 focus-visible:bg-muted/60";

function statusClass(status: TermDraft["status"]) {
  if (status === "preferred") {
    return "!border-emerald-500/30 !bg-emerald-500/10 !text-emerald-700 dark:!text-emerald-300";
  }
  if (status === "admitted") {
    return "!border-sky-500/30 !bg-sky-500/10 !text-sky-700 dark:!text-sky-300";
  }
  if (status === "draft") {
    return "!border-amber-500/30 !bg-amber-500/10 !text-amber-700 dark:!text-amber-300";
  }
  if (status === "not_recommended") {
    return "!border-rose-500/30 !bg-rose-500/10 !text-rose-700 dark:!text-rose-300";
  }
  return "!border-slate-500/30 !bg-slate-500/10 !text-slate-700 dark:!text-slate-300";
}

function statusIcon(status: TermDraft["status"]) {
  if (status === "preferred") return CheckmarkCircle02Icon;
  if (status === "admitted") return InformationCircleIcon;
  if (status === "draft") return Clock01Icon;
  if (status === "not_recommended") return AlertCircleIcon;
  return CancelCircleIcon;
}

function StatusLabel({ status, className }: { status: TermDraft["status"]; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <HugeiconsIcon
        icon={statusIcon(status)}
        strokeWidth={1.8}
        className="size-3.5"
        aria-hidden="true"
      />
      <span>{readableEnumLabel(status)}</span>
    </span>
  );
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
        <div className="grid min-h-[36rem] gap-5 lg:grid-cols-[minmax(15rem,0.75fr)_minmax(0,1.5fr)]">
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
  const [expandedTermIds, setExpandedTermIds] = useState<Set<string>>(new Set());
  const [expandedCreatingTermIds, setExpandedCreatingTermIds] = useState<Set<string>>(new Set());
  const [termToDeleteId, setTermToDeleteId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const skipNameBlurSave = useRef(false);

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
      return (await response.json()).glossary as GlossaryRecord;
    },
  });
  const glossary = glossaryQuery.data;
  const isNative = glossary?.source === "native";
  const isLiveCrowdin =
    glossary?.source === "external_tms" && glossary.externalProviderKind === "crowdin";
  const isConceptGlossary = isNative || isLiveCrowdin;
  const canEdit = canManageGlossaries && isConceptGlossary;

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
      setCreatingTermDrafts([]);
      setNewTermLocale(null);
      setNewTermDraft(emptyTermDraft);
      setExpandedTermIds(new Set());
      setExpandedCreatingTermIds(new Set());
    }
  }, [conceptId]);

  useEffect(() => {
    if (selectedConcept) {
      setConceptDraft(conceptDraftFromRecord(selectedConcept));
      setTermDrafts(
        Object.fromEntries(
          selectedConcept.terms.map((term) => [term.id, termDraftFromRecord(term)]),
        ),
      );
      setNewTermLocale(null);
      setNewTermDraft(emptyTermDraft);
      setCreatingTermDrafts([]);
      setExpandedTermIds(new Set());
      setExpandedCreatingTermIds(new Set());
      setIsCreatingConcept(false);
    }
  }, [selectedConcept]);

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
        if (terms.some((term) => !isValidPartOfSpeech(term.partOfSpeech))) {
          throw new Error(intl.formatMessage(messages.partOfSpeechRequired));
        }
        const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
          ":glossaryId"
        ].concepts.$post({
          param: { organizationSlug, glossaryId },
          json: {
            ...draft,
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
          ? selectedConcept.terms.map((term) => {
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
        if (terms.some((term) => !isValidPartOfSpeech(term.partOfSpeech))) {
          throw new Error(intl.formatMessage(messages.partOfSpeechRequired));
        }
        const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
          ":glossaryId"
        ].concepts[":conceptId"].$patch({
          param: { organizationSlug, glossaryId, conceptId: selectedConceptId },
          json: {
            ...draft,
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
  const deleteTerm = useMutation({
    mutationFn: async (termId: string) => {
      if (!selectedConceptId) return;
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts[":conceptId"].terms[":termId"].$delete({
        param: { organizationSlug, glossaryId, conceptId: selectedConceptId, termId },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.deleteTermFailed)),
        );
    },
    onSuccess: async () => {
      await invalidateConcepts();
      setTermToDeleteId(null);
      toast.success(intl.formatMessage(messages.termDeletedFromConcept));
    },
    onError: (error) => toast.error(error.message),
  });
  const importConcepts = useMutation({
    mutationFn: async (file: File) => {
      const content = await file.text();
      const format = file.name.toLowerCase().endsWith(".tbx") ? "tbx" : "csv";
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts["import"].$post({
        param: { organizationSlug, glossaryId },
        json: { format, content },
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
  const sourceLanguage = glossary.languages.find((language) => language.isSource) ?? {
    locale: glossary.sourceLocale,
    name: getLocaleLabel(glossary.sourceLocale),
    isSource: true,
  };
  const normalizedLanguageFilter = languageFilter.trim().toLowerCase();
  const availableTermLocales = isCreatingConcept
    ? COMMON_LOCALES
    : COMMON_LOCALES.filter((locale) => !selected?.terms.some((term) => term.locale === locale));
  const termGroups = (selected?.terms ?? [])
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
  if (
    newTermLocale &&
    !termGroups.some((group) => group.locale === newTermLocale) &&
    (!normalizedLanguageFilter ||
      getLocaleLabel(newTermLocale).toLowerCase().includes(normalizedLanguageFilter) ||
      newTermLocale.toLowerCase().includes(normalizedLanguageFilter))
  ) {
    termGroups.push({ locale: newTermLocale, terms: [] });
  }
  const conceptIsDirty = isCreatingConcept
    ? Boolean(conceptDraft.primaryTerm.trim())
    : selectedConcept
      ? !areConceptDraftsEqual(conceptDraft, conceptDraftFromRecord(selectedConcept))
      : false;
  const termsAreDirty = Boolean(
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
                <FormattedMessage
                  {...(isNative ? messages.sourceWorkspace : messages.sourceProvider)}
                />
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
            {canEdit ? (
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
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="file"
                      accept=".csv,.tbx,text/csv"
                      className="max-w-xs"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) importConcepts.mutate(file);
                        event.currentTarget.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      onClick={() => router.push(`${glossaryHref}/concepts/new`)}
                    >
                      <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
                      <FormattedMessage {...messages.addConcept} />
                    </Button>
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
                                <Badge variant="outline" className={statusClass(primary.status)}>
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
                      (selected?.primaryTerm ?? selectedConceptId)
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
              <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(15rem,0.75fr)_minmax(0,1.5fr)]">
                <div className="flex min-w-0 flex-col gap-4 border-b border-border pb-5 lg:border-r lg:border-b-0 lg:pr-5 lg:pb-0">
                  <Field className="gap-1.5">
                    <FieldLabel>
                      <FormattedMessage {...messages.primaryTermLabel} />
                    </FieldLabel>
                    <Input
                      value={conceptDraft.primaryTerm}
                      onChange={(event) =>
                        setConceptDraft((draft) => ({ ...draft, primaryTerm: event.target.value }))
                      }
                      disabled={!canEdit}
                    />
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
                      disabled={!canEdit}
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
                      disabled={!canEdit}
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={conceptDraft.translatable}
                      onCheckedChange={(checked) =>
                        setConceptDraft((draft) => ({ ...draft, translatable: Boolean(checked) }))
                      }
                      disabled={!canEdit}
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
                          disabled={!canEdit}
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
                          disabled={!canEdit}
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
                      disabled={!canEdit || availableTermLocales.length === 0}
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
                      {isCreatingConcept && creatingTermDrafts.length > 0 ? (
                        <div className="overflow-hidden rounded-lg border border-border">
                          <div className="border-b border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                            <FormattedMessage {...messages.termsTitle} />
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-[680px] w-full text-left text-xs">
                              <thead className="text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2">Language</th>
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
                                {creatingTermDrafts.map((term) => {
                                  const isExpanded = expandedCreatingTermIds.has(term.id);
                                  return (
                                    <Fragment key={term.id}>
                                      <tr className="border-t border-border">
                                        <td className="px-3 py-2">
                                          <span className="font-medium">
                                            {getLocaleLabel(term.locale)}
                                          </span>
                                          <span className="ml-1 text-muted-foreground">
                                            {term.locale}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2">
                                          <Input
                                            autoFocus={creatingTermDrafts.at(-1)?.id === term.id}
                                            className="h-7"
                                            placeholder={intl.formatMessage(messages.termLabel)}
                                            value={term.term}
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
                                          <Select
                                            value={term.partOfSpeech || "__none"}
                                            onValueChange={(value) =>
                                              setCreatingTermDrafts((drafts) =>
                                                drafts.map((draft) =>
                                                  draft.id === term.id
                                                    ? {
                                                        ...draft,
                                                        partOfSpeech:
                                                          value === "__none" ? "" : (value ?? ""),
                                                      }
                                                    : draft,
                                                ),
                                              )
                                            }
                                          >
                                            <SelectTrigger
                                              showIcon={false}
                                              className={termPropertyTriggerClassName}
                                            >
                                              <SelectValue>
                                                {term.partOfSpeech
                                                  ? readableEnumLabel(term.partOfSpeech)
                                                  : "—"}
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none">—</SelectItem>
                                              {partOfSpeechOptionsFor(term.partOfSpeech).map(
                                                (option) => (
                                                  <SelectItem key={option} value={option}>
                                                    {readableEnumLabel(option)}
                                                  </SelectItem>
                                                ),
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </td>
                                        <td className="px-3 py-2">
                                          <Select
                                            value={term.gender ?? "__none"}
                                            onValueChange={(value) =>
                                              setCreatingTermDrafts((drafts) =>
                                                drafts.map((draft) =>
                                                  draft.id === term.id
                                                    ? {
                                                        ...draft,
                                                        gender:
                                                          value === "__none"
                                                            ? null
                                                            : (value ?? null),
                                                      }
                                                    : draft,
                                                ),
                                              )
                                            }
                                          >
                                            <SelectTrigger
                                              showIcon={false}
                                              className={termPropertyTriggerClassName}
                                            >
                                              <SelectValue>
                                                {term.gender ? readableEnumLabel(term.gender) : "—"}
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none">—</SelectItem>
                                              {genderOptions.map((option) => (
                                                <SelectItem key={option} value={option}>
                                                  {readableEnumLabel(option)}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </td>
                                        <td className="px-3 py-2">
                                          <Select
                                            value={term.termType ?? "__none"}
                                            onValueChange={(value) =>
                                              setCreatingTermDrafts((drafts) =>
                                                drafts.map((draft) =>
                                                  draft.id === term.id
                                                    ? {
                                                        ...draft,
                                                        termType:
                                                          value === "__none"
                                                            ? null
                                                            : (value ?? null),
                                                      }
                                                    : draft,
                                                ),
                                              )
                                            }
                                          >
                                            <SelectTrigger
                                              showIcon={false}
                                              className={termPropertyTriggerClassName}
                                            >
                                              <SelectValue>
                                                {term.termType
                                                  ? readableEnumLabel(term.termType)
                                                  : "—"}
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none">—</SelectItem>
                                              {termTypeOptions.map((option) => (
                                                <SelectItem key={option} value={option}>
                                                  {readableEnumLabel(option)}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
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
                                              className={cn(
                                                termPropertyTriggerClassName,
                                                statusClass(term.status),
                                              )}
                                            >
                                              <SelectValue>
                                                <StatusLabel status={term.status} />
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              {statusOptions.map((option) => (
                                                <SelectItem
                                                  key={option}
                                                  value={option}
                                                  className={statusClass(option)}
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
                                          <td colSpan={7} className="px-3 py-4">
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
                                                          ? { ...draft, note: event.target.value }
                                                          : draft,
                                                      ),
                                                    )
                                                  }
                                                />
                                              </Field>
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
                      ) : null}
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
                              {canEdit ? (
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
                                              {isTermDirty ? (
                                                <span
                                                  className="size-2 rounded-full bg-emerald-500"
                                                  aria-hidden="true"
                                                />
                                              ) : null}
                                              {canEdit ? (
                                                <Input
                                                  className="h-7"
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
                                            {canEdit ? (
                                              <Select
                                                value={draft.partOfSpeech || "__none"}
                                                onValueChange={(value) =>
                                                  updateTermDraft(term.id, {
                                                    partOfSpeech:
                                                      value === "__none" ? "" : (value ?? ""),
                                                  })
                                                }
                                              >
                                                <SelectTrigger
                                                  showIcon={false}
                                                  className={termPropertyTriggerClassName}
                                                >
                                                  <SelectValue>
                                                    {draft.partOfSpeech
                                                      ? readableEnumLabel(draft.partOfSpeech)
                                                      : "—"}
                                                  </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="__none">—</SelectItem>
                                                  {partOfSpeechOptionsFor(draft.partOfSpeech).map(
                                                    (option) => (
                                                      <SelectItem key={option} value={option}>
                                                        {readableEnumLabel(option)}
                                                      </SelectItem>
                                                    ),
                                                  )}
                                                </SelectContent>
                                              </Select>
                                            ) : term.partOfSpeech ? (
                                              readableEnumLabel(term.partOfSpeech)
                                            ) : (
                                              "—"
                                            )}
                                          </td>
                                          <td className="px-3 py-2">
                                            {canEdit ? (
                                              <Select
                                                value={draft.gender ?? "__none"}
                                                onValueChange={(value) =>
                                                  updateTermDraft(term.id, {
                                                    gender:
                                                      value === "__none" ? null : (value ?? null),
                                                  })
                                                }
                                              >
                                                <SelectTrigger
                                                  showIcon={false}
                                                  className={termPropertyTriggerClassName}
                                                >
                                                  <SelectValue>
                                                    {draft.gender
                                                      ? readableEnumLabel(draft.gender)
                                                      : "—"}
                                                  </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="__none">—</SelectItem>
                                                  {genderOptions.map((option) => (
                                                    <SelectItem key={option} value={option}>
                                                      {readableEnumLabel(option)}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            ) : term.gender ? (
                                              readableEnumLabel(term.gender)
                                            ) : (
                                              "—"
                                            )}
                                          </td>
                                          <td className="px-3 py-2">
                                            {canEdit ? (
                                              <Select
                                                value={draft.termType ?? "__none"}
                                                onValueChange={(value) =>
                                                  updateTermDraft(term.id, {
                                                    termType:
                                                      value === "__none" ? null : (value ?? null),
                                                  })
                                                }
                                              >
                                                <SelectTrigger
                                                  showIcon={false}
                                                  className={termPropertyTriggerClassName}
                                                >
                                                  <SelectValue>
                                                    {draft.termType
                                                      ? readableEnumLabel(draft.termType)
                                                      : "—"}
                                                  </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="__none">—</SelectItem>
                                                  {termTypeOptions.map((option) => (
                                                    <SelectItem key={option} value={option}>
                                                      {readableEnumLabel(option)}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            ) : term.termType ? (
                                              readableEnumLabel(term.termType)
                                            ) : (
                                              "—"
                                            )}
                                          </td>
                                          <td className="px-3 py-2">
                                            {canEdit ? (
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
                                                  className={termPropertyTriggerClassName}
                                                >
                                                  <SelectValue>
                                                    {readableEnumLabel(draft.status)}
                                                  </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {statusOptions.map((option) => (
                                                    <SelectItem key={option} value={option}>
                                                      {readableEnumLabel(option)}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            ) : (
                                              <Badge
                                                variant="outline"
                                                className={statusClass(term.status)}
                                              >
                                                <StatusLabel status={term.status} />
                                              </Badge>
                                            )}
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
                                                      disabled={!canEdit}
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
                                                        disabled={!canEdit}
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
                                                    disabled={!canEdit}
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
                                                  {canEdit ? (
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
                                  {newTermLocale === group.locale && canEdit ? (
                                    <Fragment>
                                      <tr className="border-t border-emerald-500/30 bg-emerald-500/5">
                                        <td className="px-3 py-2">
                                          <div className="flex items-center gap-2">
                                            {newTermIsDirty ? (
                                              <span
                                                className="size-2 rounded-full bg-emerald-500"
                                                aria-hidden="true"
                                              />
                                            ) : null}
                                            <Input
                                              autoFocus
                                              className="h-7"
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
                                          <Select
                                            value={newTermDraft.partOfSpeech || "__none"}
                                            onValueChange={(value) =>
                                              setNewTermDraft({
                                                ...newTermDraft,
                                                partOfSpeech:
                                                  value === "__none" ? "" : (value ?? ""),
                                              })
                                            }
                                          >
                                            <SelectTrigger
                                              showIcon={false}
                                              className={termPropertyTriggerClassName}
                                            >
                                              <SelectValue>
                                                {newTermDraft.partOfSpeech
                                                  ? readableEnumLabel(newTermDraft.partOfSpeech)
                                                  : "—"}
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none">—</SelectItem>
                                              {partOfSpeechOptionsFor(
                                                newTermDraft.partOfSpeech,
                                              ).map((option) => (
                                                <SelectItem key={option} value={option}>
                                                  {readableEnumLabel(option)}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </td>
                                        <td className="px-3 py-2">
                                          <Select
                                            value={newTermDraft.gender ?? "__none"}
                                            onValueChange={(value) =>
                                              setNewTermDraft({
                                                ...newTermDraft,
                                                gender: value === "__none" ? null : (value ?? null),
                                              })
                                            }
                                          >
                                            <SelectTrigger
                                              showIcon={false}
                                              className={termPropertyTriggerClassName}
                                            >
                                              <SelectValue>
                                                {newTermDraft.gender
                                                  ? readableEnumLabel(newTermDraft.gender)
                                                  : "—"}
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none">—</SelectItem>
                                              {genderOptions.map((option) => (
                                                <SelectItem key={option} value={option}>
                                                  {readableEnumLabel(option)}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </td>
                                        <td className="px-3 py-2">
                                          <Select
                                            value={newTermDraft.termType ?? "__none"}
                                            onValueChange={(value) =>
                                              setNewTermDraft({
                                                ...newTermDraft,
                                                termType:
                                                  value === "__none" ? null : (value ?? null),
                                              })
                                            }
                                          >
                                            <SelectTrigger
                                              showIcon={false}
                                              className={termPropertyTriggerClassName}
                                            >
                                              <SelectValue>
                                                {newTermDraft.termType
                                                  ? readableEnumLabel(newTermDraft.termType)
                                                  : "—"}
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none">—</SelectItem>
                                              {termTypeOptions.map((option) => (
                                                <SelectItem key={option} value={option}>
                                                  {readableEnumLabel(option)}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
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
                                              className={cn(
                                                termPropertyTriggerClassName,
                                                statusClass(newTermDraft.status),
                                              )}
                                            >
                                              <SelectValue>
                                                <StatusLabel status={newTermDraft.status} />
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              {statusOptions.map((option) => (
                                                <SelectItem
                                                  key={option}
                                                  value={option}
                                                  className={statusClass(option)}
                                                >
                                                  <StatusLabel status={option} />
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </td>
                                        <td className="px-3 py-2">
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
              {canEdit ? (
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
                      disabled={
                        !conceptDraft.primaryTerm.trim() || !isDirty || saveConcept.isPending
                      }
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
          {canEdit && isNative ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={selectedProjectId}
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
                {canEdit && isNative ? (
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
              disabled={deleteTerm.isPending}
              onClick={() => {
                if (termToDeleteId) deleteTerm.mutate(termToDeleteId);
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
