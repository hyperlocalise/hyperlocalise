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
import { makeAutoObservable } from "mobx";

import type {
  CreateGlossaryConceptBody,
  GlossaryConceptRecord,
  GlossaryConceptTermRecord,
  UpdateGlossaryConceptBody,
  UpsertGlossaryConceptTermBody,
} from "@/api/routes/glossary/glossary.schema";
import { getLocaleLabel } from "@/lib/i18n/locales";
import type { GlossaryPartOfSpeech, GlossaryTermStatus } from "@/lib/glossary/glossary";

import { selectConceptDetailSourceTermText } from "../_components/concept-detail-source-term";
import { sortConceptDetailTermGroups } from "../_components/concept-detail-term-order";

export type ConceptDraft = {
  primaryTerm: string;
  subject: string;
  definition: string;
  translatable: boolean;
  note: string;
  url: string;
};

export type TermDraft = {
  term: string;
  partOfSpeech: string;
  gender: string | null;
  termType: string | null;
  status: GlossaryTermStatus;
  description: string;
  note: string;
  url: string;
};

export type CreatingTermDraft = TermDraft & { id: string; locale: string };

export const EMPTY_CONCEPT_DRAFT: ConceptDraft = {
  primaryTerm: "",
  subject: "",
  definition: "",
  translatable: true,
  note: "",
  url: "",
};

export const EMPTY_TERM_DRAFT: TermDraft = {
  term: "",
  partOfSpeech: "",
  gender: null,
  termType: null,
  status: "draft",
  description: "",
  note: "",
  url: "",
};

export function emptyConceptDraft(): ConceptDraft {
  return { ...EMPTY_CONCEPT_DRAFT };
}

export function emptyTermDraft(): TermDraft {
  return { ...EMPTY_TERM_DRAFT };
}

export function createCreatingTermDraft(locale: string, id: string): CreatingTermDraft {
  return { ...emptyTermDraft(), id, locale };
}

export function conceptDraftFromRecord(concept: GlossaryConceptRecord): ConceptDraft {
  return {
    primaryTerm: concept.primaryTerm,
    subject: concept.subject,
    definition: concept.definition,
    translatable: concept.translatable,
    note: concept.note,
    url: concept.url ?? "",
  };
}

