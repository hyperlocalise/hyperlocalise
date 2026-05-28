/**
 * Smartling API client for authentication and project discovery.
 *
 * This module intentionally implements only the endpoints required for
 * credential validation, TMS connector scans, terminology resources, and job-scoped content pull/write-back.
 */

import { parseSmartlingCredentials, type SmartlingCredentials } from "./smartling-credentials";
import { uniqueLocales } from "./smartling-locales";
import { requireProviderBaseUrl } from "../provider-url-safety";

const DEFAULT_AUTH_BASE_URL = "https://api.smartling.com/auth-api/v2";
const DEFAULT_ACCOUNTS_BASE_URL = "https://api.smartling.com/accounts-api/v2";
const DEFAULT_PROJECTS_BASE_URL = "https://api.smartling.com/projects-api/v2";
const DEFAULT_FILES_BASE_URL = "https://api.smartling.com/files-api/v2";
const DEFAULT_STRINGS_BASE_URL = "https://api.smartling.com/strings-api/v2";
const DEFAULT_JOBS_BASE_URL = "https://api.smartling.com/jobs-api/v3";
const DEFAULT_GLOSSARY_BASE_URL = "https://api.smartling.com/glossary-api/v2";
const DEFAULT_GLOSSARY_V3_BASE_URL = "https://api.smartling.com/glossary-api/v3";
const DEFAULT_TM_BASE_URL = "https://api.smartling.com/translation-memory-api/v2";
const DEFAULT_ISSUES_BASE_URL = "https://api.smartling.com/issues-api/v2";
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DEFAULT_PAGE_SIZE = 500;

export const SMARTLING_TM_SYNC_MAX_ENTRIES = 2_000;

export interface SmartlingApiClientOptions {
  credentials: SmartlingCredentials | string;
  authBaseUrl?: string;
  accountsBaseUrl?: string;
  projectsBaseUrl?: string;
  filesBaseUrl?: string;
  stringsBaseUrl?: string;
  jobsBaseUrl?: string;
  glossaryBaseUrl?: string;
  glossaryV3BaseUrl?: string;
  tmBaseUrl?: string;
  issuesBaseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface SmartlingGlossarySummary {
  glossaryUid: string;
  name: string;
  description: string | null;
  localeIds: string[];
}

export interface SmartlingGlossaryEntry {
  entryUid: string;
  term: string;
  definition: string | null;
  partOfSpeech: string | null;
  translations: SmartlingGlossaryTranslation[];
}

export interface SmartlingGlossaryTranslation {
  localeId: string;
  term: string;
  notes: string | null;
  definition: string | null;
}

export interface SmartlingTranslationMemorySummary {
  translationMemoryUid: string;
  name: string;
  description: string | null;
  sourceLocaleId: string | null;
  localeIds: string[];
}

export interface SmartlingTranslationMemoryEntry {
  entryUid: string;
  sourceText: string;
  sourceLocaleId: string;
  translations: SmartlingTranslationMemoryTranslation[];
}

export interface SmartlingTranslationMemoryTranslation {
  targetLocaleId: string;
  translationText: string;
}

export interface SmartlingAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

export interface SmartlingAccountProjectSummary {
  accountUid: string;
  projectId: string;
  projectName: string;
  sourceLocaleId: string;
  archived: boolean;
  projectTypeCode: string | null;
}

export interface SmartlingTargetLocale {
  localeId: string;
  description: string | null;
  enabled: boolean;
}

export interface SmartlingProjectDetails {
  accountUid: string;
  projectId: string;
  projectName: string;
  sourceLocaleId: string;
  archived: boolean;
  projectTypeCode: string | null;
  targetLocales: SmartlingTargetLocale[];
}

export interface SmartlingFileSummary {
  fileUri: string;
  fileType?: string | null;
  lastUploaded?: string | null;
  hasInstructions?: boolean;
  directives?: Record<string, unknown>;
}

export interface SmartlingFileLocaleStatus {
  localeId: string;
  completedStringCount?: number;
  authorizedStringCount?: number;
  lastCompleted?: string | null;
  lastAuthorized?: string | null;
}

export interface SmartlingSourceString {
  hashcode: string;
  stringText?: string | null;
  fileUri?: string | null;
  variant?: string | null;
  stringVariantUid?: string | null;
  createdDate?: string | null;
  modifiedDate?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SmartlingJobSummary {
  translationJobUid: string;
  jobName: string;
  jobStatus: string;
  description?: string | null;
  dueDate?: string | null;
  targetLocaleIds: string[];
  createdDate?: string | null;
  modifiedDate?: string | null;
  referenceNumber?: string | null;
  jobNumber?: string | null;
}

export type SmartlingJobDetails = SmartlingJobSummary;

export interface SmartlingJobFile {
  fileUri: string;
  fileName?: string | null;
}

export interface SmartlingLocaleTranslation {
  hashcode?: string | null;
  stringText?: string | null;
  parsedStringText?: string | null;
  translation?: string | null;
  instruction?: string | null;
  fileUri?: string | null;
  targetLocaleId?: string | null;
  authorized?: boolean | null;
  published?: boolean | null;
  publishStatus?: string | null;
}

export interface SmartlingUpsertTranslationItem {
  hashcode: string;
  translation: string;
  stringText?: string | null;
  instruction?: string | null;
}

export interface SmartlingJobProgress {
  totalWordCount?: number;
  completedWordCount?: number;
  percentComplete?: number;
}

export interface SmartlingAsyncProcessStatus {
  processUid?: string;
  processState?: string;
  processStatus?: string;
  percentComplete?: number;
}

export interface SmartlingIssueStringReference {
  hashcode: string;
  localeId: string;
}

export interface SmartlingIssue {
  issueUid: string;
  issueText?: string | null;
  issueTypeCode?: string | null;
  issueSubTypeCode?: string | null;
  issueSeverityLevelCode?: string | null;
  issueStateCode?: string | null;
  string?: SmartlingIssueStringReference | null;
}

export interface SmartlingIssueTemplate {
  string: SmartlingIssueStringReference;
  issueTypeCode: string;
  issueSubTypeCode?: string | null;
  issueText: string;
  issueSeverityLevelCode: string;
}

export interface SmartlingIssuesListFilter {
  stringFilter?: {
    hashcodes?: string[];
    localeIds?: string[];
  };
  issueStateCodes?: string[];
  offset?: number;
  limit?: number;
}

type SmartlingEnvelope<T> = {
  response: {
    code: string;
    data: T;
    errors?: Array<{ key?: string; message?: string }>;
  };
};

type SmartlingAuthResponseData = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  tokenType?: string;
};

type SmartlingAccountProjectListData = {
  items: Array<{
    accountUid: string;
    projectId: string;
    projectName: string;
    sourceLocaleId: string;
    archived?: boolean;
    projectTypeCode?: string;
  }>;
  totalCount?: number;
};

export class SmartlingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "SmartlingApiError";
  }
}

