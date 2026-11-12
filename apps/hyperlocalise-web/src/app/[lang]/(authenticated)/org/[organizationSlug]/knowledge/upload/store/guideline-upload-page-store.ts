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

import { canonicalizeLocale, isValidLocaleInput } from "@/lib/i18n/locales";

export type GuidelineProjectScope = "none" | "all" | "selected";

/** Custom entries must look like a language code (`fr`, `pt-BR`, `zh-Hant-TW`), not a word. */
const CUSTOM_LOCALE_PATTERN = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i;

/** Case-insensitive substring match of a search query against any of `values`. */
export function matchesSearchQuery(query: string, ...values: string[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => value.toLowerCase().includes(needle));
}

/**
 * Returns the canonical locale for a typed query when it is a plausible custom
 * code that is not already offered, otherwise null.
 */
export function customLocaleFromQuery(query: string, knownLocales: string[]): string | null {
  const typed = query.trim();
  if (!typed || !CUSTOM_LOCALE_PATTERN.test(typed) || !isValidLocaleInput(typed)) {
    return null;
  }
  const canonical = canonicalizeLocale(typed) as string;
  const known = knownLocales.some((locale) => locale.toLowerCase() === canonical.toLowerCase());
  return known ? null : canonical;
}

/**
 * UI state for the guideline create page: the staged file, where the guideline
 * applies (locales and project scope), and popover search drafts. Upload
 * requests and project data stay in TanStack Query.
 */
export class GuidelineUploadPageStore {
  readonly organizationSlug: string;
  readonly initialProjectId: string | undefined;

  stagedFile: File | null = null;
  locales: string[] = [];
  scope: GuidelineProjectScope;
  selectedProjectIds: string[];
  showProjectRequiredError = false;
  textDialogOpen = false;
  localeQuery = "";
  projectQuery = "";

  constructor(organizationSlug: string, initialProjectId?: string) {
    this.organizationSlug = organizationSlug;
    this.initialProjectId = initialProjectId;
    this.scope = initialProjectId ? "selected" : "none";
    this.selectedProjectIds = initialProjectId ? [initialProjectId] : [];
    makeAutoObservable(
      this,
      { organizationSlug: false, initialProjectId: false },
      { autoBind: true },
    );
  }

  get isGlobal() {
    return this.scope === "all";
  }

  /** Projects to attach after the document is created. */
  get projectIdsToAttach() {
    return this.scope === "selected" ? this.selectedProjectIds : [];
  }

  get canUploadFile() {
    return this.stagedFile != null;
  }

  stageFile(file: File | null) {
    this.stagedFile = file;
  }

  toggleLocale(locale: string, selected: boolean) {
    const without = this.locales.filter((entry) => entry !== locale);
    this.locales = selected ? [...without, locale] : without;
  }

  /** Adds a typed custom locale and clears the search draft. */
  addCustomLocale(locale: string) {
    this.toggleLocale(locale, true);
    this.localeQuery = "";
  }

  clearLocales() {
    this.locales = [];
  }

  setLocaleQuery(query: string) {
    this.localeQuery = query;
  }

  setScope(scope: GuidelineProjectScope) {
    this.scope = scope;
    this.showProjectRequiredError = false;
  }

  toggleProject(projectId: string, selected: boolean) {
    const without = this.selectedProjectIds.filter((id) => id !== projectId);
    this.selectedProjectIds = selected ? [...without, projectId] : without;
    this.showProjectRequiredError = false;
  }

  setProjectQuery(query: string) {
    this.projectQuery = query;
  }

  /**
   * Checks the project scope before creating a guideline. Flags the error and
   * returns false when "Specific projects" has nothing selected.
   */
  validateScope(): boolean {
    const valid = this.scope !== "selected" || this.selectedProjectIds.length > 0;
    this.showProjectRequiredError = !valid;
    return valid;
  }

  /** Opens the Markdown dialog when the scope is valid. */
  startMarkdownText() {
    if (this.validateScope()) {
      this.textDialogOpen = true;
    }
  }

  setTextDialogOpen(open: boolean) {
    this.textDialogOpen = open;
  }
}
