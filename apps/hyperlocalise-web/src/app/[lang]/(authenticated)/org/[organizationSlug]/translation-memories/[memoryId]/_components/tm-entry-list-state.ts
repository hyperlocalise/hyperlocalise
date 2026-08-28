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
import { externalTmsProviderKinds } from "@/lib/providers/contracts/external-tms-provider-kind";
import { canonicalizeLocale, COMMON_LOCALES } from "@/lib/i18n/locales";

export const TM_ENTRY_PAGE_SIZE = 50;
export const TM_ENTRY_SEARCH_DEBOUNCE_MS = 250;
export const TM_ENTRY_SEARCH_MAX_LENGTH = 200;

export const TM_ENTRY_REVIEW_STATUSES = ["approved", "pending", "rejected"] as const;
export const TM_ENTRY_ORIGINS = ["manual", "import", "sync"] as const;
export const TM_ENTRY_SORTS = ["created_at", "updated_at"] as const;
export const TM_ENTRY_SORT_DIRS = ["asc", "desc"] as const;
export const TM_ENTRY_PROVIDERS = externalTmsProviderKinds;

export type TmEntryReviewStatus = (typeof TM_ENTRY_REVIEW_STATUSES)[number];
export type TmEntryOrigin = (typeof TM_ENTRY_ORIGINS)[number];
export type TmEntrySort = (typeof TM_ENTRY_SORTS)[number];
export type TmEntrySortDir = (typeof TM_ENTRY_SORT_DIRS)[number];
export type TmEntryProvider = (typeof TM_ENTRY_PROVIDERS)[number];

export type TmEntryListUrlState = {
  search: string;
  sourceLocale?: string;
  targetLocale?: string;
  reviewStatus?: TmEntryReviewStatus;
  origin?: string;
  provider?: string;
  createdByUserId?: string;
  modifiedFrom?: string;
  modifiedTo?: string;
  importBatchId?: string;
  sort: TmEntrySort;
  sortDir: TmEntrySortDir;
  cursor?: string;
  entry?: string;
};

export type TmEntryListApiQuery = {
  limit: string;
  cursor?: string;
  search?: string;
  sourceLocale?: string;
  targetLocale?: string;
  reviewStatus?: TmEntryReviewStatus;
  origin?: string;
  provider?: string;
  createdByUserId?: string;
  modifiedFrom?: string;
  modifiedTo?: string;
  importBatchId?: string;
  sort?: TmEntrySort;
  sortDir?: TmEntrySortDir;
};

export type TmEntryFilterChip =
  | { key: "search"; value: string }
  | { key: "sourceLocale"; value: string }
  | { key: "targetLocale"; value: string }
  | { key: "reviewStatus"; value: TmEntryReviewStatus }
  | { key: "origin"; value: string }
  | { key: "provider"; value: string }
  | { key: "createdByUserId"; value: string }
  | { key: "modifiedFrom"; value: string }
  | { key: "modifiedTo"; value: string }
  | { key: "importBatchId"; value: string };

