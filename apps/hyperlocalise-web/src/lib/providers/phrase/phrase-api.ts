/**
 * Phrase Strings API v2 client for project discovery and locale metadata.
 *
 * This module only implements endpoints required for the TMS connector
 * project-scan flow.
 */

import { resolvePhraseBaseUrl } from "./phrase-base-url";

export interface PhraseApiClientOptions {
  token: string;
  region?: string | null;
  baseUrl?: string | null;
  fetchFn?: typeof fetch;
}

export interface PhraseAccount {
  id: string;
  name: string;
  slug: string;
}

export interface PhraseProject {
  id: string;
  name: string;
  slug: string;
  mainFormat: string | null;
  account: PhraseAccount | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PhraseLocale {
  id: string;
  name: string;
  code: string | null;
  default: boolean;
}

export class PhraseApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "PhraseApiError";
  }
}

export class PhraseApiClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: PhraseApiClientOptions) {
    this.token = options.token;
    this.baseUrl = resolvePhraseBaseUrl({
      region: options.region,
      baseUrl: options.baseUrl,
    });
    this.fetchFn = options.fetchFn ?? fetch;
  }

  get resolvedBaseUrl() {
    return this.baseUrl;
  }

  async listProjects(): Promise<PhraseProject[]> {
    const projects: PhraseProject[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const pageItems = await this.get<PhraseProjectApiRecord[]>(
        `/projects?page=${page}&per_page=${perPage}`,
      );
      projects.push(...pageItems.map(normalizePhraseProject));

      if (pageItems.length < perPage) {
        break;
      }

      page += 1;
    }

    return projects;
  }

  async listLocales(projectId: string): Promise<PhraseLocale[]> {
    const locales: PhraseLocale[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const pageItems = await this.get<PhraseLocaleApiRecord[]>(
        `/projects/${encodeURIComponent(projectId)}/locales?page=${page}&per_page=${perPage}`,
      );
      locales.push(...pageItems.map(normalizePhraseLocale));

      if (pageItems.length < perPage) {
        break;
      }

      page += 1;
    }

    return locales;
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `token ${this.token}`,
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

      throw new PhraseApiError(
        `Phrase API returned HTTP ${response.status} for ${path}`,
        response.status,
        body,
      );
    }

    return response.json() as Promise<T>;
  }
}

type PhraseProjectApiRecord = {
  id: string;
  name: string;
  slug: string;
  main_format?: string | null;
  account?: PhraseAccount | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PhraseLocaleApiRecord = {
  id: string;
  name: string;
  code?: string | null;
  default?: boolean;
};

function normalizePhraseProject(project: PhraseProjectApiRecord): PhraseProject {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    mainFormat: project.main_format ?? null,
    account: project.account ?? null,
    createdAt: project.created_at ?? null,
    updatedAt: project.updated_at ?? null,
  };
}

function normalizePhraseLocale(locale: PhraseLocaleApiRecord): PhraseLocale {
  return {
    id: locale.id,
    name: locale.name,
    code: locale.code ?? null,
    default: locale.default ?? false,
  };
}
