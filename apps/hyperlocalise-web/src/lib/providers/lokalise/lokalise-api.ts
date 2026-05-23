/**
 * Lokalise API v2 client for TMS connector discovery.
 */

export const LOKALISE_DEFAULT_BASE_URL = "https://api.lokalise.com/api2";

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
    options?: { includeTranslations?: boolean },
  ): Promise<LokaliseKey[]> {
    const keys: LokaliseKey[] = [];
    let cursor = "";
    const limit = 500;
    const includeTranslations = options?.includeTranslations ?? true;

    while (true) {
      const params = new URLSearchParams({
        pagination: "cursor",
        limit: String(limit),
        include_translations: includeTranslations ? "1" : "0",
      });
      if (cursor) {
        params.set("cursor", cursor);
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
}

type LokaliseProjectsListResponse = {
  projects?: LokaliseProjectApiRecord[];
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

export function buildLokaliseProjectUrl(projectId: string) {
  return `https://app.lokalise.com/project/${encodeURIComponent(projectId)}/`;
}