const DEFAULT_STATE: TmEntryListUrlState = {
  search: "",
  sort: "created_at",
  sortDir: "desc",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const FILTER_KEYS = [
  "search",
  "sourceLocale",
  "targetLocale",
  "reviewStatus",
  "origin",
  "provider",
  "createdByUserId",
  "modifiedFrom",
  "modifiedTo",
  "importBatchId",
  "sort",
  "sortDir",
] as const satisfies readonly (keyof TmEntryListUrlState)[];

function readAllowedValue<T extends string>(
  searchParams: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = searchParams.get(key);
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return undefined;
}

function readTrimmedParam(searchParams: URLSearchParams, key: string): string | undefined {
  const value = searchParams.get(key)?.trim();
  return value ? value : undefined;
}

function readUuidParam(searchParams: URLSearchParams, key: string): string | undefined {
  const value = readTrimmedParam(searchParams, key);
  if (!value || !UUID_PATTERN.test(value)) {
    return undefined;
  }
  return value.toLowerCase();
}

export function parseModifiedDateParam(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (DATE_ONLY_PATTERN.test(trimmed)) {
    return trimmed;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

export function modifiedDateToApiDateTime(date: string, bound: "start" | "end"): string {
  if (date.includes("T")) {
    return date;
  }
  return bound === "start" ? `${date}T00:00:00.000Z` : `${date}T23:59:59.999Z`;
}

export function parseCanonicalLocaleParam(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return canonicalizeLocale(trimmed) ?? trimmed;
}

export function parseTmEntryListSearchParams(searchParams: URLSearchParams): TmEntryListUrlState {
  const sort = readAllowedValue(searchParams, "sort", TM_ENTRY_SORTS) ?? DEFAULT_STATE.sort;
  const sortDir =
    readAllowedValue(searchParams, "sortDir", TM_ENTRY_SORT_DIRS) ?? DEFAULT_STATE.sortDir;
  const search = (searchParams.get("search") ?? "").trim().slice(0, TM_ENTRY_SEARCH_MAX_LENGTH);
  const origin = readTrimmedParam(searchParams, "origin");
  const provider = readTrimmedParam(searchParams, "provider");

  return {
    search,
    sourceLocale: parseCanonicalLocaleParam(searchParams.get("sourceLocale")),
    targetLocale: parseCanonicalLocaleParam(searchParams.get("targetLocale")),
    reviewStatus: readAllowedValue(searchParams, "reviewStatus", TM_ENTRY_REVIEW_STATUSES),
    origin,
    provider,
    createdByUserId: readUuidParam(searchParams, "createdByUserId"),
    modifiedFrom: parseModifiedDateParam(searchParams.get("modifiedFrom")),
    modifiedTo: parseModifiedDateParam(searchParams.get("modifiedTo")),
    importBatchId: readUuidParam(searchParams, "importBatchId"),
    sort,
    sortDir,
    cursor: readTrimmedParam(searchParams, "cursor"),
    entry: readUuidParam(searchParams, "entry"),
  };
}

export function buildTmEntryListSearchParams(state: TmEntryListUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.search.trim()) {
    params.set("search", state.search.trim().slice(0, TM_ENTRY_SEARCH_MAX_LENGTH));
  }
  if (state.sourceLocale) {
    params.set("sourceLocale", state.sourceLocale);
  }
  if (state.targetLocale) {
    params.set("targetLocale", state.targetLocale);
  }
  if (state.reviewStatus) {
    params.set("reviewStatus", state.reviewStatus);
  }
  if (state.origin) {
    params.set("origin", state.origin);
  }
  if (state.provider) {
    params.set("provider", state.provider);
  }
  if (state.createdByUserId) {
    params.set("createdByUserId", state.createdByUserId);
  }
  if (state.modifiedFrom) {
    params.set("modifiedFrom", state.modifiedFrom);
  }
  if (state.modifiedTo) {
    params.set("modifiedTo", state.modifiedTo);
  }
  if (state.importBatchId) {
    params.set("importBatchId", state.importBatchId);
  }
  if (state.sort !== DEFAULT_STATE.sort) {
    params.set("sort", state.sort);
  }
  if (state.sortDir !== DEFAULT_STATE.sortDir) {
    params.set("sortDir", state.sortDir);
  }
  if (state.cursor) {
    params.set("cursor", state.cursor);
  }
  if (state.entry) {
    params.set("entry", state.entry);
  }
  return params;
}

export function buildTmEntryListHref(pathname: string, state: TmEntryListUrlState): string {
  const query = buildTmEntryListSearchParams(state).toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function tmEntryListFiltersEqual(
  left: TmEntryListUrlState,
  right: TmEntryListUrlState,
): boolean {
  return FILTER_KEYS.every((key) => (left[key] ?? "") === (right[key] ?? ""));
}

export function applyTmEntryListStatePatch(
  current: TmEntryListUrlState,
  patch: Partial<TmEntryListUrlState>,
): TmEntryListUrlState {
  const next = { ...current, ...patch };
  if (patch.cursor === undefined && !tmEntryListFiltersEqual(current, next)) {
    next.cursor = undefined;
  }
  return next;
}

export function clearTmEntryListFilters(state: TmEntryListUrlState): TmEntryListUrlState {
  return {
    search: "",
    sort: state.sort,
    sortDir: state.sortDir,
    entry: state.entry,
  };
}

export function getActiveTmEntryFilterChips(state: TmEntryListUrlState): TmEntryFilterChip[] {
  const chips: TmEntryFilterChip[] = [];
  if (state.search.trim()) {
    chips.push({ key: "search", value: state.search.trim() });
  }
  if (state.sourceLocale) {
    chips.push({ key: "sourceLocale", value: state.sourceLocale });
  }
  if (state.targetLocale) {
    chips.push({ key: "targetLocale", value: state.targetLocale });
  }
  if (state.reviewStatus) {
    chips.push({ key: "reviewStatus", value: state.reviewStatus });
  }
  if (state.origin) {
    chips.push({ key: "origin", value: state.origin });
  }
  if (state.provider) {
    chips.push({ key: "provider", value: state.provider });
  }
  if (state.createdByUserId) {
    chips.push({ key: "createdByUserId", value: state.createdByUserId });
  }
  if (state.modifiedFrom) {
    chips.push({ key: "modifiedFrom", value: state.modifiedFrom });
  }
  if (state.modifiedTo) {
    chips.push({ key: "modifiedTo", value: state.modifiedTo });
  }
  if (state.importBatchId) {
    chips.push({ key: "importBatchId", value: state.importBatchId });
  }
  return chips;
}

export function tmEntryListStateToApiQuery(
  state: TmEntryListUrlState,
  options?: { limit?: number; cursor?: string | null },
): TmEntryListApiQuery {
  const query: TmEntryListApiQuery = {
    limit: String(options?.limit ?? TM_ENTRY_PAGE_SIZE),
  };
  const cursor = options?.cursor === undefined ? state.cursor : (options.cursor ?? undefined);
  if (cursor) {
    query.cursor = cursor;
  }
  if (state.search.trim()) {
    query.search = state.search.trim().slice(0, TM_ENTRY_SEARCH_MAX_LENGTH);
  }
  if (state.sourceLocale) {
    query.sourceLocale = state.sourceLocale;
  }
  if (state.targetLocale) {
    query.targetLocale = state.targetLocale;
  }
  if (state.reviewStatus) {
    query.reviewStatus = state.reviewStatus;
  }
  if (state.origin) {
    query.origin = state.origin;
  }
  if (state.provider) {
    query.provider = state.provider;
  }
  if (state.createdByUserId) {
    query.createdByUserId = state.createdByUserId;
  }
  if (state.modifiedFrom) {
    query.modifiedFrom = modifiedDateToApiDateTime(state.modifiedFrom, "start");
  }
  if (state.modifiedTo) {
    query.modifiedTo = modifiedDateToApiDateTime(state.modifiedTo, "end");
  }
  if (state.importBatchId) {
    query.importBatchId = state.importBatchId;
  }
  if (state.sort !== DEFAULT_STATE.sort) {
    query.sort = state.sort;
  }
  if (state.sortDir !== DEFAULT_STATE.sortDir) {
    query.sortDir = state.sortDir;
  }
  return query;
}

export function buildTmEntryLocaleOptions(input: {
  localeCoverage?: string[];
  selected?: string;
}): string[] {
  const merged = new Set<string>(COMMON_LOCALES);
  for (const locale of input.localeCoverage ?? []) {
    const canonical = parseCanonicalLocaleParam(locale);
    if (canonical) {
      merged.add(canonical);
    }
  }
  const selected = parseCanonicalLocaleParam(input.selected);
  if (selected) {
    merged.add(selected);
  }
  return [...merged].toSorted((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function tmEntryCursorStackStorageKey(memoryId: string, state: TmEntryListUrlState): string {
  const filters = FILTER_KEYS.map((key) => `${key}=${state[key] ?? ""}`).join("&");
  return `tm-entry-explorer-cursors:${memoryId}:${filters}`;
}

export function tmEntryScrollStorageKey(memoryId: string): string {
  return `tm-entry-explorer-scroll:${memoryId}`;
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function readSessionJson(key: string): unknown {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSessionJson(key: string, value: unknown): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota and private-mode failures.
  }
}

export function readTmEntryCursorStack(key: string): string[] {
  const parsed = readSessionJson(key);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is string => typeof item === "string");
}

export function writeTmEntryCursorStack(key: string, stack: string[]): void {
  writeSessionJson(key, stack);
}

export function canGoToPreviousTmEntryPage(input: {
  cursor?: string;
  cursorStack: readonly string[];
}): boolean {
  return Boolean(input.cursor) && input.cursorStack.length > 0;
}

export function readTmEntryScrollOffset(key: string): number | null {
  const parsed = readSessionJson(key);
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

export function writeTmEntryScrollOffset(key: string, offset: number): void {
  writeSessionJson(key, offset);
}
