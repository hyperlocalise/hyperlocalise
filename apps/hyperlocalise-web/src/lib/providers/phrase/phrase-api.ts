/**
 * Phrase Strings API v2 client for TMS connector discovery and file/key sync.
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

export interface PhraseBranch {
  name: string;
  merged: boolean | null;
  state: string | null;
}

export interface PhraseKey {
  id: string;
  name: string;
  description: string | null;
  nameHash: string | null;
  plural: boolean;
  useOrdinalRules: boolean;
  tags: string[];
  dataType: string | null;
  customMetadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PhraseTranslation {
  id: string;
  keyId: string;
  localeName: string;
  content: string | null;
  state: string | null;
  unverified: boolean;
  excluded: boolean;
  pluralSuffix: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PhraseUpload {
  id: string;
  filename: string;
  format: string | null;
  state: string | null;
  tag: string | null;
  tags: string[];
  url: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PhraseUserPreview {
  id: string;
  username: string | null;
  name: string | null;
}

export interface PhraseLocalePreview {
  id: string;
  name: string;
  code: string | null;
}

export interface PhraseKeyComment {
  id: string;
  message: string;
  hasReplies: boolean;
  user: PhraseUserPreview | null;
  createdAt: string | null;
  updatedAt: string | null;
  locales: PhraseLocalePreview[];
}

export interface PhraseLocaleDownloadMetadata {
  localeId: string;
  localeName: string;
  fileFormat: string;
  branch: string | null;
  tags: string[];
  downloadPath: string;
  options: Record<string, unknown>;
}

export type PhraseListOptions = {
  branch?: string | null;
  perPage?: number;
};

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

  async listLocales(projectId: string, options: PhraseListOptions = {}): Promise<PhraseLocale[]> {
    return this.paginate({
      buildPath: (page, perPage) =>
        this.buildPath(`/projects/${encodeURIComponent(projectId)}/locales`, {
          page,
          per_page: perPage,
          branch: options.branch,
        }),
      normalize: (record) => normalizePhraseLocale(record as PhraseLocaleApiRecord),
    });
  }

  async listBranches(projectId: string): Promise<PhraseBranch[]> {
    return this.paginate({
      buildPath: (page, perPage) =>
        this.buildPath(`/projects/${encodeURIComponent(projectId)}/branches`, {
          page,
          per_page: perPage,
        }),
      normalize: (record) => normalizePhraseBranch(record as PhraseBranchApiRecord),
    });
  }

  async listKeys(projectId: string, options: PhraseListOptions = {}): Promise<PhraseKey[]> {
    return this.paginate({
      buildPath: (page, perPage) =>
        this.buildPath(`/projects/${encodeURIComponent(projectId)}/keys`, {
          page,
          per_page: perPage,
          branch: options.branch,
        }),
      normalize: (record) => normalizePhraseKey(record as PhraseKeyApiRecord),
    });
  }

  async listKeyComments(
    projectId: string,
    keyId: string,
    options: PhraseListOptions = {},
  ): Promise<PhraseKeyComment[]> {
    return this.paginate({
      buildPath: (page, perPage) =>
        this.buildPath(
          `/projects/${encodeURIComponent(projectId)}/keys/${encodeURIComponent(keyId)}/comments`,
          {
            page,
            per_page: perPage,
            branch: options.branch,
            order: "desc",
          },
        ),
      normalize: (record) => normalizePhraseKeyComment(record as PhraseKeyCommentApiRecord),
    });
  }

  async listCommentReplies(
    projectId: string,
    keyId: string,
    commentId: string,
    options: PhraseListOptions = {},
  ): Promise<PhraseKeyComment[]> {
    return this.paginate({
      buildPath: (page, perPage) =>
        this.buildPath(
          `/projects/${encodeURIComponent(projectId)}/keys/${encodeURIComponent(keyId)}/comments/${encodeURIComponent(commentId)}/replies`,
          {
            page,
            per_page: perPage,
            branch: options.branch,
            order: "asc",
          },
        ),
      normalize: (record) => normalizePhraseKeyComment(record as PhraseKeyCommentApiRecord),
    });
  }

  async listTranslations(
    projectId: string,
    localeName: string,
    options: PhraseListOptions = {},
  ): Promise<PhraseTranslation[]> {
    return this.paginate({
      buildPath: (page, perPage) =>
        this.buildPath(`/projects/${encodeURIComponent(projectId)}/translations`, {
          page,
          per_page: perPage,
          locale_name: localeName,
          branch: options.branch,
        }),
      normalize: (record) => normalizePhraseTranslation(record as PhraseTranslationApiRecord),
    });
  }

  async listUploads(projectId: string, options: PhraseListOptions = {}): Promise<PhraseUpload[]> {
    return this.paginate({
      buildPath: (page, perPage) =>
        this.buildPath(`/projects/${encodeURIComponent(projectId)}/uploads`, {
          page,
          per_page: perPage,
          branch: options.branch,
        }),
      normalize: (record) => normalizePhraseUpload(record as PhraseUploadApiRecord),
    });
  }

  async createKey(
    projectId: string,
    input: {
      name: string;
      description?: string | null;
      tags?: string[];
      branch?: string | null;
    },
  ): Promise<PhraseKey> {
    const payload: Record<string, unknown> = {
      name: input.name,
      description: input.description ?? null,
      tags: input.tags ?? [],
    };

    const record = await this.post<PhraseKeyApiRecord>(
      `/projects/${encodeURIComponent(projectId)}/keys`,
      payload,
      { branch: input.branch },
    );

    return normalizePhraseKey(record);
  }

  async upsertTranslation(
    projectId: string,
    input: {
      keyId: string;
      localeName: string;
      content: string;
      branch?: string | null;
      unverified?: boolean;
    },
  ): Promise<PhraseTranslation> {
    const listOptions = input.branch ? { branch: input.branch } : {};
    const updatePayload = {
      content: input.content,
      unverified: input.unverified ?? false,
    };

    try {
      const record = await this.post<PhraseTranslationApiRecord>(
        `/projects/${encodeURIComponent(projectId)}/translations`,
        {
          key_id: input.keyId,
          locale_name: input.localeName,
          ...updatePayload,
        },
        { branch: input.branch },
      );

      return normalizePhraseTranslation(record);
    } catch (error) {
      if (!isPhraseTranslationConflict(error)) {
        throw error;
      }
    }

    const existing = await this.findTranslationForKey(
      projectId,
      input.keyId,
      input.localeName,
      listOptions,
    );
    if (!existing) {
      throw new PhraseApiError(
        `Phrase translation already exists for key ${input.keyId} in locale ${input.localeName}, but it could not be resolved for update`,
        409,
        null,
      );
    }

    const record = await this.patch<PhraseTranslationApiRecord>(
      `/projects/${encodeURIComponent(projectId)}/translations/${encodeURIComponent(existing.id)}`,
      updatePayload,
      { branch: input.branch },
    );

    return normalizePhraseTranslation(record);
  }

  private async findTranslationForKey(
    projectId: string,
    keyId: string,
    localeName: string,
    options: PhraseListOptions,
  ): Promise<PhraseTranslation | null> {
    const translations = await this.listTranslations(projectId, localeName, options);
    return translations.find((translation) => translation.keyId === keyId) ?? null;
  }

  buildLocaleDownloadMetadata(input: {
    projectId: string;
    locale: PhraseLocale;
    fileFormat: string | null;
    branch?: string | null;
    tags?: string[];
  }): PhraseLocaleDownloadMetadata {
    const localeName = input.locale.name.trim();
    const fileFormat = input.fileFormat?.trim() || "json";
    const branch = input.branch?.trim() || null;
    const tags = input.tags ?? [];

    return {
      localeId: input.locale.id,
      localeName,
      fileFormat,
      branch,
      tags,
      downloadPath: `/projects/${encodeURIComponent(input.projectId)}/locales/${encodeURIComponent(input.locale.id)}/download`,
      options: {
        file_format: fileFormat,
        ...(branch ? { branch } : {}),
        ...(tags.length > 0 ? { tags: tags.join(",") } : {}),
      },
    };
  }

  private async paginate<T>(input: {
    buildPath: (page: number, perPage: number) => string;
    normalize: (record: unknown) => T;
  }): Promise<T[]> {
    const items: T[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const pageItems = await this.get<unknown[]>(input.buildPath(page, perPage));
      items.push(...pageItems.map(input.normalize));

      if (pageItems.length < perPage) {
        break;
      }

      page += 1;
    }

    return items;
  }

  private buildPath(
    path: string,
    query: Record<string, string | number | null | undefined>,
  ): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") {
        continue;
      }
      params.set(key, String(value));
    }

    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
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

  private async post<T>(
    path: string,
    payload: Record<string, unknown>,
    query: Record<string, string | null | undefined> = {},
  ): Promise<T> {
    return this.request<T>(this.buildPath(path, query), {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  private async patch<T>(
    path: string,
    payload: Record<string, unknown>,
    query: Record<string, string | null | undefined> = {},
  ): Promise<T> {
    return this.request<T>(this.buildPath(path, query), {
      method: "PATCH",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchFn(url, { ...init, redirect: "error" });

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

function isPhraseTranslationConflict(error: unknown): boolean {
  if (!(error instanceof PhraseApiError)) return false;
  if (error.status === 409) return true;
  if (error.status === 422) {
    const body = error.responseBody as { message?: string } | null;
    return typeof body?.message === "string" && /already exist/i.test(body.message);
  }
  return false;
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

type PhraseBranchApiRecord = {
  name: string;
  merged?: boolean | null;
  state?: string | null;
};

type PhraseKeyApiRecord = {
  id: string;
  name: string;
  description?: string | null;
  name_hash?: string | null;
  plural?: boolean;
  use_ordinal_rules?: boolean;
  tags?: string[];
  data_type?: string | null;
  custom_metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PhraseTranslationApiRecord = {
  id: string;
  key_id: string;
  locale_name?: string;
  content?: string | null;
  state?: string | null;
  unverified?: boolean;
  excluded?: boolean;
  plural_suffix?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  key?: {
    id: string;
    name?: string;
  };
  locale?: {
    id?: string;
    name?: string;
    code?: string | null;
  };
};

type PhraseUploadApiRecord = {
  id: string;
  filename: string;
  format?: string | null;
  state?: string | null;
  tag?: string | null;
  tags?: string[];
  url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PhraseUserPreviewApiRecord = {
  id: string;
  username?: string | null;
  name?: string | null;
};

type PhraseLocalePreviewApiRecord = {
  id: string;
  name: string;
  code?: string | null;
};

type PhraseKeyCommentApiRecord = {
  id: string;
  message?: string;
  has_replies?: boolean;
  user?: PhraseUserPreviewApiRecord | null;
  created_at?: string | null;
  updated_at?: string | null;
  locales?: PhraseLocalePreviewApiRecord[];
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

function normalizePhraseBranch(branch: PhraseBranchApiRecord): PhraseBranch {
  return {
    name: branch.name,
    merged: branch.merged ?? null,
    state: branch.state ?? null,
  };
}

function normalizePhraseKey(key: PhraseKeyApiRecord): PhraseKey {
  return {
    id: key.id,
    name: key.name,
    description: key.description ?? null,
    nameHash: key.name_hash ?? null,
    plural: key.plural ?? false,
    useOrdinalRules: key.use_ordinal_rules ?? false,
    tags: key.tags ?? [],
    dataType: key.data_type ?? null,
    customMetadata: key.custom_metadata ?? {},
    createdAt: key.created_at ?? null,
    updatedAt: key.updated_at ?? null,
  };
}

function normalizePhraseTranslation(translation: PhraseTranslationApiRecord): PhraseTranslation {
  const keyId = translation.key_id || translation.key?.id || "";
  const localeName =
    translation.locale_name?.trim() ||
    translation.locale?.name?.trim() ||
    translation.locale?.code?.trim() ||
    "";

  return {
    id: translation.id,
    keyId,
    localeName,
    content: translation.content ?? null,
    state: translation.state ?? null,
    unverified: translation.unverified ?? false,
    excluded: translation.excluded ?? false,
    pluralSuffix: translation.plural_suffix ?? null,
    createdAt: translation.created_at ?? null,
    updatedAt: translation.updated_at ?? null,
  };
}

function normalizePhraseUpload(upload: PhraseUploadApiRecord): PhraseUpload {
  return {
    id: upload.id,
    filename: upload.filename,
    format: upload.format ?? null,
    state: upload.state ?? null,
    tag: upload.tag ?? null,
    tags: upload.tags ?? [],
    url: upload.url ?? null,
    createdAt: upload.created_at ?? null,
    updatedAt: upload.updated_at ?? null,
  };
}

function normalizePhraseUserPreview(user: PhraseUserPreviewApiRecord | null | undefined) {
  if (!user?.id) {
    return null;
  }

  return {
    id: user.id,
    username: user.username ?? null,
    name: user.name ?? null,
  };
}

function normalizePhraseLocalePreview(locale: PhraseLocalePreviewApiRecord) {
  return {
    id: locale.id,
    name: locale.name,
    code: locale.code ?? null,
  };
}

function normalizePhraseKeyComment(comment: PhraseKeyCommentApiRecord): PhraseKeyComment {
  return {
    id: comment.id,
    message: comment.message?.trim() || "",
    hasReplies: comment.has_replies ?? false,
    user: normalizePhraseUserPreview(comment.user),
    createdAt: comment.created_at ?? null,
    updatedAt: comment.updated_at ?? null,
    locales: (comment.locales ?? []).map(normalizePhraseLocalePreview),
  };
}