export function termDraftFromRecord(term: GlossaryConceptTermRecord): TermDraft {
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

export function normalizePartOfSpeech(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return (normalized === "preposition" ? "adposition" : normalized) as GlossaryPartOfSpeech;
}

export function areTermDraftsEqual(left: TermDraft, right: TermDraft) {
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

export function areConceptDraftsEqual(left: ConceptDraft, right: ConceptDraft) {
  return (
    left.subject === right.subject &&
    left.definition === right.definition &&
    left.translatable === right.translatable &&
    left.note === right.note &&
    left.url === right.url
  );
}

function localeMatchesFilter(locale: string, normalizedFilter: string) {
  if (!normalizedFilter) return true;
  return (
    getLocaleLabel(locale).toLowerCase().includes(normalizedFilter) ||
    locale.toLowerCase().includes(normalizedFilter)
  );
}

export class GlossaryConceptDetailStore {
  readonly organizationSlug: string;
  readonly glossaryId: string;
  readonly conceptId: string;

  sourceLocale = "";
  languageFilter = "";
  termCursor: string | undefined = undefined;
  termCursorStack: string[] = [];
  localePickerOpen = false;
  newTermLocale: string | null = null;
  newTermDraft: TermDraft = emptyTermDraft();
  creatingTermDrafts: CreatingTermDraft[] = [];
  termDrafts: Record<string, TermDraft> = {};
  deletedTermIds = new Set<string>();
  initializedConceptId: string | null = null;
  expandedTermIds = new Set<string>();
  expandedCreatingTermIds = new Set<string>();
  termToDeleteId: string | null = null;
  conceptDraft: ConceptDraft = emptyConceptDraft();
  persistedConcept: GlossaryConceptRecord | null = null;
  persistedTerms: GlossaryConceptTermRecord[] = [];

  constructor(organizationSlug: string, glossaryId: string, conceptId: string) {
    this.organizationSlug = organizationSlug;
    this.glossaryId = glossaryId;
    this.conceptId = conceptId;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isCreatingConcept() {
    return this.conceptId === "new";
  }

  get glossaryHref() {
    return `/org/${this.organizationSlug}/glossaries/${this.glossaryId}`;
  }

  conceptHref(conceptId: string) {
    return `${this.glossaryHref}/concepts/${conceptId}`;
  }

  get normalizedLanguageFilter() {
    return this.languageFilter.trim().toLowerCase();
  }

  get selectedConcept() {
    if (!this.persistedConcept) return null;
    return { ...this.persistedConcept, terms: this.persistedTerms };
  }

  get conceptTermCandidates() {
    if (this.isCreatingConcept) return this.creatingTermDrafts;
    return [
      ...this.persistedTerms
        .filter((term) => !this.deletedTermIds.has(term.id))
        .map((term) => {
          const draft = this.termDrafts[term.id] ?? termDraftFromRecord(term);
          return {
            id: term.id,
            locale: term.locale,
            term: draft.term,
            status: draft.status,
          };
        }),
      ...(this.newTermLocale
        ? [
            {
              locale: this.newTermLocale,
              term: this.newTermDraft.term,
              status: this.newTermDraft.status,
            },
          ]
        : []),
    ];
  }

  get sourceTermText() {
    return (
      selectConceptDetailSourceTermText(this.conceptTermCandidates, this.sourceLocale) ||
      this.persistedConcept?.primaryTerm ||
      ""
    );
  }

  get termGroups() {
    const unsorted = this.persistedTerms
      .filter((term) => !this.deletedTermIds.has(term.id))
      .filter((term) => localeMatchesFilter(term.locale, this.normalizedLanguageFilter))
      .reduce<Array<{ locale: string; terms: GlossaryConceptTermRecord[] }>>((groups, term) => {
        const group = groups.find((item) => item.locale === term.locale);
        if (group) group.terms.push(term);
        else groups.push({ locale: term.locale, terms: [term] });
        return groups;
      }, []);
    const withPendingLocale =
      this.newTermLocale &&
      !unsorted.some((group) => group.locale === this.newTermLocale) &&
      localeMatchesFilter(this.newTermLocale, this.normalizedLanguageFilter)
        ? [...unsorted, { locale: this.newTermLocale, terms: [] }]
        : unsorted;
    return sortConceptDetailTermGroups(withPendingLocale, this.sourceLocale);
  }

  get creatingTermGroups() {
    return sortConceptDetailTermGroups(
      this.creatingTermDrafts
        .filter((term) => localeMatchesFilter(term.locale, this.normalizedLanguageFilter))
        .reduce<Array<{ locale: string; terms: CreatingTermDraft[] }>>((groups, term) => {
          const group = groups.find((item) => item.locale === term.locale);
          if (group) group.terms.push(term);
          else groups.push({ locale: term.locale, terms: [term] });
          return groups;
        }, []),
      this.sourceLocale,
    );
  }

  get conceptIsDirty() {
    if (this.isCreatingConcept) return Boolean(this.sourceTermText.trim());
    if (!this.selectedConcept) return false;
    return !areConceptDraftsEqual(this.conceptDraft, conceptDraftFromRecord(this.selectedConcept));
  }

  get termsAreDirty() {
    return (
      this.deletedTermIds.size > 0 ||
      this.persistedTerms.some((term) => {
        const draft = this.termDrafts[term.id];
        return draft && !areTermDraftsEqual(draft, termDraftFromRecord(term));
      })
    );
  }

  get newTermIsDirty() {
    return Boolean(this.newTermLocale && this.newTermDraft.term.trim());
  }

  get isDirty() {
    return (
      this.conceptIsDirty ||
      this.termsAreDirty ||
      this.newTermIsDirty ||
      this.creatingTermDrafts.length > 0
    );
  }

  get hasUnsavedChanges() {
    return (
      (this.isCreatingConcept
        ? !areConceptDraftsEqual(this.conceptDraft, EMPTY_CONCEPT_DRAFT)
        : this.conceptIsDirty) ||
      this.termsAreDirty ||
      (this.newTermLocale !== null && !areTermDraftsEqual(this.newTermDraft, EMPTY_TERM_DRAFT)) ||
      this.creatingTermDrafts.some((draft) => !areTermDraftsEqual(draft, EMPTY_TERM_DRAFT))
    );
  }

  get canSave() {
    return Boolean(this.sourceTermText.trim()) && this.isDirty;
  }

  setSourceLocale(locale: string) {
    this.sourceLocale = locale;
  }

  initializeNewConcept(sourceLocale: string) {
    this.sourceLocale = sourceLocale;
    if (this.initializedConceptId === "new") return;
    this.conceptDraft = emptyConceptDraft();
    this.termDrafts = {};
    this.deletedTermIds = new Set();
    this.creatingTermDrafts = sourceLocale
      ? [createCreatingTermDraft(sourceLocale, `new-source-${sourceLocale}`)]
      : [];
    this.newTermLocale = null;
    this.newTermDraft = emptyTermDraft();
    this.expandedTermIds = new Set();
    this.expandedCreatingTermIds = new Set();
    this.persistedConcept = null;
    this.persistedTerms = [];
    this.initializedConceptId = "new";
  }

  hydrateFromServer(concept: GlossaryConceptRecord) {
    const terms = concept.terms ?? [];
    this.persistedConcept = concept;
    this.persistedTerms = terms;
    if (this.initializedConceptId === concept.id) {
      let changed = false;
      const next = { ...this.termDrafts };
      for (const term of terms) {
        if (!next[term.id]) {
          next[term.id] = termDraftFromRecord(term);
          changed = true;
        }
      }
      if (changed) this.termDrafts = next;
      return;
    }
    this.initializedConceptId = concept.id;
    this.conceptDraft = conceptDraftFromRecord(concept);
    this.termDrafts = Object.fromEntries(terms.map((term) => [term.id, termDraftFromRecord(term)]));
    this.deletedTermIds = new Set();
    this.newTermLocale = null;
    this.newTermDraft = emptyTermDraft();
    this.creatingTermDrafts = [];
    this.expandedTermIds = new Set();
    this.expandedCreatingTermIds = new Set();
  }

  applySavedConcept(concept: GlossaryConceptRecord) {
    this.persistedConcept = concept;
    this.persistedTerms = concept.terms ?? [];
    this.initializedConceptId = concept.id;
    this.conceptDraft = conceptDraftFromRecord(concept);
    this.termDrafts = Object.fromEntries(
      (concept.terms ?? []).map((term) => [term.id, termDraftFromRecord(term)]),
    );
    this.deletedTermIds = new Set();
    this.newTermLocale = null;
    this.newTermDraft = emptyTermDraft();
    this.creatingTermDrafts = [];
    this.expandedCreatingTermIds = new Set();
  }

  setLanguageFilter(filter: string) {
    this.languageFilter = filter;
    this.termCursor = undefined;
    this.termCursorStack = [];
  }

  resolvedTermLocaleFilter(availableLocales: readonly string[]) {
    const filter = this.languageFilter.trim();
    if (!filter) return undefined;
    return availableLocales.find(
      (locale) =>
        locale.toLowerCase() === filter.toLowerCase() ||
        getLocaleLabel(locale).toLowerCase() === filter.toLowerCase(),
    );
  }

  goToNextTermPage(nextCursor: string | null | undefined) {
    if (!nextCursor || this.isDirty) return;
    this.termCursorStack.push(this.termCursor ?? "");
    this.termCursor = nextCursor;
  }

  goToPreviousTermPage() {
    if (this.isDirty) return;
    this.termCursor = this.termCursorStack.pop() || undefined;
  }

  setLocalePickerOpen(open: boolean) {
    this.localePickerOpen = open;
  }

  setTermToDeleteId(termId: string | null) {
    this.termToDeleteId = termId;
  }

  updateConceptDraft(patch: Partial<ConceptDraft>) {
    this.conceptDraft = { ...this.conceptDraft, ...patch };
  }

  updateTermDraft(termId: string, patch: Partial<TermDraft>) {
    const draft = this.termDrafts[termId];
    if (!draft) return;
    this.termDrafts = { ...this.termDrafts, [termId]: { ...draft, ...patch } };
  }

  updateNewTermDraft(patch: Partial<TermDraft>) {
    this.newTermDraft = { ...this.newTermDraft, ...patch };
  }

  updateCreatingTermDraft(termId: string, patch: Partial<TermDraft>) {
    this.creatingTermDrafts = this.creatingTermDrafts.map((draft) =>
      draft.id === termId ? { ...draft, ...patch } : draft,
    );
  }

  addCreatingTerm(locale: string, id: string) {
    this.creatingTermDrafts = [...this.creatingTermDrafts, createCreatingTermDraft(locale, id)];
    this.expandedCreatingTermIds = new Set(this.expandedCreatingTermIds).add(id);
    this.localePickerOpen = false;
  }

  startNewTerm(locale: string) {
    this.newTermLocale = locale;
    this.newTermDraft = emptyTermDraft();
    this.localePickerOpen = false;
  }

  cancelNewTerm() {
    this.newTermLocale = null;
    this.newTermDraft = emptyTermDraft();
  }

  removeCreatingTerm(termId: string) {
    this.creatingTermDrafts = this.creatingTermDrafts.filter((draft) => draft.id !== termId);
    const next = new Set(this.expandedCreatingTermIds);
    next.delete(termId);
    this.expandedCreatingTermIds = next;
  }

  markTermForDeletion(termId: string) {
    const nextDeleted = new Set(this.deletedTermIds);
    nextDeleted.add(termId);
    this.deletedTermIds = nextDeleted;
    const nextExpanded = new Set(this.expandedTermIds);
    nextExpanded.delete(termId);
    this.expandedTermIds = nextExpanded;
    this.termToDeleteId = null;
  }

  toggleExpandedTerm(termId: string) {
    const next = new Set(this.expandedTermIds);
    if (next.has(termId)) next.delete(termId);
    else next.add(termId);
    this.expandedTermIds = next;
  }

  toggleExpandedCreatingTerm(termId: string) {
    const next = new Set(this.expandedCreatingTermIds);
    if (next.has(termId)) next.delete(termId);
    else next.add(termId);
    this.expandedCreatingTermIds = next;
  }

  termDraftFor(term: GlossaryConceptTermRecord) {
    return this.termDrafts[term.id] ?? termDraftFromRecord(term);
  }

  isTermDirty(term: GlossaryConceptTermRecord) {
    return !areTermDraftsEqual(this.termDraftFor(term), termDraftFromRecord(term));
  }

  buildCreateBody(): CreateGlossaryConceptBody {
    const primaryTerm = this.sourceTermText.trim();
    const terms: NonNullable<CreateGlossaryConceptBody["terms"]> = this.creatingTermDrafts
      .filter(({ term }) => term.trim())
      .map(({ id: _id, ...term }) => ({
        ...term,
        term: term.term.trim(),
        partOfSpeech: normalizePartOfSpeech(term.partOfSpeech),
        gender: term.gender as NonNullable<CreateGlossaryConceptBody["terms"]>[number]["gender"],
        termType: term.termType as NonNullable<
          CreateGlossaryConceptBody["terms"]
        >[number]["termType"],
        caseSensitive: false,
        forbidden: false,
      }));
    return {
      ...this.conceptDraft,
      primaryTerm,
      url: this.conceptDraft.url || undefined,
      terms: terms.map((term) => ({
        ...term,
        partOfSpeech: term.partOfSpeech as GlossaryPartOfSpeech,
      })),
    };
  }

  buildUpdateBody(): UpdateGlossaryConceptBody {
    const primaryTerm = this.sourceTermText.trim();
    const terms: UpsertGlossaryConceptTermBody[] = this.persistedTerms
      .filter((term) => !this.deletedTermIds.has(term.id))
      .map((term) => {
        const termDraft = this.termDrafts[term.id] ?? termDraftFromRecord(term);
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
      });
    if (this.newTermLocale && this.newTermDraft.term.trim()) {
      terms.push({
        locale: this.newTermLocale,
        term: this.newTermDraft.term,
        partOfSpeech: normalizePartOfSpeech(this.newTermDraft.partOfSpeech),
        gender: this.newTermDraft.gender as UpsertGlossaryConceptTermBody["gender"],
        termType: this.newTermDraft.termType as UpsertGlossaryConceptTermBody["termType"],
        status: this.newTermDraft.status,
        description: this.newTermDraft.description,
        note: this.newTermDraft.note,
        url: this.newTermDraft.url,
        caseSensitive: false,
        forbidden: false,
      });
    }
    return {
      ...this.conceptDraft,
      primaryTerm,
      url: this.conceptDraft.url || undefined,
      preserveOmittedTerms: true,
      deletedTermIds: [...this.deletedTermIds],
      terms: terms.map((term) => ({
        ...term,
        partOfSpeech: term.partOfSpeech as GlossaryPartOfSpeech,
      })),
    };
  }
}
