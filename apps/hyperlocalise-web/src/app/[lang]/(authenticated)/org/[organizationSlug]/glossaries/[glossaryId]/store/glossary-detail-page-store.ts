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
  GlossaryGender,
  GlossaryPartOfSpeech,
  GlossaryTermStatus,
  GlossaryTermType,
} from "@/lib/glossary/glossary";

export type ConceptSortDir = "asc" | "desc";
export type ConceptModifiedPreset = "" | "24h" | "7d" | "30d";
export type GlossaryExportFormat = "csv" | "tbx" | "xlsx";
export type GlossaryExportScope = "complete" | "filtered";
export type ConceptLinguisticStatus = "" | GlossaryTermStatus;
export type ConceptPartOfSpeech = "" | GlossaryPartOfSpeech;
export type ConceptTermType = "" | GlossaryTermType;
export type ConceptGender = "" | GlossaryGender;

export type ConceptFilterDraft = {
  locale: string;
  modified: ConceptModifiedPreset;
  linguisticStatus: ConceptLinguisticStatus;
  partOfSpeech: ConceptPartOfSpeech;
  termType: ConceptTermType;
  gender: ConceptGender;
  author: string;
};

export type GlossaryImportDiagnostic = {
  severity: string;
  code: string;
  message: string;
};

export type GlossaryFilteredExportInput = {
  format: GlossaryExportFormat;
  scope: "filtered";
  locales: string[];
  search?: string;
  modifiedFrom?: string;
  linguisticStatus?: string;
  partOfSpeech?: string;
  termType?: string;
  gender?: string;
  createdByUserId?: string;
};

export const EMPTY_CONCEPT_FILTER_DRAFT: ConceptFilterDraft = {
  locale: "",
  modified: "",
  linguisticStatus: "",
  partOfSpeech: "",
  termType: "",
  gender: "",
  author: "",
};

const modifiedPresetHours = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 } as const;

export function modifiedFromIso(
  preset: ConceptModifiedPreset,
  now = Date.now(),
): string | undefined {
  if (!preset) return undefined;
  return new Date(now - modifiedPresetHours[preset] * 3_600_000).toISOString();
}

function emptyConceptFilterDraft(): ConceptFilterDraft {
  return { ...EMPTY_CONCEPT_FILTER_DRAFT };
}

export class GlossaryDetailPageStore {
  readonly organizationSlug: string;
  readonly glossaryId: string;

  selectedConceptIds = new Set<string>();
  conceptSort: ConceptSortDir = "asc";
  conceptSearch = "";
  conceptLocale = "";
  conceptModified: ConceptModifiedPreset = "";
  conceptLinguisticStatus: ConceptLinguisticStatus = "";
  conceptPartOfSpeech: ConceptPartOfSpeech = "";
  conceptTermType: ConceptTermType = "";
  conceptGender: ConceptGender = "";
  conceptAuthor = "";
  conceptModifiedFrom: string | undefined = undefined;
  conceptCursor: string | undefined = undefined;
  conceptCursorStack: string[] = [];
  selectedProjectId = "";
  nameDraft = "";
  skipNameBlurSave = false;
  importDialogOpen = false;
  importFile: File | null = null;
  importDiagnostics: GlossaryImportDiagnostic[] = [];
  deleteGlossaryDialogOpen = false;
  exportDialogOpen = false;
  filterDialogOpen = false;
  filterDraft: ConceptFilterDraft = emptyConceptFilterDraft();
  exportFormat: GlossaryExportFormat = "tbx";
  exportScope: GlossaryExportScope = "complete";

