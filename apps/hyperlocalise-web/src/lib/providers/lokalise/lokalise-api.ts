/**
 * Lokalise API v2 client for TMS connector discovery.
 */

export const LOKALISE_DEFAULT_BASE_URL = "https://api.lokalise.com/api2";

/** How far back completed tasks are included in job sync. */
export const LOKALISE_RECENT_COMPLETED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Caps completed-task API pagination when no server-side recency filter exists. */
export const LOKALISE_COMPLETED_TASK_MAX_PAGES = 2;

export type LokaliseListTasksOptions = {
  filterStatuses?: string[];
  /** Stops pagination after this many pages (inclusive). */
  maxPages?: number;
  /** When set, only returns completed tasks completed at or after this Unix ms. */
  completedAfterMs?: number;
};

export interface LokaliseApiClientOptions {
  token: string;
  baseUrl?: string | null;
  fetchFn?: typeof fetch;
}

export interface LokaliseProject {
  projectId: string;
  name: string;
  description: string | null;
  projectType: string | null;
  teamId: number | null;
  baseLanguageId: number | null;
  baseLanguageIso: string | null;
  createdAt: string | null;
}

export interface LokaliseLanguage {
  langId: number;
  langIso: string;
  langName: string;
  isRtl: boolean;
}

export interface LokalisePlatformStrings {
  web: string;
  ios: string;
  android: string;
  other: string;
}

export interface LokaliseTranslation {
  translationId: number;
  keyId: number;
  languageIso: string;
  translation: string;
  modifiedAt: string | null;
  modifiedAtTimestamp: number | null;
  isReviewed: boolean;
  isUnverified: boolean;
}

export interface LokaliseTaskLanguageUser {
  userId: number;
  email: string;
  fullname: string;
}

export interface LokaliseTaskLanguage {
  languageIso: string;
  languageId: number;
  languageName: string;
  status: string;
  progress: number;
  users: LokaliseTaskLanguageUser[];
}

export interface LokaliseTask {
  taskId: number;
  title: string;
  description: string | null;
  status: string;
  progress: number;
  taskType: string;
  dueDate: string | null;
  dueDateTimestamp: number | null;
  sourceLanguageIso: string | null;
  languages: LokaliseTaskLanguage[];
  keysCount: number;
  wordsCount: number;
  createdAt: string | null;
  createdAtTimestamp: number | null;
  completedAt: string | null;
  completedAtTimestamp: number | null;
}

export interface LokaliseDetailedTaskLanguage extends LokaliseTaskLanguage {
  keyIds: number[];
}

export interface LokaliseDetailedTask extends LokaliseTask {
  languages: LokaliseDetailedTaskLanguage[];
}

export type LokaliseBulkUpdateTranslation = {
  languageIso: string;
  translation: string;
  isUnverified?: boolean;
  isReviewed?: boolean;
};

export type LokaliseBulkUpdateKey = {
  keyId: number;
  translations: LokaliseBulkUpdateTranslation[];
};

export type LokaliseFileDownloadRequest = {
  format: string;
  originalFilenames?: boolean;
  bundleStructure?: string;
  filterLangs?: string[];
  filterFilenames?: string[];
};

export type LokaliseFileDownloadResult = {
  bundleUrl: string;
  warning: string | null;
};

export interface LokaliseKey {
  keyId: number;
  keyName: LokalisePlatformStrings;
  filenames: LokalisePlatformStrings;
  description: string | null;
  context: string | null;
  platforms: string[];
  tags: string[];
  isPlural: boolean;
  isHidden: boolean;
  isArchived: boolean;
  createdAt: string | null;
  modifiedAt: string | null;
  translationsModifiedAt: string | null;
  translations: LokaliseTranslation[];
}

export const LOKALISE_DEFAULT_BUNDLE_STRUCTURE = "%LANG_ISO%.%FORMAT%";

/** Caps glossary-term pagination during sync and live lookup. */
export const LOKALISE_GLOSSARY_MAX_PAGES = 100;

/** Caps project keys scanned when building translation-memory segments. */
export const LOKALISE_TM_SYNC_MAX_KEYS = 2500;

