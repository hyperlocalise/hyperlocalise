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
    return this.request<T>(path, {
      method: "GET",
      headers: this.authHeaders(),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
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

    return response.json() as Promise<T>;
  }
}

type LokaliseProjectsListResponse = {
  projects?: LokaliseProjectApiRecord[];
};

type LokaliseLanguagesListResponse = {
  project_id?: string;
  languages?: LokaliseLanguageApiRecord[];
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
      return true;
    })
    .map((language) => language.langIso.trim())
    .filter((locale): locale is string => Boolean(locale));

  return { sourceLocale, targetLocales };
}

export function buildLokaliseProjectUrl(projectId: string) {
  return `https://app.lokalise.com/project/${encodeURIComponent(projectId)}/`;
}