  constructor(organizationSlug: string, glossaryId: string) {
    this.organizationSlug = organizationSlug;
    this.glossaryId = glossaryId;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get glossaryHref() {
    return `/org/${this.organizationSlug}/glossaries/${this.glossaryId}`;
  }

  conceptHref(conceptId: string) {
    return `${this.glossaryHref}/concepts/${conceptId}`;
  }

  get activeDropdownFilterCount() {
    return [
      this.conceptLocale,
      this.conceptModified,
      this.conceptLinguisticStatus,
      this.conceptPartOfSpeech,
      this.conceptTermType,
      this.conceptGender,
      this.conceptAuthor,
    ].filter(Boolean).length;
  }

  get activeFilterCount() {
    return (this.conceptSearch.trim() ? 1 : 0) + this.activeDropdownFilterCount;
  }

  get canExportFiltered() {
    return this.activeFilterCount > 0;
  }

  get filteredExportLocales() {
    return this.conceptLocale ? [this.conceptLocale] : [];
  }

  get filterDraftIsEmpty() {
    return Object.values(this.filterDraft).every((value) => !value);
  }

  areAllConceptsSelected(conceptIds: readonly string[]) {
    return conceptIds.length > 0 && conceptIds.every((id) => this.selectedConceptIds.has(id));
  }

  conceptSelectionState(conceptIds: readonly string[]) {
    if (this.areAllConceptsSelected(conceptIds)) return true;
    if (this.selectedConceptIds.size > 0) return "indeterminate" as const;
    return false;
  }

  syncNameDraft(name: string) {
    this.nameDraft = name;
  }

  setNameDraft(name: string) {
    this.nameDraft = name;
  }

  revertNameDraft(name: string) {
    this.skipNameBlurSave = true;
    this.nameDraft = name;
  }

  consumeSkipNameBlurSave() {
    if (!this.skipNameBlurSave) return false;
    this.skipNameBlurSave = false;
    return true;
  }

  trimmedNameDraft() {
    return this.nameDraft.trim();
  }

  canSaveName(currentName: string) {
    const name = this.trimmedNameDraft();
    return Boolean(name) && name !== currentName;
  }

  setSelectedProjectId(projectId: string) {
    this.selectedProjectId = projectId;
  }

  clearSelectedProjectId() {
    this.selectedProjectId = "";
  }

  setConceptSearch(search: string) {
    this.resetConceptCursor();
    this.conceptSearch = search;
  }

  toggleConceptSort() {
    this.conceptSort = this.conceptSort === "asc" ? "desc" : "asc";
    this.resetConceptCursor();
  }

  resetConceptCursor() {
    this.conceptCursorStack = [];
    this.conceptCursor = undefined;
  }

  goToNextConceptPage(nextCursor: string | null | undefined) {
    if (!nextCursor) return;
    this.conceptCursorStack.push(this.conceptCursor ?? "");
    this.conceptCursor = nextCursor;
  }

  goToPreviousConceptPage() {
    this.conceptCursor = this.conceptCursorStack.pop() || undefined;
  }

  selectAllConcepts(conceptIds: readonly string[]) {
    this.selectedConceptIds = new Set(conceptIds);
  }

  clearConceptSelection() {
    this.selectedConceptIds = new Set();
  }

  setConceptSelected(conceptId: string, selected: boolean) {
    const next = new Set(this.selectedConceptIds);
    if (selected) next.add(conceptId);
    else next.delete(conceptId);
    this.selectedConceptIds = next;
  }

  openFilterDialog() {
    this.filterDraft = {
      locale: this.conceptLocale,
      modified: this.conceptModified,
      linguisticStatus: this.conceptLinguisticStatus,
      partOfSpeech: this.conceptPartOfSpeech,
      termType: this.conceptTermType,
      gender: this.conceptGender,
      author: this.conceptAuthor,
    };
    this.filterDialogOpen = true;
  }

  setFilterDialogOpen(open: boolean) {
    this.filterDialogOpen = open;
  }

  updateFilterDraft(key: keyof ConceptFilterDraft, value: string) {
    this.filterDraft = {
      ...this.filterDraft,
      [key]: value === "all" ? "" : value,
    };
  }

  clearFilterDraft() {
    this.filterDraft = emptyConceptFilterDraft();
  }

  applyConceptFilters(now = Date.now()) {
    this.resetConceptCursor();
    this.conceptModifiedFrom = modifiedFromIso(this.filterDraft.modified, now);
    this.conceptLocale = this.filterDraft.locale;
    this.conceptModified = this.filterDraft.modified;
    this.conceptLinguisticStatus = this.filterDraft.linguisticStatus;
    this.conceptPartOfSpeech = this.filterDraft.partOfSpeech;
    this.conceptTermType = this.filterDraft.termType;
    this.conceptGender = this.filterDraft.gender;
    this.conceptAuthor = this.filterDraft.author;
    this.filterDialogOpen = false;
  }

  clearAllConceptFilters() {
    this.resetConceptCursor();
    this.conceptModifiedFrom = undefined;
    this.conceptSearch = "";
    this.conceptLocale = "";
    this.conceptModified = "";
    this.conceptLinguisticStatus = "";
    this.conceptPartOfSpeech = "";
    this.conceptTermType = "";
    this.conceptGender = "";
    this.conceptAuthor = "";
  }

  setImportDialogOpen(open: boolean) {
    this.importDialogOpen = open;
    if (!open) {
      this.resetImportDialog();
    }
  }

  setImportFile(file: File | null) {
    this.importFile = file;
    this.importDiagnostics = [];
  }

  setImportDiagnostics(diagnostics: GlossaryImportDiagnostic[]) {
    this.importDiagnostics = diagnostics;
  }

  resetImportDialog() {
    this.importFile = null;
    this.importDiagnostics = [];
  }

  closeImportDialog() {
    this.importDialogOpen = false;
    this.resetImportDialog();
  }

  setDeleteGlossaryDialogOpen(open: boolean) {
    this.deleteGlossaryDialogOpen = open;
  }

  openExportDialog() {
    this.exportScope = this.canExportFiltered ? "filtered" : "complete";
    this.exportDialogOpen = true;
  }

  setExportDialogOpen(open: boolean) {
    this.exportDialogOpen = open;
  }

  setExportFormat(format: GlossaryExportFormat) {
    this.exportFormat = format;
  }

  setExportScope(scope: GlossaryExportScope) {
    this.exportScope = scope;
  }

  buildCompleteExportInput() {
    return { format: this.exportFormat, scope: "complete" as const };
  }

  buildFilteredExportInput(): GlossaryFilteredExportInput {
    return {
      format: this.exportFormat,
      scope: "filtered",
      locales: this.filteredExportLocales,
      search: this.conceptSearch.trim() || undefined,
      modifiedFrom: this.conceptModifiedFrom,
      linguisticStatus: this.conceptLinguisticStatus || undefined,
      partOfSpeech: this.conceptPartOfSpeech || undefined,
      termType: this.conceptTermType || undefined,
      gender: this.conceptGender || undefined,
      createdByUserId: this.conceptAuthor || undefined,
    };
  }
}