export interface LokaliseGlossaryTermTranslation {
  id: number;
  languageId: number;
  languageIdSnake: number;
  languageIso: string;
  languageIsoSnake: string;
  langIso: string;
  langIsoSnake: string;
  translation: string;
  description: string | null;
}

export interface LokaliseGlossaryTerm {
  id: number;
  term: string;
  description: string | null;
  caseSensitive: boolean;
  translatable: boolean;
  forbidden: boolean;
  tags: string[];
  translations: LokaliseGlossaryTermTranslation[];
}

export class LokaliseApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "LokaliseApiError";
  }
}

export class LokaliseApiClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: LokaliseApiClientOptions) {
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? LOKALISE_DEFAULT_BASE_URL).replace(/\/+$/g, "");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  get resolvedBaseUrl() {
    return this.baseUrl;
  }

  async listProjects(): Promise<LokaliseProject[]> {
    const projects: LokaliseProject[] = [];
    let page = 1;
    const limit = 100;

    while (true) {
      const response = await this.get<LokaliseProjectsListResponse>(
        `/projects?page=${page}&limit=${limit}`,
      );
      const pageItems = (response.projects ?? []).map(normalizeLokaliseProject);
      projects.push(...pageItems);

      if (pageItems.length < limit) {
        break;
      }

      page += 1;
    }

    return projects;
  }

  async listKeys(
    projectId: string,
    options?: {
      includeTranslations?: boolean;
      filterKeyIds?: number[];
      filterTranslationLangIds?: number[];
    },
  ): Promise<LokaliseKey[]> {
    const keys: LokaliseKey[] = [];
    let cursor = "";
    const limit = 500;
    const includeTranslations = options?.includeTranslations ?? true;
    const filterKeyIds = options?.filterKeyIds?.length ? options.filterKeyIds.join(",") : null;
    const filterTranslationLangIds = options?.filterTranslationLangIds?.length
      ? options.filterTranslationLangIds.join(",")
      : null;

    while (true) {
      const params = new URLSearchParams({
        pagination: "cursor",
        limit: String(limit),
        include_translations: includeTranslations ? "1" : "0",
      });
      if (cursor) {
        params.set("cursor", cursor);
      }
      if (filterKeyIds) {
        params.set("filter_key_ids", filterKeyIds);
      }
      if (filterTranslationLangIds) {
        params.set("filter_translation_lang_ids", filterTranslationLangIds);
      }

      const { body, nextCursor } = await this.getWithPagination<LokaliseKeysListResponse>(
        `/projects/${encodeURIComponent(projectId)}/keys?${params.toString()}`,
      );
      const pageItems = (body.keys ?? []).map(normalizeLokaliseKey);
      keys.push(...pageItems);

      if (!nextCursor) {
        break;
      }

      cursor = nextCursor;
    }

    return keys;
  }

  async listTasks(projectId: string, options?: LokaliseListTasksOptions): Promise<LokaliseTask[]> {
    const tasks: LokaliseTask[] = [];
    let page = 1;
    const limit = 500;
    const filterStatuses = options?.filterStatuses?.join(",") ?? null;
    const maxPages = options?.maxPages;
    const completedAfterMs = options?.completedAfterMs;

    while (true) {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (filterStatuses) {
        params.set("filter_statuses", filterStatuses);
      }

      const response = await this.get<LokaliseTasksListResponse>(
        `/projects/${encodeURIComponent(projectId)}/tasks?${params.toString()}`,
      );
      const pageItems = (response.tasks ?? []).map(normalizeLokaliseTask);
      const acceptedItems =
        completedAfterMs == null
          ? pageItems
          : pageItems.filter((task) => isLokaliseTaskCompletedAfter(task, completedAfterMs));
      tasks.push(...acceptedItems);

      if (pageItems.length < limit) {
        break;
      }

      if (maxPages != null && page >= maxPages) {
        break;
      }

      page += 1;
    }

    return tasks;
  }

  async getTask(projectId: string, taskId: number): Promise<LokaliseDetailedTask> {
    const response = await this.get<LokaliseTaskGetResponse>(
      `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(String(taskId))}`,
    );
    if (!response.task) {
      throw new LokaliseApiError(
        `Lokalise task ${taskId} was not found in project ${projectId}`,
        404,
        response,
      );
    }

    return normalizeLokaliseDetailedTask(response.task);
  }

  async bulkUpdateKeys(
    projectId: string,
    keys: LokaliseBulkUpdateKey[],
  ): Promise<LokaliseBulkUpdateKeysResponse> {
    if (keys.length === 0) {
      return {
        keys: [] as LokaliseKeyApiRecord[],
        errors: [] as LokaliseBulkUpdateKeyErrorRecord[],
      };
    }

    const body = {
      keys: keys.map((key) => ({
        key_id: key.keyId,
        translations: key.translations.map((translation) => ({
          language_iso: translation.languageIso,
          translation: translation.translation,
          ...(translation.isUnverified != null ? { is_unverified: translation.isUnverified } : {}),
          ...(translation.isReviewed != null ? { is_reviewed: translation.isReviewed } : {}),
        })),
      })),
    };

    return this.put<LokaliseBulkUpdateKeysResponse>(
      `/projects/${encodeURIComponent(projectId)}/keys`,
      body,
    );
  }

  async requestFileDownload(
    projectId: string,
    request: LokaliseFileDownloadRequest,
  ): Promise<LokaliseFileDownloadResult> {
    const response = await this.post<LokaliseFileDownloadResponse>(
      `/projects/${encodeURIComponent(projectId)}/files/download`,
      {
        format: request.format,
        original_filenames: request.originalFilenames ?? false,
        bundle_structure: request.bundleStructure ?? LOKALISE_DEFAULT_BUNDLE_STRUCTURE,
        ...(request.filterLangs?.length ? { filter_langs: request.filterLangs } : {}),
        ...(request.filterFilenames?.length ? { filter_filenames: request.filterFilenames } : {}),
      },
    );

    const bundleUrl = response.bundle_url?.trim() ?? "";
    if (!bundleUrl) {
      throw new LokaliseApiError(
        `Lokalise file download for project ${projectId} did not return a bundle URL`,
        502,
        response,
      );
    }

    return {
      bundleUrl,
      warning: response.warning?.trim() || null,
    };
  }

  async downloadUrl(url: string): Promise<ArrayBuffer> {
    const response = await this.fetchFn(url, { method: "GET" });
    if (!response.ok) {
      throw new LokaliseApiError(
        `Failed to download Lokalise bundle from ${url}`,
        response.status,
        null,
      );
    }

    return response.arrayBuffer();
  }

  async listGlossaryTerms(projectId: string): Promise<LokaliseGlossaryTerm[]> {
    const terms: LokaliseGlossaryTerm[] = [];
    let cursor = "";
    const limit = 500;
    let pageCount = 0;

    while (true) {
      if (pageCount >= LOKALISE_GLOSSARY_MAX_PAGES) {
        break;
      }

      const params = new URLSearchParams({
        limit: String(limit),
      });
      if (cursor) {
        params.set("cursor", cursor);
      }

      const { body, nextCursor } = await this.getWithPagination<LokaliseGlossaryTermsListResponse>(
        `/projects/${encodeURIComponent(projectId)}/glossary-terms?${params.toString()}`,
      );
      const pageItems = listLokaliseGlossaryTermRecords(body).map(normalizeLokaliseGlossaryTerm);
      terms.push(...pageItems);

      if (!nextCursor && pageItems.length < limit) {
        break;
      }

      if (!nextCursor) {
        const bodyCursor = readLokaliseGlossaryNextCursor(body);
        if (!bodyCursor) {
          break;
        }
        cursor = bodyCursor;
      } else {
        cursor = nextCursor;
      }

      pageCount += 1;
    }

    return terms;
  }

  async listProjectLanguages(projectId: string): Promise<LokaliseLanguage[]> {
    const languages: LokaliseLanguage[] = [];
    let page = 1;
    const limit = 100;

    while (true) {
      const response = await this.get<LokaliseLanguagesListResponse>(
        `/projects/${encodeURIComponent(projectId)}/languages?page=${page}&limit=${limit}`,
      );
      const pageItems = (response.languages ?? []).map(normalizeLokaliseLanguage);
      languages.push(...pageItems);

      if (pageItems.length < limit) {
        break;
      }

      page += 1;
    }

    return languages;
  }

  private authHeaders(): Record<string, string> {
    return {
      "X-Api-Token": this.token,
    };
  }

  private async get<T>(path: string): Promise<T> {
    const { body } = await this.getWithPagination<T>(path);
    return body;
  }

  private async getWithPagination<T>(
    path: string,
  ): Promise<{ body: T; nextCursor: string | null }> {
    return this.request<T>(path, {
      method: "GET",
      headers: this.authHeaders(),
    });
  }

  private async request<T>(
    path: string,
    init: RequestInit,
  ): Promise<{ body: T; nextCursor: string | null }> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchFn(url, init);

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => null);
      }

      throw new LokaliseApiError(
        `Lokalise API returned HTTP ${response.status} for ${path}`,
        response.status,
        body,
      );
    }

    const body = (await response.json()) as T;
    const nextCursor = response.headers.get("X-Pagination-Next-Cursor")?.trim() || null;
    return { body, nextCursor };
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    const { body } = await this.request<T>(path, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return body;
  }

  private async put<T>(path: string, payload: unknown): Promise<T> {
    const { body } = await this.request<T>(path, {
      method: "PUT",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return body;
  }
}

type LokaliseGlossaryTermTranslationApiRecord = {
  id?: number;
  lang_id?: number;
  language_id?: number;
  lang_iso?: string;
  language_iso?: string;
  translation?: string;
  description?: string | null;
};

type LokaliseGlossaryTermApiRecord = {
  id?: number;
  term?: string;
  description?: string | null;
  case_sensitive?: boolean;
  caseSensitive?: boolean;
  translatable?: boolean;
  forbidden?: boolean;
  tags?: string[];
  translations?: LokaliseGlossaryTermTranslationApiRecord[];
};

type LokaliseGlossaryTermsListResponse = {
  items?: LokaliseGlossaryTermApiRecord[];
  data?: LokaliseGlossaryTermApiRecord[];
  next_cursor?: string;
  nextCursor?: string;
  meta?: {
    next_cursor?: string;
    nextCursor?: string;
  };
};

type LokaliseProjectsListResponse = {
  projects?: LokaliseProjectApiRecord[];
};

type LokaliseTasksListResponse = {
  project_id?: string;
  tasks?: LokaliseTaskApiRecord[];
};

type LokaliseTaskGetResponse = {
  project_id?: string;
  task?: LokaliseDetailedTaskApiRecord;
};

type LokaliseDetailedTaskApiRecord = LokaliseTaskApiRecord & {
  languages?: LokaliseDetailedTaskLanguageApiRecord[];
};

type LokaliseDetailedTaskLanguageApiRecord = LokaliseTaskLanguageApiRecord & {
  keys?: number[];
};

type LokaliseBulkUpdateKeyErrorRecord = {
  message?: string;
  code?: number | string;
  key?: { key_id?: number; key_name?: unknown };
  key_id?: number;
};

type LokaliseBulkUpdateKeysResponse = {
  project_id?: string;
  keys?: LokaliseKeyApiRecord[];
  errors?: LokaliseBulkUpdateKeyErrorRecord[] | Record<string, unknown>;
};

type LokaliseFileDownloadResponse = {
  project_id?: string;
  bundle_url?: string;
  warning?: string | null;
};

type LokaliseTaskLanguageUserApiRecord = {
  user_id?: number;
  email?: string;
  fullname?: string;
};

type LokaliseTaskLanguageApiRecord = {
  language_iso?: string;
  language_id?: number;
  language_name?: string;
  status?: string;
  progress?: number;
  users?: LokaliseTaskLanguageUserApiRecord[];
};

type LokaliseTaskApiRecord = {
  task_id: number;
  title: string;
  description?: string | null;
  status: string;
  progress?: number;
  task_type?: string;
  due_date?: string | null;
  due_date_timestamp?: number | null;
  source_language_iso?: string | null;
  languages?: LokaliseTaskLanguageApiRecord[];
  keys_count?: number;
  words_count?: number;
  created_at?: string | null;
  created_at_timestamp?: number | null;
  completed_at?: string | null;
  completed_at_timestamp?: number | null;
};

type LokaliseLanguagesListResponse = {
  project_id?: string;
  languages?: LokaliseLanguageApiRecord[];
};

type LokaliseKeysListResponse = {
  project_id?: string;
  keys?: LokaliseKeyApiRecord[];
};

type LokaliseKeyApiRecord = {
  key_id: number;
  key_name: string | LokalisePlatformStringsApiRecord;
  filenames?: LokalisePlatformStringsApiRecord;
  description?: string | null;
  context?: string | null;
  platforms?: string[];
  tags?: string[];
  is_plural?: boolean;
  is_hidden?: boolean;
  is_archived?: boolean;
  created_at?: string | null;
  modified_at?: string | null;
  translations_modified_at?: string | null;
  translations?: LokaliseTranslationApiRecord[];
};

type LokalisePlatformStringsApiRecord = {
  web?: string;
  ios?: string;
  android?: string;
  other?: string;
};

type LokaliseTranslationApiRecord = {
  translation_id?: number;
  key_id?: number;
  language_iso?: string;
  translation?: string;
  modified_at?: string | null;
  modified_at_timestamp?: number | null;
  is_reviewed?: boolean;
  is_unverified?: boolean;
};

type LokaliseProjectApiRecord = {
  project_id: string;
  name: string;
  description?: string | null;
  project_type?: string | null;
  team_id?: number | null;
  base_language_id?: number | null;
  base_language_iso?: string | null;
  created_at?: string | null;
};

type LokaliseLanguageApiRecord = {
  lang_id: number;
  lang_iso: string;
  lang_name: string;
  is_rtl?: boolean;
};

function normalizeLokaliseDetailedTask(
  record: LokaliseDetailedTaskApiRecord,
): LokaliseDetailedTask {
  const task = normalizeLokaliseTask(record);
  return {
    ...task,
    languages: (record.languages ?? []).map(normalizeLokaliseDetailedTaskLanguage),
  };
}

function normalizeLokaliseDetailedTaskLanguage(
  record: LokaliseDetailedTaskLanguageApiRecord,
): LokaliseDetailedTaskLanguage {
  return {
    ...normalizeLokaliseTaskLanguage(record),
    keyIds: record.keys ?? [],
  };
}

function normalizeLokaliseTask(record: LokaliseTaskApiRecord): LokaliseTask {
  return {
    taskId: record.task_id,
    title: record.title,
    description: record.description ?? null,
    status: record.status,
    progress: record.progress ?? 0,
    taskType: record.task_type ?? "translation",
    dueDate: record.due_date ?? null,
    dueDateTimestamp: record.due_date_timestamp ?? null,
    sourceLanguageIso: record.source_language_iso ?? null,
    languages: (record.languages ?? []).map(normalizeLokaliseTaskLanguage),
    keysCount: record.keys_count ?? 0,
    wordsCount: record.words_count ?? 0,
    createdAt: record.created_at ?? null,
    createdAtTimestamp: record.created_at_timestamp ?? null,
    completedAt: record.completed_at ?? null,
    completedAtTimestamp: record.completed_at_timestamp ?? null,
  };
}

function normalizeLokaliseTaskLanguage(
  record: LokaliseTaskLanguageApiRecord,
): LokaliseTaskLanguage {
  return {
    languageIso: record.language_iso?.trim() ?? "",
    languageId: record.language_id ?? 0,
    languageName: record.language_name?.trim() ?? "",
    status: record.status?.trim() ?? "",
    progress: record.progress ?? 0,
    users: (record.users ?? []).map(normalizeLokaliseTaskLanguageUser),
  };
}

function normalizeLokaliseTaskLanguageUser(
  record: LokaliseTaskLanguageUserApiRecord,
): LokaliseTaskLanguageUser {
  return {
    userId: record.user_id ?? 0,
    email: record.email?.trim() ?? "",
    fullname: record.fullname?.trim() ?? "",
  };
}

function listLokaliseGlossaryTermRecords(response: LokaliseGlossaryTermsListResponse) {
  if (response.items?.length) {
    return response.items;
  }
  return response.data ?? [];
}

function readLokaliseGlossaryNextCursor(response: LokaliseGlossaryTermsListResponse) {
  return (
    response.nextCursor?.trim() ||
    response.next_cursor?.trim() ||
    response.meta?.nextCursor?.trim() ||
    response.meta?.next_cursor?.trim() ||
    null
  );
}

function normalizeLokaliseGlossaryTerm(
  record: LokaliseGlossaryTermApiRecord,
): LokaliseGlossaryTerm {
  return {
    id: record.id ?? 0,
    term: record.term?.trim() ?? "",
    description: record.description?.trim() || null,
    caseSensitive: record.caseSensitive ?? record.case_sensitive ?? false,
    translatable: record.translatable ?? true,
    forbidden: record.forbidden ?? false,
    tags: record.tags ?? [],
    translations: (record.translations ?? []).map(normalizeLokaliseGlossaryTermTranslation),
  };
}

function normalizeLokaliseGlossaryTermTranslation(
  record: LokaliseGlossaryTermTranslationApiRecord,
): LokaliseGlossaryTermTranslation {
  const languageId = record.language_id ?? record.lang_id ?? 0;
  const languageIso = record.language_iso?.trim() ?? record.lang_iso?.trim() ?? "";

  return {
    id: record.id ?? 0,
    languageId,
    languageIdSnake: languageId,
    languageIso,
    languageIsoSnake: languageIso,
    langIso: languageIso,
    langIsoSnake: languageIso,
    translation: stringifyLokaliseTranslationValue(record.translation),
    description: record.description?.trim() || null,
  };
}

function normalizeLokaliseProject(record: LokaliseProjectApiRecord): LokaliseProject {
  return {
    projectId: record.project_id,
    name: record.name,
    description: record.description ?? null,
    projectType: record.project_type ?? null,
    teamId: record.team_id ?? null,
    baseLanguageId: record.base_language_id ?? null,
    baseLanguageIso: record.base_language_iso ?? null,
    createdAt: record.created_at ?? null,
  };
}

function normalizeLokaliseLanguage(record: LokaliseLanguageApiRecord): LokaliseLanguage {
  return {
    langId: record.lang_id,
    langIso: record.lang_iso,
    langName: record.lang_name,
    isRtl: record.is_rtl ?? false,
  };
}

function normalizeLokaliseKey(record: LokaliseKeyApiRecord): LokaliseKey {
  return {
    keyId: record.key_id,
    keyName: normalizeLokalisePlatformStrings(record.key_name),
    filenames: normalizeLokalisePlatformStrings(record.filenames),
    description: record.description ?? null,
    context: record.context ?? null,
    platforms: record.platforms ?? [],
    tags: record.tags ?? [],
    isPlural: record.is_plural ?? false,
    isHidden: record.is_hidden ?? false,
    isArchived: record.is_archived ?? false,
    createdAt: record.created_at ?? null,
    modifiedAt: record.modified_at ?? null,
    translationsModifiedAt: record.translations_modified_at ?? null,
    translations: (record.translations ?? []).map(normalizeLokaliseTranslation),
  };
}

function normalizeLokaliseTranslation(record: LokaliseTranslationApiRecord): LokaliseTranslation {
  return {
    translationId: record.translation_id ?? 0,
    keyId: record.key_id ?? 0,
    languageIso: record.language_iso?.trim() ?? "",
    translation: stringifyLokaliseTranslationValue(record.translation),
    modifiedAt: record.modified_at ?? null,
    modifiedAtTimestamp: record.modified_at_timestamp ?? null,
    isReviewed: record.is_reviewed ?? false,
    isUnverified: record.is_unverified ?? false,
  };
}

function normalizeLokalisePlatformStrings(
  value: string | LokalisePlatformStringsApiRecord | undefined,
): LokalisePlatformStrings {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return {
      web: trimmed,
      ios: trimmed,
      android: trimmed,
      other: trimmed,
    };
  }

  return {
    web: value?.web?.trim() ?? "",
    ios: value?.ios?.trim() ?? "",
    android: value?.android?.trim() ?? "",
    other: value?.other?.trim() ?? "",
  };
}

function stringifyLokaliseTranslationValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return JSON.stringify(value);
}

export function extractLokaliseKeyName(keyName: LokalisePlatformStrings) {
  const candidates = [keyName.web, keyName.ios, keyName.android, keyName.other];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "";
}

export function listLokaliseFilenameEntries(filenames: LokalisePlatformStrings) {
  const entries: Array<{ platform: string; filename: string }> = [];
  for (const platform of ["web", "ios", "android", "other"] as const) {
    const filename = filenames[platform].trim();
    if (filename) {
      entries.push({ platform, filename });
    }
  }

  return entries;
}

export function inferFormatFromFilename(filename: string) {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return null;
  }

  const extension = filename
    .slice(lastDot + 1)
    .trim()
    .toLowerCase();
  return extension || null;
}

export function partitionLokaliseLocales(
  project: Pick<LokaliseProject, "baseLanguageId" | "baseLanguageIso">,
  languages: LokaliseLanguage[],
) {
  const sourceLocale = project.baseLanguageIso?.trim() || null;
  const targetLocales = languages
    .filter((language) => {
      if (project.baseLanguageId != null) {
        return language.langId !== project.baseLanguageId;
      }
      if (sourceLocale) {
        return language.langIso !== sourceLocale;
      }
      return false;
    })
    .map((language) => language.langIso.trim())
    .filter((locale): locale is string => Boolean(locale));

  return { sourceLocale, targetLocales };
}