export class SmartlingApiClient {
  private readonly credentials: SmartlingCredentials;
  private readonly authBaseUrl: string;
  private readonly accountsBaseUrl: string;
  private readonly projectsBaseUrl: string;
  private readonly filesBaseUrl: string;
  private readonly stringsBaseUrl: string;
  private readonly jobsBaseUrl: string;
  private readonly glossaryBaseUrl: string;
  private readonly glossaryV3BaseUrl: string;
  private readonly tmBaseUrl: string;
  private readonly issuesBaseUrl: string;
  private readonly fetchFn: typeof fetch;
  private tokens: SmartlingAuthTokens | null = null;

  constructor(options: SmartlingApiClientOptions) {
    this.credentials =
      typeof options.credentials === "string"
        ? parseSmartlingCredentials(options.credentials)
        : options.credentials;
    this.authBaseUrl = normalizeServiceBaseUrl(options.authBaseUrl, DEFAULT_AUTH_BASE_URL);
    this.accountsBaseUrl = normalizeServiceBaseUrl(
      options.accountsBaseUrl ?? deriveServiceBaseUrl(this.authBaseUrl, "accounts"),
      DEFAULT_ACCOUNTS_BASE_URL,
    );
    this.projectsBaseUrl = normalizeServiceBaseUrl(
      options.projectsBaseUrl ?? deriveServiceBaseUrl(this.authBaseUrl, "projects"),
      DEFAULT_PROJECTS_BASE_URL,
    );
    this.filesBaseUrl = normalizeServiceBaseUrl(
      options.filesBaseUrl ?? deriveServiceBaseUrl(this.authBaseUrl, "files"),
      DEFAULT_FILES_BASE_URL,
    );
    this.stringsBaseUrl = normalizeServiceBaseUrl(
      options.stringsBaseUrl ?? deriveServiceBaseUrl(this.authBaseUrl, "strings"),
      DEFAULT_STRINGS_BASE_URL,
    );
    this.jobsBaseUrl = normalizeServiceBaseUrl(
      options.jobsBaseUrl ?? deriveServiceBaseUrl(this.authBaseUrl, "jobs"),
      DEFAULT_JOBS_BASE_URL,
    );
    this.glossaryBaseUrl = normalizeServiceBaseUrl(
      options.glossaryBaseUrl ?? deriveServiceBaseUrl(this.authBaseUrl, "glossary"),
      DEFAULT_GLOSSARY_BASE_URL,
    );
    this.glossaryV3BaseUrl = normalizeServiceBaseUrl(
      options.glossaryV3BaseUrl ?? deriveServiceBaseUrl(this.authBaseUrl, "glossary-v3"),
      DEFAULT_GLOSSARY_V3_BASE_URL,
    );
    this.tmBaseUrl = normalizeServiceBaseUrl(
      options.tmBaseUrl ?? deriveServiceBaseUrl(this.authBaseUrl, "translation-memory"),
      DEFAULT_TM_BASE_URL,
    );
    this.issuesBaseUrl = normalizeServiceBaseUrl(
      options.issuesBaseUrl ?? deriveServiceBaseUrl(this.authBaseUrl, "issues"),
      DEFAULT_ISSUES_BASE_URL,
    );
    this.fetchFn = options.fetchFn ?? fetch;
  }

  get credentialScope() {
    return {
      accountUid: this.credentials.accountUid ?? null,
      projectId: this.credentials.projectId ?? null,
    };
  }

