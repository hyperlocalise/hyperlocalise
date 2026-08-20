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
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Add01Icon,
  ArrowLeft01Icon,
  BookOpenTextIcon,
  Delete02Icon,
  FilterIcon,
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
} from "@/api/routes/glossary/glossary.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { COMMON_LOCALES, getLocaleLabel } from "@/lib/i18n/locales";

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
  status: "preferred" | "draft" | "not_recommended";
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
const genderOptions = ["masculine", "feminine", "neuter", "common"];
const termTypeOptions = ["abbreviation", "full_form", "phrase", "proper_noun", "technical"];
const partOfSpeechOptions = [
  "Noun",
  "Verb",
  "Adjective",
  "Adverb",
  "Pronoun",
  "Preposition",
  "Conjunction",
  "Interjection",
  "Proper noun",
  "Phrase",
  "Other",
];
const statusOptions = ["preferred", "draft", "not_recommended"] as const;
const emptyTermDraft: TermDraft = {
  term: "",
  partOfSpeech: "",
  gender: null,
  termType: null,
  status: "draft",
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
    partOfSpeech: term.partOfSpeech,
    gender: term.gender,
    termType: term.termType,
    status: term.status,
  };
}

function areTermDraftsEqual(left: TermDraft, right: TermDraft) {
  return (
    left.term === right.term &&
    left.partOfSpeech === right.partOfSpeech &&
    left.gender === right.gender &&
    left.termType === right.termType &&
    left.status === right.status
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
  return value && !partOfSpeechOptions.includes(value)
    ? [value, ...partOfSpeechOptions]
    : partOfSpeechOptions;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function statusClass(status: TermDraft["status"]) {
  if (status === "preferred") return "border-emerald-500/30 text-emerald-700";
  if (status === "not_recommended") return "border-destructive/30 text-destructive";
  return "border-amber-500/30 text-amber-700";
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
              <Skeleton className="h-4 w-36 max-w-full" />
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
                      <Skeleton className="h-7 w-full" />
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
  const [selectedProjectId, setSelectedProjectId] = useState("");

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
  const canEdit = canManageGlossaries && isNative;

  const conceptsQuery = useQuery({
    queryKey: ["glossary-concepts", organizationSlug, glossaryId],
    enabled: Boolean(isNative),
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
        const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
          ":glossaryId"
        ].concepts.$post({
          param: { organizationSlug, glossaryId },
          json: {
            ...draft,
            url: draft.url || undefined,
            terms: creatingTermDrafts
              .filter(({ term }) => term.trim())
              .map(({ id: _id, ...term }) => ({
                ...term,
                term: term.term.trim(),
                caseSensitive: false,
                forbidden: false,
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
        const terms: Array<{
          id?: string;
          locale: string;
          term: string;
          partOfSpeech: string;
          gender: string | null;
          termType: string | null;
          status: TermDraft["status"];
          caseSensitive: boolean;
          forbidden: boolean;
        }> = selectedConcept
          ? selectedConcept.terms.map((term) => {
              const termDraft = termDrafts[term.id] ?? termDraftFromRecord(term);
              return {
                id: term.id,
                locale: term.locale,
                term: termDraft.term,
                partOfSpeech: termDraft.partOfSpeech,
                gender: termDraft.gender,
                termType: termDraft.termType,
                status: termDraft.status,
                caseSensitive: term.caseSensitive,
                forbidden: term.forbidden,
              };
            })
          : [];
        if (newTermLocale && newTermDraft.term.trim()) {
          terms.push({
            locale: newTermLocale,
            term: newTermDraft.term,
            partOfSpeech: newTermDraft.partOfSpeech,
            gender: newTermDraft.gender,
            termType: newTermDraft.termType,
            status: newTermDraft.status,
            caseSensitive: false,
            forbidden: false,
          });
        }
        const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
          ":glossaryId"
        ].concepts[":conceptId"].$patch({
          param: { organizationSlug, glossaryId, conceptId: selectedConceptId },
          json: { ...draft, url: draft.url || undefined, terms },
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
            <TypographyH1 className="font-sans text-2xl font-medium">{glossary.name}</TypographyH1>
            <TypographyP className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {glossary.description || intl.formatMessage(messages.descriptionFallback)}
            </TypographyP>
          </section>

          {isNative ? (
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
                      const primary = concept.terms.find(
                        (term) => term.locale === glossary.sourceLocale,
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
                              {primary?.term ?? concept.primaryTerm}
                              {primary ? <Badge variant="outline">{primary.status}</Badge> : null}
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
                                setCreatingTermDrafts((drafts) => [
                                  ...drafts,
                                  {
                                    ...emptyTermDraft,
                                    id: `new-${crypto.randomUUID()}`,
                                    locale,
                                  },
                                ]);
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
                                {creatingTermDrafts.map((term) => (
                                  <tr key={term.id} className="border-t border-border">
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
                                        <SelectTrigger className="h-7">
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
                                                      value === "__none" ? null : (value ?? null),
                                                  }
                                                : draft,
                                            ),
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-7">
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
                                                      value === "__none" ? null : (value ?? null),
                                                  }
                                                : draft,
                                            ),
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-7">
                                          <SelectValue>
                                            {term.termType ? readableEnumLabel(term.termType) : "—"}
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
                                        <SelectTrigger className="h-7">
                                          <SelectValue>
                                            {readableEnumLabel(term.status)}
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
                                    </td>
                                    <td className="px-3 py-2">
                                      <Button
                                        type="button"
                                        size="icon-xs"
                                        variant="ghost"
                                        aria-label={intl.formatMessage(messages.deleteTerm)}
                                        onClick={() =>
                                          setCreatingTermDrafts((drafts) =>
                                            drafts.filter((draft) => draft.id !== term.id),
                                          )
                                        }
                                      >
                                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
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
                                    setNewTermDraft({
                                      term: "",
                                      partOfSpeech: "",
                                      gender: null,
                                      termType: null,
                                      status: "draft",
                                    });
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
                                    return (
                                      <tr key={term.id} className="border-t border-border">
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
                                              <SelectTrigger className="h-7">
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
                                              <SelectTrigger className="h-7">
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
                                              <SelectTrigger className="h-7">
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
                                                  status: (value ?? "draft") as TermDraft["status"],
                                                })
                                              }
                                            >
                                              <SelectTrigger className="h-7">
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
                                              {readableEnumLabel(term.status)}
                                            </Badge>
                                          )}
                                        </td>
                                        <td className="px-3 py-2">
                                          {canEdit ? (
                                            <Button
                                              type="button"
                                              size="icon-xs"
                                              variant="ghost"
                                              aria-label={intl.formatMessage(messages.deleteTerm)}
                                              onClick={() => {
                                                if (
                                                  window.confirm(
                                                    intl.formatMessage(messages.confirmDeleteTerm),
                                                  )
                                                )
                                                  deleteTerm.mutate(term.id);
                                              }}
                                            >
                                              <HugeiconsIcon
                                                icon={Delete02Icon}
                                                strokeWidth={1.8}
                                              />
                                            </Button>
                                          ) : null}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {newTermLocale === group.locale && canEdit ? (
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
                                              partOfSpeech: value === "__none" ? "" : (value ?? ""),
                                            })
                                          }
                                        >
                                          <SelectTrigger className="h-7">
                                            <SelectValue>
                                              {newTermDraft.partOfSpeech
                                                ? readableEnumLabel(newTermDraft.partOfSpeech)
                                                : "—"}
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="__none">—</SelectItem>
                                            {partOfSpeechOptionsFor(newTermDraft.partOfSpeech).map(
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
                                          value={newTermDraft.gender ?? "__none"}
                                          onValueChange={(value) =>
                                            setNewTermDraft({
                                              ...newTermDraft,
                                              gender: value === "__none" ? null : (value ?? null),
                                            })
                                          }
                                        >
                                          <SelectTrigger className="h-7">
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
                                              termType: value === "__none" ? null : (value ?? null),
                                            })
                                          }
                                        >
                                          <SelectTrigger className="h-7">
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
                                          <SelectTrigger className="h-7">
                                            <SelectValue>
                                              {readableEnumLabel(newTermDraft.status)}
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
                      disabled={
                        !conceptDraft.primaryTerm.trim() || !isDirty || saveConcept.isPending
                      }
                      onClick={() => saveConcept.mutate(conceptDraft)}
                    >
                      <FormattedMessage {...messages.save} />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>,
          )
        : null}

      {!conceptPageMode ? (
        <section className="grid gap-4 rounded-lg border border-border p-4">
          <div>
            <TypographyP className="text-sm font-medium text-foreground">
              <FormattedMessage {...messages.assignedProjectsTitle} />
            </TypographyP>
            <TypographyP className="text-xs text-muted-foreground">
              <FormattedMessage {...messages.assignedProjectsDescription} />
            </TypographyP>
          </div>
          {canEdit ? (
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
                <Link
                  href={`/org/${organizationSlug}/projects/${project.projectId}`}
                  className="text-sm font-medium text-foreground hover:underline"
                >
                  {project.projectName}
                </Link>
                {canEdit ? (
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
    </main>
  );
}