export function getLokaliseTaskCompletionMs(task: LokaliseTask) {
  if (task.completedAtTimestamp != null && task.completedAtTimestamp > 0) {
    return task.completedAtTimestamp * 1000;
  }

  if (!task.completedAt) {
    return null;
  }

  const parsed = Date.parse(task.completedAt);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isLokaliseTaskCompletedAfter(task: LokaliseTask, afterMs: number) {
  const completedMs = getLokaliseTaskCompletionMs(task);
  return completedMs != null && completedMs >= afterMs;
}

export function buildLokaliseProjectUrl(projectId: string) {
  return `https://app.lokalise.com/project/${encodeURIComponent(projectId)}/`;
}

export function buildLokaliseTaskUrl(projectId: string, taskId: number | string) {
  return `https://app.lokalise.com/project/${encodeURIComponent(projectId)}/?task=${encodeURIComponent(String(taskId))}`;
}

export function collectLokaliseTaskAssignees(task: LokaliseTask) {
  const assignees = new Set<string>();
  for (const language of task.languages) {
    for (const user of language.users) {
      const label = user.fullname || user.email;
      if (label) {
        assignees.add(label);
      }
    }
  }
  return [...assignees];
}

export function collectLokaliseTaskTargetLocales(task: LokaliseTask) {
  return task.languages
    .map((language) => language.languageIso.trim())
    .filter((locale): locale is string => Boolean(locale));
}

export function collectLokaliseTaskKeyIds(task: Pick<LokaliseDetailedTask, "languages">) {
  const keyIds = new Set<number>();
  for (const language of task.languages) {
    for (const keyId of language.keyIds) {
      if (keyId > 0) {
        keyIds.add(keyId);
      }
    }
  }
  return [...keyIds];
}

export function summarizeLokaliseBulkUpdateChunkResult(
  chunk: LokaliseBulkUpdateKey[],
  response: {
    keys?: Array<{ key_id?: number }>;
    errors?: LokaliseBulkUpdateKeysResponse["errors"];
  },
): {
  uploaded: number;
  failed: number;
  failedKeyCount: number;
  failures: Array<{ locale: string; fileId: string | null; message: string }>;
} {
  const failedKeyIds = collectLokaliseBulkUpdateFailedKeyIds({
    requestedKeyIds: chunk.map((batch) => batch.keyId),
    responseKeys: response.keys,
    errors: response.errors,
  });
  const errorMessageByKeyId = buildLokaliseBulkUpdateErrorMessages(response.errors);

  let uploaded = 0;
  let failed = 0;
  let failedKeyCount = 0;
  const failures: Array<{ locale: string; fileId: string | null; message: string }> = [];

  for (const batch of chunk) {
    if (!failedKeyIds.has(batch.keyId)) {
      uploaded += batch.translations.length;
      continue;
    }

    failedKeyCount += 1;
    const message = errorMessageByKeyId.get(batch.keyId) ?? "lokalise_bulk_update_key_failed";
    failed += batch.translations.length;
    for (const translation of batch.translations) {
      failures.push({
        locale: translation.languageIso,
        fileId: null,
        message,
      });
    }
  }

  return { uploaded, failed, failedKeyCount, failures };
}

function collectLokaliseBulkUpdateFailedKeyIds(input: {
  requestedKeyIds: number[];
  responseKeys?: Array<{ key_id?: number }>;
  errors?: LokaliseBulkUpdateKeysResponse["errors"];
}) {
  const failed = new Set<number>();

  for (const entry of listLokaliseBulkUpdateErrors(input.errors)) {
    const keyId = extractLokaliseBulkUpdateErrorKeyId(entry);
    if (keyId != null) {
      failed.add(keyId);
    }
  }

  const updatedKeyIds = new Set(
    (input.responseKeys ?? [])
      .map((key) => key.key_id)
      .filter((keyId): keyId is number => typeof keyId === "number" && Number.isFinite(keyId)),
  );

  const errorEntries = listLokaliseBulkUpdateErrors(input.errors);
  const shouldInferMissingKeysAsFailed = errorEntries.length > 0 || input.responseKeys != null;

  if (shouldInferMissingKeysAsFailed) {
    for (const keyId of input.requestedKeyIds) {
      if (!updatedKeyIds.has(keyId)) {
        failed.add(keyId);
      }
    }
  }

  return failed;
}

function buildLokaliseBulkUpdateErrorMessages(errors: LokaliseBulkUpdateKeysResponse["errors"]) {
  const messages = new Map<number, string>();
  for (const entry of listLokaliseBulkUpdateErrors(errors)) {
    const keyId = extractLokaliseBulkUpdateErrorKeyId(entry);
    const message = entry.message?.trim();
    if (keyId != null && message) {
      messages.set(keyId, message);
    }
  }
  return messages;
}

function listLokaliseBulkUpdateErrors(
  errors: LokaliseBulkUpdateKeysResponse["errors"],
): LokaliseBulkUpdateKeyErrorRecord[] {
  if (!errors) {
    return [];
  }
  if (Array.isArray(errors)) {
    return errors;
  }
  return Object.values(errors).filter(
    (entry): entry is LokaliseBulkUpdateKeyErrorRecord =>
      entry != null && typeof entry === "object",
  );
}

function extractLokaliseBulkUpdateErrorKeyId(entry: LokaliseBulkUpdateKeyErrorRecord) {
  const keyId = entry.key?.key_id ?? entry.key_id;
  if (typeof keyId !== "number" || !Number.isFinite(keyId)) {
    return null;
  }
  return keyId;
}

export function parseLokaliseExternalJobId(externalJobId: string) {
  const trimmed = externalJobId.trim();
  if (!trimmed) {
    return null;
  }

  const taskId = Number(trimmed);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return null;
  }

  return { taskId };
}

export function parseLokaliseTaskDueDate(task: LokaliseTask) {
  if (task.dueDateTimestamp != null && task.dueDateTimestamp > 0) {
    return new Date(task.dueDateTimestamp * 1000);
  }

  if (!task.dueDate) {
    return null;
  }

  const parsed = new Date(task.dueDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