  async authenticate(): Promise<SmartlingAuthTokens> {
    const data = await this.post<SmartlingAuthResponseData>(
      `${this.authBaseUrl}/authenticate`,
      "",
      {
        userIdentifier: this.credentials.userIdentifier,
        userSecret: this.credentials.userSecret,
      },
    );

    this.tokens = toAuthTokens(data);
    return this.tokens;
  }

  async refreshAccessToken(refreshToken: string): Promise<SmartlingAuthTokens> {
    const data = await this.post<SmartlingAuthResponseData>(
      `${this.authBaseUrl}/authenticate/refresh`,
      "",
      { refreshToken },
    );

    this.tokens = toAuthTokens(data);
    return this.tokens;
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokens?.accessToken) {
      if (!this.tokens.expiresAt || this.tokens.expiresAt - TOKEN_REFRESH_SKEW_MS > now) {
        return this.tokens.accessToken;
      }

      if (this.tokens.refreshToken) {
        const refreshed = await this.refreshAccessToken(this.tokens.refreshToken);
        return refreshed.accessToken;
      }
    }

    const authenticated = await this.authenticate();
    return authenticated.accessToken;
  }

  async listAccountProjects(accountUid: string): Promise<SmartlingAccountProjectSummary[]> {
    const token = await this.getAccessToken();
    const projects: SmartlingAccountProjectSummary[] = [];
    let offset = 0;

    while (true) {
      const params = new URLSearchParams({
        limit: String(DEFAULT_PAGE_SIZE),
        offset: String(offset),
      });
      const data = await this.get<SmartlingAccountProjectListData>(
        `${this.accountsBaseUrl}/accounts/${encodeURIComponent(accountUid)}/projects?${params.toString()}`,
        token,
      );

      const page = (data.items ?? []).map((item) => ({
        accountUid: item.accountUid,
        projectId: item.projectId,
        projectName: item.projectName,
        sourceLocaleId: item.sourceLocaleId,
        archived: item.archived ?? false,
        projectTypeCode: item.projectTypeCode ?? null,
      }));
      projects.push(...page);

      offset += page.length;
      if (page.length === 0) {
        break;
      }

      const totalCount = data.totalCount;
      if (typeof totalCount === "number") {
        if (offset >= totalCount) {
          break;
        }
      } else if (page.length < DEFAULT_PAGE_SIZE) {
        break;
      }
    }

    return projects;
  }

  async getProjectDetails(projectId: string): Promise<SmartlingProjectDetails> {
    const token = await this.getAccessToken();
    const data = await this.get<SmartlingProjectDetails>(
      `${this.projectsBaseUrl}/projects/${encodeURIComponent(projectId)}`,
      token,
    );

    return {
      accountUid: data.accountUid,
      projectId: data.projectId,
      projectName: data.projectName,
      sourceLocaleId: data.sourceLocaleId,
      archived: data.archived ?? false,
      projectTypeCode: data.projectTypeCode ?? null,
      targetLocales: (data.targetLocales ?? []).map((locale) => ({
        localeId: locale.localeId,
        description: locale.description ?? null,
        enabled: locale.enabled ?? true,
      })),
    };
  }

  async listDiscoverableProjects(): Promise<SmartlingProjectDetails[]> {
    if (this.credentials.projectId) {
      return [await this.getProjectDetails(this.credentials.projectId)];
    }

    const accountUid = this.credentials.accountUid;
    if (!accountUid) {
      throw new Error("smartling_account_uid_required");
    }

    const summaries = await this.listAccountProjects(accountUid);
    return summaries
      .filter((project) => !project.archived)
      .map((summary) => ({
        accountUid: summary.accountUid,
        projectId: summary.projectId,
        projectName: summary.projectName,
        sourceLocaleId: summary.sourceLocaleId,
        archived: summary.archived,
        projectTypeCode: summary.projectTypeCode,
        targetLocales: [],
      }));
  }

  async listProjectFiles(projectId: string): Promise<SmartlingFileSummary[]> {
    const files: SmartlingFileSummary[] = [];

    await paginateSmartlingList({
      fetchPage: async (offset, limit) => {
        const token = await this.getAccessToken();
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        const data = await this.get<{ items?: SmartlingFileSummary[]; totalCount?: number }>(
          `${this.filesBaseUrl}/projects/${encodeURIComponent(projectId)}/files/list?${params.toString()}`,
          token,
        );
        return {
          items: (data.items ?? []).map(normalizeSmartlingFileSummary),
          totalCount: data.totalCount,
        };
      },
      onPage: (page) => files.push(...page),
    });

    return files;
  }

  async getFileStatusForAllLocales(
    projectId: string,
    fileUri: string,
  ): Promise<SmartlingFileLocaleStatus[]> {
    const token = await this.getAccessToken();
    const params = new URLSearchParams({ fileUri });
    const data = await this.get<{ items?: SmartlingFileLocaleStatus[] }>(
      `${this.filesBaseUrl}/projects/${encodeURIComponent(projectId)}/file/status?${params.toString()}`,
      token,
    );

    return (data.items ?? []).map((item) => ({
      localeId: item.localeId,
      completedStringCount: item.completedStringCount,
      authorizedStringCount: item.authorizedStringCount,
      lastCompleted: item.lastCompleted ?? null,
      lastAuthorized: item.lastAuthorized ?? null,
    }));
  }

  async listSourceStrings(
    projectId: string,
    options?: { fileUri?: string },
  ): Promise<SmartlingSourceString[]> {
    const strings: SmartlingSourceString[] = [];

    await paginateSmartlingList({
      fetchPage: async (offset, limit) => {
        const token = await this.getAccessToken();
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        if (options?.fileUri) {
          params.set("fileUri", options.fileUri);
        }
        const data = await this.get<{ items?: SmartlingSourceString[]; totalCount?: number }>(
          `${this.stringsBaseUrl}/projects/${encodeURIComponent(projectId)}/source-strings?${params.toString()}`,
          token,
        );
        return {
          items: (data.items ?? []).map(normalizeSmartlingSourceString),
          totalCount: data.totalCount,
        };
      },
      onPage: (page) => strings.push(...page),
    });

    return strings;
  }

  async listJobs(projectId: string): Promise<SmartlingJobSummary[]> {
    const jobs: SmartlingJobSummary[] = [];

    await paginateSmartlingList({
      fetchPage: async (offset, limit) => {
        const token = await this.getAccessToken();
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        const data = await this.get<{ items?: SmartlingJobSummary[]; totalCount?: number }>(
          `${this.jobsBaseUrl}/projects/${encodeURIComponent(projectId)}/jobs?${params.toString()}`,
          token,
        );
        return {
          items: (data.items ?? []).map(normalizeSmartlingJobSummary),
          totalCount: data.totalCount,
        };
      },
      onPage: (page) => jobs.push(...page),
    });

    return jobs;
  }

  async getJob(projectId: string, translationJobUid: string): Promise<SmartlingJobDetails> {
    const token = await this.getAccessToken();
    const data = await this.get<SmartlingJobDetails>(
      `${this.jobsBaseUrl}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(translationJobUid)}`,
      token,
    );
    return normalizeSmartlingJobSummary(data);
  }

  async listJobFiles(projectId: string, translationJobUid: string): Promise<SmartlingJobFile[]> {
    const files: SmartlingJobFile[] = [];

    await paginateSmartlingList({
      fetchPage: async (offset, limit) => {
        const token = await this.getAccessToken();
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        const data = await this.get<{ items?: SmartlingJobFile[]; totalCount?: number }>(
          `${this.jobsBaseUrl}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(translationJobUid)}/files?${params.toString()}`,
          token,
        );
        return {
          items: (data.items ?? []).map((item) => ({
            fileUri: item.fileUri,
            fileName: item.fileName ?? null,
          })),
          totalCount: data.totalCount,
        };
      },
      onPage: (page) => files.push(...page),
    });

    return files;
  }

  async listLocaleTranslations(
    projectId: string,
    localeId: string,
    options?: { fileUri?: string },
  ): Promise<SmartlingLocaleTranslation[]> {
    const translations: SmartlingLocaleTranslation[] = [];

    await paginateSmartlingList({
      fetchPage: async (offset, limit) => {
        const token = await this.getAccessToken();
        const params = new URLSearchParams({
          targetLocaleId: localeId,
          limit: String(limit),
          offset: String(offset),
        });
        if (options?.fileUri) {
          params.set("fileUri", options.fileUri);
        }
        const data = await this.get<{ items?: SmartlingLocaleTranslation[]; totalCount?: number }>(
          `${this.stringsBaseUrl}/projects/${encodeURIComponent(projectId)}/translations?${params.toString()}`,
          token,
        );
        return {
          items: (data.items ?? []).map(normalizeSmartlingLocaleTranslation),
          totalCount: data.totalCount,
        };
      },
      onPage: (page) => translations.push(...page),
    });

    return translations;
  }

  async upsertLocaleTranslations(
    projectId: string,
    localeId: string,
    items: SmartlingUpsertTranslationItem[],
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const token = await this.getAccessToken();
    await this.put(
      `${this.stringsBaseUrl}/projects/${encodeURIComponent(projectId)}/locales/${encodeURIComponent(localeId)}/translations`,
      token,
      { items },
    );
  }

  async authorizeJob(
    projectId: string,
    translationJobUid: string,
    targetLocaleIds: string[],
  ): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken();
    return this.post<Record<string, unknown>>(
      `${this.jobsBaseUrl}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(translationJobUid)}/authorize`,
      token,
      { targetLocaleIds },
    );
  }

  async getJobProgress(
    projectId: string,
    translationJobUid: string,
    targetLocaleId?: string,
  ): Promise<SmartlingJobProgress> {
    const token = await this.getAccessToken();
    const params = new URLSearchParams();
    if (targetLocaleId) {
      params.set("targetLocaleId", targetLocaleId);
    }
    const query = params.toString();
    const url = `${this.jobsBaseUrl}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(translationJobUid)}/progress${query ? `?${query}` : ""}`;
    const data = await this.get<{
      progress?: SmartlingJobProgress;
      totalWordCount?: number;
      completedWordCount?: number;
      percentComplete?: number;
    }>(url, token);

    if (data.progress) {
      return data.progress;
    }

    return {
      totalWordCount: data.totalWordCount,
      completedWordCount: data.completedWordCount,
      percentComplete: data.percentComplete,
    };
  }

  async getAsyncProcessStatus(
    projectId: string,
    processUid: string,
  ): Promise<SmartlingAsyncProcessStatus> {
    const token = await this.getAccessToken();
    return this.get<SmartlingAsyncProcessStatus>(
      `${this.filesBaseUrl}/projects/${encodeURIComponent(projectId)}/processes/${encodeURIComponent(processUid)}`,
      token,
    );
  }

  async listAccountGlossaries(accountUid: string): Promise<SmartlingGlossarySummary[]> {
    const glossaries: SmartlingGlossarySummary[] = [];

    await paginateSmartlingList({
      fetchPage: async (offset, limit) => {
        const token = await this.getAccessToken();
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        const data = await this.get<{
          items?: Array<Record<string, unknown>>;
          totalCount?: number;
        }>(
          `${this.glossaryBaseUrl}/accounts/${encodeURIComponent(accountUid)}/glossaries?${params.toString()}`,
          token,
        );
        return {
          items: (data.items ?? []).map(normalizeSmartlingGlossarySummary),
          totalCount: data.totalCount,
        };
      },
      onPage: (page) => glossaries.push(...page),
    });

    return glossaries;
  }

  async listGlossaryEntries(
    accountUid: string,
    glossaryUid: string,
  ): Promise<SmartlingGlossaryEntry[]> {
    const entries: SmartlingGlossaryEntry[] = [];

    await paginateSmartlingList({
      fetchPage: async (offset, limit) => {
        const token = await this.getAccessToken();
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        const data = await this.get<{
          items?: Array<Record<string, unknown>>;
          totalCount?: number;
        }>(
          `${this.glossaryBaseUrl}/accounts/${encodeURIComponent(accountUid)}/glossaries/${encodeURIComponent(glossaryUid)}/entries?${params.toString()}`,
          token,
        );
        return {
          items: (data.items ?? []).map(normalizeSmartlingGlossaryEntry),
          totalCount: data.totalCount,
        };
      },
      onPage: (page) => entries.push(...page),
    });

    return entries;
  }

  async searchGlossaryEntries(input: {
    accountUid: string;
    glossaryUid: string;
    query: string;
  }): Promise<SmartlingGlossaryEntry[]> {
    const query = input.query.trim();
    if (!query) {
      return [];
    }

    const token = await this.getAccessToken();
    try {
      const data = await this.post<{ items?: Array<Record<string, unknown>> }>(
        `${this.glossaryV3BaseUrl}/accounts/${encodeURIComponent(input.accountUid)}/glossaries/${encodeURIComponent(input.glossaryUid)}/entries/search`,
        token,
        { query },
      );
      return (data.items ?? []).map(normalizeSmartlingGlossaryEntry);
    } catch (error) {
      if (!(error instanceof SmartlingApiError) || (error.status !== 404 && error.status !== 405)) {
        throw error;
      }
    }

    const entries = await this.listGlossaryEntries(input.accountUid, input.glossaryUid);
    return entries.filter((entry) => matchesSmartlingGlossaryQuery(query, entry));
  }

  async listAccountTranslationMemories(
    accountUid: string,
  ): Promise<SmartlingTranslationMemorySummary[]> {
    const memories: SmartlingTranslationMemorySummary[] = [];

    await paginateSmartlingList({
      fetchPage: async (offset, limit) => {
        const token = await this.getAccessToken();
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        const data = await this.get<{
          items?: Array<Record<string, unknown>>;
          totalCount?: number;
        }>(
          `${this.tmBaseUrl}/accounts/${encodeURIComponent(accountUid)}/translation-memories?${params.toString()}`,
          token,
        );
        return {
          items: (data.items ?? []).map(normalizeSmartlingTranslationMemorySummary),
          totalCount: data.totalCount,
        };
      },
      onPage: (page) => memories.push(...page),
    });

    return memories;
  }

  async listTranslationMemoryEntries(
    accountUid: string,
    translationMemoryUid: string,
    options: {
      sourceLocaleId: string;
      targetLocaleIds: string[];
      shouldStop?: (page: SmartlingTranslationMemoryEntry[]) => boolean;
    },
  ): Promise<SmartlingTranslationMemoryEntry[]> {
    const entries: SmartlingTranslationMemoryEntry[] = [];
    const targetLocaleIds = uniqueLocales(options.targetLocaleIds);
    const targetLocaleParam = targetLocaleIds.length > 0 ? targetLocaleIds.join(",") : "";

    await paginateSmartlingList({
      fetchPage: async (offset, limit) => {
        const token = await this.getAccessToken();
        const params = new URLSearchParams({
          sourceLocaleId: options.sourceLocaleId,
          limit: String(limit),
          offset: String(offset),
        });
        if (targetLocaleParam) {
          params.set("targetLocaleIds", targetLocaleParam);
        }
        const data = await this.get<{
          items?: Array<Record<string, unknown>>;
          totalCount?: number;
        }>(
          `${this.tmBaseUrl}/accounts/${encodeURIComponent(accountUid)}/translation-memories/${encodeURIComponent(translationMemoryUid)}/entries?${params.toString()}`,
          token,
        );
        return {
          items: (data.items ?? []).map(normalizeSmartlingTranslationMemoryEntry),
          totalCount: data.totalCount,
        };
      },
      onPage: (page) => {
        entries.push(...page);
        if (options.shouldStop?.(page)) {
          return true;
        }
        return false;
      },
    });

    return entries;
  }

  async listIssues(
    projectId: string,
    filter: SmartlingIssuesListFilter,
  ): Promise<SmartlingIssue[]> {
    const token = await this.getAccessToken();
    const issues: SmartlingIssue[] = [];
    let offset = filter.offset ?? 0;
    const limit = filter.limit ?? DEFAULT_PAGE_SIZE;

    while (true) {
      const data = await this.post<{ items?: SmartlingIssue[]; totalCount?: number }>(
        `${this.issuesBaseUrl}/projects/${encodeURIComponent(projectId)}/issues/list`,
        token,
        {
          ...filter,
          offset,
          limit,
        },
      );

      const page = data.items ?? [];
      issues.push(...page);
      offset += page.length;

      if (page.length === 0) {
        break;
      }

      const totalCount = data.totalCount;
      if (typeof totalCount === "number") {
        if (offset >= totalCount) {
          break;
        }
      } else if (page.length < limit) {
        break;
      }
    }

    return issues;
  }

  async createIssue(projectId: string, template: SmartlingIssueTemplate): Promise<SmartlingIssue> {
    const token = await this.getAccessToken();
    return this.post<SmartlingIssue>(
      `${this.issuesBaseUrl}/projects/${encodeURIComponent(projectId)}/issues`,
      token,
      template,
    );
  }

  private async get<T>(url: string, token: string): Promise<T> {
    const response = await this.fetchFn(url, {
      method: "GET",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return parseSmartlingResponse<T>(response, url);
  }

  private async post<T>(url: string, token: string, payload: unknown): Promise<T> {
    const response = await this.fetchFn(url, {
      method: "POST",
      redirect: "error",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return parseSmartlingResponse<T>(response, url);
  }

  private async put<T>(url: string, token: string, payload: unknown): Promise<T> {
    const response = await this.fetchFn(url, {
      method: "PUT",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return parseSmartlingResponse<T>(response, url);
  }
}

export function deriveServiceBaseUrl(
  authBaseUrl: string,
  service:
    | "accounts"
    | "projects"
    | "files"
    | "strings"
    | "jobs"
    | "glossary"
    | "glossary-v3"
    | "translation-memory"
    | "issues",
) {
  const normalized = normalizeServiceBaseUrl(authBaseUrl, authBaseUrl);
  if (normalized.includes("/auth-api/")) {
    const version = service === "jobs" || service === "glossary-v3" ? "v3" : "v2";
    const apiName =
      service === "glossary"
        ? "glossary"
        : service === "glossary-v3"
          ? "glossary"
          : service === "translation-memory"
            ? "translation-memory"
            : service;
    return normalized.replace(/\/auth-api\/v\d+/, `/${apiName}-api/${version}`);
  }

  switch (service) {
    case "accounts":
      return DEFAULT_ACCOUNTS_BASE_URL;
    case "projects":
      return DEFAULT_PROJECTS_BASE_URL;
    case "files":
      return DEFAULT_FILES_BASE_URL;
    case "strings":
      return DEFAULT_STRINGS_BASE_URL;
    case "jobs":
      return DEFAULT_JOBS_BASE_URL;
    case "glossary":
      return DEFAULT_GLOSSARY_BASE_URL;
    case "glossary-v3":
      return DEFAULT_GLOSSARY_V3_BASE_URL;
    case "translation-memory":
      return DEFAULT_TM_BASE_URL;
    case "issues":
      return DEFAULT_ISSUES_BASE_URL;
  }
}

export function normalizeServiceBaseUrl(baseUrl: string | undefined, fallback: string) {
  return requireProviderBaseUrl(baseUrl, fallback, "Smartling");
}

export function classifySmartlingHttpError(status: number, responseBody: unknown) {
  const responseCode = readSmartlingResponseCode(responseBody);
  const combinedMessage = collectSmartlingErrorMessage(responseBody).toLowerCase();

  if (status === 401 || responseCode === "AUTHENTICATION_ERROR") {
    return {
      errorCode: "smartling_auth_invalid",
      message: "Smartling rejected the stored credential.",
    };
  }

  if (
    status === 402 ||
    status === 403 ||
    responseCode === "FEATURE_NOT_AVAILABLE" ||
    responseCode === "NOT_AUTHORIZED" ||
    combinedMessage.includes("not available") ||
    combinedMessage.includes("not enabled") ||
    combinedMessage.includes("subscription") ||
    combinedMessage.includes("paid plan") ||
    combinedMessage.includes("api access")
  ) {
    return {
      errorCode: "smartling_api_unavailable",
      message:
        "Smartling rejected the request because this API or account capability is unavailable on the current plan.",
    };
  }

  if (status === 429 || responseCode === "TOO_MANY_REQUESTS") {
    return {
      errorCode: "smartling_rate_limited",
      message: "Smartling rate limited the request.",
    };
  }

  if (status >= 500) {
    return {
      errorCode: "smartling_unavailable",
      message: "Smartling is temporarily unavailable.",
    };
  }

  return {
    errorCode: "smartling_request_failed",
    message: `Smartling returned HTTP ${status}.`,
  };
}

async function parseSmartlingResponse<T>(response: Response, url: string): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text().catch(() => null);
  }

  if (!response.ok) {
    const classified = classifySmartlingHttpError(response.status, body);
    throw new SmartlingApiError(classified.message, response.status, classified.errorCode, body);
  }

  const envelope = body as SmartlingEnvelope<T>;
  if (!envelope?.response) {
    throw new SmartlingApiError(
      `Smartling API returned an unexpected response for ${url}`,
      response.status,
      "smartling_response_invalid",
      body,
    );
  }

  if (envelope.response.code !== "SUCCESS") {
    const classified = classifySmartlingHttpError(response.status, body);
    throw new SmartlingApiError(classified.message, response.status, classified.errorCode, body);
  }

  return envelope.response.data;
}

function toAuthTokens(data: SmartlingAuthResponseData): SmartlingAuthTokens {
  const expiresAt =
    typeof data.expiresIn === "number" && data.expiresIn > 0
      ? Date.now() + data.expiresIn * 1000
      : null;

  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? null,
    expiresAt,
  };
}

function readSmartlingResponseCode(responseBody: unknown) {
  if (!responseBody || typeof responseBody !== "object") return null;
  const response = (responseBody as SmartlingEnvelope<unknown>).response;
  return typeof response?.code === "string" ? response.code : null;
}

function collectSmartlingErrorMessage(responseBody: unknown) {
  if (!responseBody || typeof responseBody !== "object") {
    return typeof responseBody === "string" ? responseBody : "";
  }

  const response = (responseBody as SmartlingEnvelope<unknown>).response;
  const errors = Array.isArray(response?.errors) ? response.errors : [];
  return errors
    .map((error) => (typeof error?.message === "string" ? error.message : ""))
    .filter(Boolean)
    .join(" ");
}

async function paginateSmartlingList<T>(input: {
  fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; totalCount?: number }>;
  onPage: (items: T[]) => unknown;
}) {
  let offset = 0;

  while (true) {
    const page = await input.fetchPage(offset, DEFAULT_PAGE_SIZE);
    const shouldStop = input.onPage(page.items);
    offset += page.items.length;

    if (shouldStop === true) {
      break;
    }

    if (page.items.length === 0) {
      break;
    }

    if (typeof page.totalCount === "number") {
      if (offset >= page.totalCount) {
        break;
      }
    } else if (page.items.length < DEFAULT_PAGE_SIZE) {
      break;
    }
  }
}

function readSmartlingUid(item: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readSmartlingString(item: Record<string, unknown>, key: string) {
  const value = item[key];
  return typeof value === "string" ? value : null;
}

function readSmartlingLocaleIds(item: Record<string, unknown>) {
  const localeIds = item.localeIds;
  if (!Array.isArray(localeIds)) {
    return [];
  }

  return uniqueLocales(localeIds.filter((locale): locale is string => typeof locale === "string"));
}

function normalizeSmartlingGlossarySummary(
  item: Record<string, unknown>,
): SmartlingGlossarySummary {
  const glossaryUid = readSmartlingUid(item, "glossaryUid", "uid", "glossaryUID");
  const name = readSmartlingString(item, "name") ?? glossaryUid;
  return {
    glossaryUid,
    name,
    description: readSmartlingString(item, "description"),
    localeIds: readSmartlingLocaleIds(item),
  };
}

function normalizeSmartlingGlossaryEntry(item: Record<string, unknown>): SmartlingGlossaryEntry {
  const translationsRaw = item.translations;
  const translations = Array.isArray(translationsRaw)
    ? translationsRaw
        .filter(
          (translation): translation is Record<string, unknown> =>
            typeof translation === "object" && translation !== null,
        )
        .map(normalizeSmartlingGlossaryTranslation)
    : [];

  return {
    entryUid: readSmartlingUid(item, "entryUid", "entryUID", "uid"),
    term: readSmartlingString(item, "term") ?? "",
    definition: readSmartlingString(item, "definition"),
    partOfSpeech: readSmartlingString(item, "partOfSpeech"),
    translations,
  };
}

function normalizeSmartlingGlossaryTranslation(
  item: Record<string, unknown>,
): SmartlingGlossaryTranslation {
  return {
    localeId: readSmartlingString(item, "localeId") ?? "",
    term: readSmartlingString(item, "term") ?? "",
    notes: readSmartlingString(item, "notes"),
    definition: readSmartlingString(item, "definition"),
  };
}

function normalizeSmartlingTranslationMemorySummary(
  item: Record<string, unknown>,
): SmartlingTranslationMemorySummary {
  const translationMemoryUid = readSmartlingUid(
    item,
    "translationMemoryUid",
    "uid",
    "translationMemoryUID",
  );
  const name = readSmartlingString(item, "name") ?? translationMemoryUid;
  return {
    translationMemoryUid,
    name,
    description: readSmartlingString(item, "description"),
    sourceLocaleId: readSmartlingString(item, "sourceLocaleId"),
    localeIds: readSmartlingLocaleIds(item),
  };
}

function normalizeSmartlingTranslationMemoryEntry(
  item: Record<string, unknown>,
): SmartlingTranslationMemoryEntry {
  const translationsRaw = item.translations;
  const translations = Array.isArray(translationsRaw)
    ? translationsRaw
        .filter(
          (translation): translation is Record<string, unknown> =>
            typeof translation === "object" && translation !== null,
        )
        .map(normalizeSmartlingTranslationMemoryTranslation)
    : [];

  return {
    entryUid: readSmartlingUid(item, "entryUid", "entryUID", "uid"),
    sourceText: readSmartlingString(item, "sourceText") ?? "",
    sourceLocaleId: readSmartlingString(item, "sourceLocaleId") ?? "",
    translations,
  };
}

function normalizeSmartlingTranslationMemoryTranslation(
  item: Record<string, unknown>,
): SmartlingTranslationMemoryTranslation {
  return {
    targetLocaleId:
      readSmartlingString(item, "targetLocaleId") ?? readSmartlingString(item, "localeId") ?? "",
    translationText: readSmartlingString(item, "translationText") ?? "",
  };
}

export function scoreSmartlingTextMatch(sourceText: string, candidateText: string) {
  const source = sourceText.trim();
  const candidate = candidateText.trim();
  if (!source || !candidate) {
    return 0;
  }

  if (source === candidate) {
    return 100;
  }

  const sourceLower = source.toLowerCase();
  const candidateLower = candidate.toLowerCase();
  if (sourceLower === candidateLower) {
    return 98;
  }

  if (candidateLower.includes(sourceLower) || sourceLower.includes(candidateLower)) {
    const ratio =
      Math.min(source.length, candidate.length) / Math.max(source.length, candidate.length);
    return Math.round(70 + ratio * 25);
  }

  const sourceTokens = tokenizeSmartlingText(sourceLower);
  const candidateTokens = tokenizeSmartlingText(candidateLower);
  if (sourceTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const overlap = sourceTokens.filter((token) => candidateTokens.includes(token)).length;
  if (overlap === 0) {
    return 0;
  }

  const coverage = overlap / Math.max(sourceTokens.length, candidateTokens.length);
  return Math.round(50 + coverage * 40);
}

function tokenizeSmartlingText(value: string) {
  return value.split(/\s+/).filter(Boolean);
}

function matchesSmartlingGlossaryQuery(query: string, entry: SmartlingGlossaryEntry) {
  return scoreSmartlingTextMatch(query, entry.term) >= 55;
}

export function pickSmartlingGlossaryTranslation(
  entry: SmartlingGlossaryEntry,
  targetLocale: string,
) {
  const normalizedTarget = targetLocale.trim().toLowerCase();
  for (const translation of entry.translations) {
    if (translation.localeId.trim().toLowerCase() !== normalizedTarget) {
      continue;
    }

    const targetTerm = translation.term.trim();
    if (targetTerm) {
      return targetTerm;
    }
  }

  return null;
}

function normalizeSmartlingFileSummary(item: SmartlingFileSummary): SmartlingFileSummary {
  return {
    fileUri: item.fileUri,
    fileType: item.fileType ?? null,
    lastUploaded: item.lastUploaded ?? null,
    hasInstructions: item.hasInstructions ?? false,
    directives: item.directives ?? undefined,
  };
}

function normalizeSmartlingSourceString(item: SmartlingSourceString): SmartlingSourceString {
  return {
    hashcode: item.hashcode,
    stringText: item.stringText ?? null,
    fileUri: item.fileUri ?? null,
    variant: item.variant ?? null,
    stringVariantUid: item.stringVariantUid ?? null,
    createdDate: item.createdDate ?? null,
    modifiedDate: item.modifiedDate ?? null,
    metadata: item.metadata ?? undefined,
  };
}

function normalizeSmartlingJobSummary(item: SmartlingJobSummary): SmartlingJobSummary {
  return {
    translationJobUid: item.translationJobUid,
    jobName: item.jobName,
    jobStatus: item.jobStatus,
    description: item.description ?? null,
    dueDate: item.dueDate ?? null,
    targetLocaleIds: item.targetLocaleIds ?? [],
    createdDate: item.createdDate ?? null,
    modifiedDate: item.modifiedDate ?? null,
    referenceNumber: item.referenceNumber ?? null,
    jobNumber: item.jobNumber ?? null,
  };
}

function normalizeSmartlingLocaleTranslation(
  item: SmartlingLocaleTranslation,
): SmartlingLocaleTranslation {
  return {
    hashcode: item.hashcode ?? null,
    stringText: item.stringText ?? null,
    parsedStringText: item.parsedStringText ?? null,
    translation: item.translation ?? null,
    instruction: item.instruction ?? null,
    fileUri: item.fileUri ?? null,
    targetLocaleId: item.targetLocaleId ?? null,
    authorized: item.authorized ?? null,
    published: item.published ?? null,
    publishStatus: item.publishStatus ?? null,
  };
}
