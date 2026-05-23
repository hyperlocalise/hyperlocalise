/**
 * Crowdin API v2 client for project discovery and metadata extraction.
 *
 * This module is intentionally thin: it only implements the endpoints
 * required for the TMS connector project-scan flow.  It does not
 * attempt to wrap the full Crowdin API surface.
 */

export interface CrowdinApiClientOptions {
  token: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface CrowdinProject {
  id: number;
  name: string;
  identifier: string;
  sourceLanguageId: string;
  targetLanguageIds: string[];
  webUrl: string;
  isSuspended: boolean;
}

export interface CrowdinBranch {
  id: number;
  name: string;
  title: string | null;
}

export interface CrowdinProjectWithDetails extends CrowdinProject {
  branches: CrowdinBranch[];
}

export interface CrowdinDirectory {
  id: number;
  branchId: number | null;
  directoryId: number | null;
  name: string;
  title: string | null;
  exportPattern: string | null;
  path: string;
}

export interface CrowdinFile {
  id: number;
  branchId: number | null;
  directoryId: number | null;
  name: string;
  title: string | null;
  type: string;
  path: string;
  status: string;
  revisionId: number;
}

export interface CrowdinFileRevision {
  id: number;
  fileId: number;
  projectId: number;
  info: {
    sourceLanguageId: string;
    addedStrings: number;
    removedStrings: number;
    updatedStrings: number;
  };
}

export interface CrowdinSourceString {
  id: number;
  projectId: number;
  fileId: number | null;
  branchId: number | null;
  directoryId: number | null;
  identifier: string;
  text: string | Record<string, string>;
  type: string;
  context: string | null;
  labelIds: number[] | null;
}

export interface CrowdinTask {
  id: number;
  projectId: number;
  type: number;
  status: string;
  title: string;
  description: string | null;
  languageId: string | null;
  fileIds: number[] | null;
  assignees: Array<{ id: number; username: string }> | null;
  deadline: string | null;
  webUrl: string;
}

export interface CrowdinLanguageProgress {
  languageId: string;
  words: {
    total: number;
    translated: number;
    approved: number;
  };
  phrases: {
    total: number;
    translated: number;
    approved: number;
  };
  translationProgress: number;
  approvalProgress: number;
}

export interface CrowdinTaskDetails extends CrowdinTask {
  sourceLanguageId?: string;
  targetLanguageId?: string;
  stringIds?: number[] | null;
}

export interface CrowdinLanguageTranslation {
  stringId: number;
  contentType: string;
  translationId: number | null;
  text: string | null;
  createdAt: string | null;
}

export interface CrowdinStringTranslation {
  id: number;
  text: string;
  createdAt: string;
}

export interface CrowdinTranslationApproval {
  id: number;
  translationId: number;
  stringId: number;
  languageId: string;
}

export interface CrowdinStorage {
  id: number;
  fileName: string;
}

export interface CrowdinUploadTranslationsResult {
  projectId: number;
  storageId: number;
  languageId: string;
  fileId: number;
}

export interface CrowdinTranslationBuild {
  id: number;
  projectId: number;
  status: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface CrowdinDownloadLink {
  url: string;
  expireIn?: string;
}

export interface CrowdinGlossary {
  id: number;
  name: string;
  description: string | null;
  languageId: string;
  languageIds: string[];
  terms: number;
  projectIds: number[];
  defaultProjectIds: number[];
  webUrl: string;
}

export interface CrowdinGlossaryTerm {
  id: number;
  glossaryId: number;
  languageId: string;
  text: string;
  description: string;
  partOfSpeech: string;
  status: string;
  conceptId: number;
  note: string;
}

export interface CrowdinTranslationMemory {
  id: number;
  name: string;
  description: string | null;
  languageId: string;
  languageIds: string[];
  segmentsCount: number;
  projectIds: number[];
  defaultProjectIds: number[];
  webUrl: string;
}

export interface CrowdinTranslationMemorySegmentRecord {
  id: number;
  languageId: string;
  text: string;
}

export interface CrowdinTranslationMemorySegment {
  id: number;
  records: CrowdinTranslationMemorySegmentRecord[];
}

export interface CrowdinGlossaryConcordanceResult {
  glossary: { id: number; name: string };
  concept: { id: number };
  sourceTerms: CrowdinGlossaryTerm[];
  targetTerms: CrowdinGlossaryTerm[];
}

export interface CrowdinTranslationMemoryConcordanceResult {
  tm: { id: number; name: string };
  recordId: number;
  source: string;
  target: string;
  relevant: number;
  substituted: string;
}

interface CrowdinListResponse<T> {
  data: Array<{ data: T }>;
  pagination?: {
    offset: number;
    limit: number;
  };
}

interface CrowdinGetResponse<T> {
  data: T;
}

export class CrowdinApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "CrowdinApiError";
  }
}

export class CrowdinApiClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: CrowdinApiClientOptions) {
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? "https://api.crowdin.com/api/v2").replace(/\/+$/g, "");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /**
   * List all accessible projects, following pagination automatically.
   */
  async listProjects(): Promise<CrowdinProject[]> {
    const projects: CrowdinProject[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const response = await this.get<CrowdinListResponse<CrowdinProject>>(
        `/projects?limit=${limit}&offset=${offset}`,
      );

      const page = response.data.map((item) => item.data);
      projects.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return projects;
  }

  /**
   * Get a single project by its numeric Crowdin identifier.
   */
  async getProject(projectId: number): Promise<CrowdinProject> {
    const response = await this.get<CrowdinGetResponse<CrowdinProject>>(`/projects/${projectId}`);
    return response.data;
  }

  /**
   * List branches for a given project, following pagination automatically.
   */
  async listBranches(projectId: number): Promise<CrowdinBranch[]> {
    const branches: CrowdinBranch[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const response = await this.get<CrowdinListResponse<CrowdinBranch>>(
        `/projects/${projectId}/branches?limit=${limit}&offset=${offset}`,
      );
      const page = response.data.map((item) => item.data);
      branches.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return branches;
  }

  /**
   * List directories for a given project, optionally filtered by branch.
   */
  async listDirectories(projectId: number, branchId?: number): Promise<CrowdinDirectory[]> {
    const directories: CrowdinDirectory[] = [];
    let offset = 0;
    const limit = 500;

    const branchParam = branchId !== undefined ? `&branchId=${branchId}` : "";

    while (true) {
      const response = await this.get<CrowdinListResponse<CrowdinDirectory>>(
        `/projects/${projectId}/directories?limit=${limit}&offset=${offset}${branchParam}`,
      );
      const page = response.data.map((item) => item.data);
      directories.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return directories;
  }

  /**
   * List source files for a given project, optionally filtered by branch or directory.
   */
  async listFiles(
    projectId: number,
    branchId?: number,
    directoryId?: number,
  ): Promise<CrowdinFile[]> {
    const files: CrowdinFile[] = [];
    let offset = 0;
    const limit = 500;

    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (branchId !== undefined) params.append("branchId", String(branchId));
    if (directoryId !== undefined) params.append("directoryId", String(directoryId));

    while (true) {
      const response = await this.get<CrowdinListResponse<CrowdinFile>>(
        `/projects/${projectId}/files?${params.toString()}`,
      );
      const page = response.data.map((item) => item.data);
      files.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
      params.set("offset", String(offset));
    }

    return files;
  }

  /**
   * List revisions for a given source file.
   */
  async listFileRevisions(projectId: number, fileId: number): Promise<CrowdinFileRevision[]> {
    const revisions: CrowdinFileRevision[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const response = await this.get<CrowdinListResponse<CrowdinFileRevision>>(
        `/projects/${projectId}/files/${fileId}/revisions?limit=${limit}&offset=${offset}`,
      );
      const page = response.data.map((item) => item.data);
      revisions.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return revisions;
  }

  /**
   * List source strings for a given project, optionally filtered by file.
   */
  async listSourceStrings(
    projectId: number,
    fileId?: number,
    stringIds?: number[],
  ): Promise<CrowdinSourceString[]> {
    const strings: CrowdinSourceString[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (fileId !== undefined) {
        params.append("fileId", String(fileId));
      }
      if (stringIds?.length) {
        params.append("stringIds", stringIds.join(","));
      }

      const response = await this.get<CrowdinListResponse<CrowdinSourceString>>(
        `/projects/${projectId}/strings?${params.toString()}`,
      );
      const page = response.data.map((item) => item.data);
      strings.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return strings;
  }

  /**
   * List tasks for a given project.
   */
  async listTasks(projectId: number): Promise<CrowdinTask[]> {
    const tasks: CrowdinTask[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const response = await this.get<CrowdinListResponse<CrowdinTask>>(
        `/projects/${projectId}/tasks?limit=${limit}&offset=${offset}`,
      );
      const page = response.data.map((item) => item.data);
      tasks.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return tasks;
  }

  /**
   * Get a single task by identifier.
   */
  async getTask(projectId: number, taskId: number): Promise<CrowdinTaskDetails> {
    const response = await this.get<CrowdinGetResponse<CrowdinTaskDetails>>(
      `/projects/${projectId}/tasks/${taskId}`,
    );
    return response.data;
  }

  /**
   * List language-scoped translations for a project.
   */
  async listLanguageTranslations(
    projectId: number,
    languageId: string,
    options?: { fileId?: number; stringIds?: number[] },
  ): Promise<CrowdinLanguageTranslation[]> {
    const translations: CrowdinLanguageTranslation[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (options?.fileId !== undefined) {
        params.append("fileId", String(options.fileId));
      }
      if (options?.stringIds?.length) {
        params.append("stringIds", options.stringIds.join(","));
      }

      const response = await this.get<CrowdinListResponse<CrowdinLanguageTranslation>>(
        `/projects/${projectId}/languages/${languageId}/translations?${params.toString()}`,
      );
      const page = response.data.map((item) => item.data);
      translations.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return translations;
  }

  /**
   * List string translations for a specific string and language.
   */
  async listStringTranslations(
    projectId: number,
    stringId: number,
    languageId: string,
  ): Promise<CrowdinStringTranslation[]> {
    const translations: CrowdinStringTranslation[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const params = new URLSearchParams({
        stringId: String(stringId),
        languageId,
        limit: String(limit),
        offset: String(offset),
      });
      const response = await this.get<CrowdinListResponse<CrowdinStringTranslation>>(
        `/projects/${projectId}/translations?${params.toString()}`,
      );
      const page = response.data.map((item) => item.data);
      translations.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return translations;
  }

  /**
   * List translation approvals, optionally filtered by language.
   */
  async listTranslationApprovals(
    projectId: number,
    languageId?: string,
  ): Promise<CrowdinTranslationApproval[]> {
    const approvals: CrowdinTranslationApproval[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (languageId) {
        params.append("languageId", languageId);
      }

      const response = await this.get<CrowdinListResponse<CrowdinTranslationApproval>>(
        `/projects/${projectId}/approvals?${params.toString()}`,
      );
      const page = response.data.map((item) => item.data);
      approvals.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return approvals;
  }

  /**
   * Upload file bytes to Crowdin storage.
   */
  async addStorage(input: { fileName: string; content: Uint8Array; contentType?: string }) {
    const url = `${this.baseUrl}/storages`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": input.contentType ?? "application/octet-stream",
        "Crowdin-API-FileName": encodeURIComponent(input.fileName),
      },
      body: input.content as BodyInit,
    });

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => null);
      }

      throw new CrowdinApiError(
        `Crowdin API returned HTTP ${response.status} for /storages`,
        response.status,
        body,
      );
    }

    const payload = (await response.json()) as CrowdinGetResponse<CrowdinStorage>;
    return payload.data;
  }

  /**
   * Import uploaded storage content as translations for a language.
   */
  async uploadTranslations(
    projectId: number,
    languageId: string,
    input: {
      storageId: number;
      fileId: number;
      autoApproveImported?: boolean;
    },
  ): Promise<CrowdinUploadTranslationsResult> {
    const response = await this.post<CrowdinGetResponse<CrowdinUploadTranslationsResult>>(
      `/projects/${projectId}/translations/${languageId}`,
      {
        storageId: input.storageId,
        fileId: input.fileId,
        autoApproveImported: input.autoApproveImported ?? true,
      },
    );
    return response.data;
  }

  /**
   * Start an async project translation build.
   */
  async buildProjectTranslation(
    projectId: number,
    input?: { targetLanguageIds?: string[]; exportApprovedOnly?: boolean },
  ): Promise<CrowdinTranslationBuild> {
    const response = await this.post<CrowdinGetResponse<CrowdinTranslationBuild>>(
      `/projects/${projectId}/translations/builds`,
      {
        skipUntranslatedStrings: false,
        skipUntranslatedFiles: false,
        exportApprovedOnly: input?.exportApprovedOnly ?? false,
        targetLanguageIds: input?.targetLanguageIds,
      },
    );
    return response.data;
  }

  /**
   * Check status of an async translation build.
   */
  async getTranslationBuildStatus(
    projectId: number,
    buildId: number,
  ): Promise<CrowdinTranslationBuild> {
    const response = await this.get<CrowdinGetResponse<CrowdinTranslationBuild>>(
      `/projects/${projectId}/translations/builds/${buildId}`,
    );
    return response.data;
  }

  /**
   * Get a download link for a completed translation build.
   */
  async downloadTranslationBuild(projectId: number, buildId: number): Promise<CrowdinDownloadLink> {
    const response = await this.get<CrowdinGetResponse<CrowdinDownloadLink>>(
      `/projects/${projectId}/translations/builds/${buildId}/download`,
    );
    return response.data;
  }

  /**
   * Export strings for a task and return a download link when available.
   */
  async exportTaskStrings(projectId: number, taskId: number): Promise<CrowdinDownloadLink | null> {
    const response = await this.fetchFn(
      `${this.baseUrl}/projects/${projectId}/tasks/${taskId}/exports`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: "",
      },
    );

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => null);
      }

      throw new CrowdinApiError(
        `Crowdin API returned HTTP ${response.status} for /projects/${projectId}/tasks/${taskId}/exports`,
        response.status,
        body,
      );
    }

    const payload = (await response.json()) as CrowdinGetResponse<CrowdinDownloadLink>;
    return payload.data;
  }

  /**
   * Download content from a Crowdin-provided URL.
   */
  async downloadUrl(url: string): Promise<Uint8Array> {
    const response = await this.fetchFn(url, { method: "GET" });
    if (!response.ok) {
      throw new CrowdinApiError(
        `Crowdin download returned HTTP ${response.status}`,
        response.status,
        null,
      );
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Poll a translation build until it finishes or fails.
   */
  async waitForTranslationBuild(
    projectId: number,
    buildId: number,
    options?: { maxAttempts?: number; delayMs?: number },
  ): Promise<CrowdinTranslationBuild> {
    const maxAttempts = options?.maxAttempts ?? 90;
    const delayMs = options?.delayMs ?? 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const build = await this.getTranslationBuildStatus(projectId, buildId);
      if (build.status === "finished") {
        return build;
      }
      if (build.status === "failed" || build.status === "canceled") {
        throw new CrowdinApiError(
          `Crowdin translation build ${buildId} finished with status ${build.status}`,
          500,
          build,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new CrowdinApiError(`Crowdin translation build ${buildId} timed out`, 504, {
      buildId,
      projectId,
    });
  }

  /**
   * Get translation progress for each target language in a project.
   */
  async listProjectLanguageProgress(projectId: number): Promise<CrowdinLanguageProgress[]> {
    const progress: CrowdinLanguageProgress[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const response = await this.get<CrowdinListResponse<CrowdinLanguageProgress>>(
        `/projects/${projectId}/languages/progress?limit=${limit}&offset=${offset}`,
      );
      const page = response.data.map((item) => item.data);
      progress.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return progress;
  }

  async listGlossaries(): Promise<CrowdinGlossary[]> {
    return this.listPaginated<CrowdinGlossary>("/glossaries");
  }

  async listGlossaryTerms(glossaryId: number): Promise<CrowdinGlossaryTerm[]> {
    return this.listPaginated<CrowdinGlossaryTerm>(`/glossaries/${glossaryId}/terms`);
  }

  async listTranslationMemories(): Promise<CrowdinTranslationMemory[]> {
    return this.listPaginated<CrowdinTranslationMemory>("/tms");
  }

  async listTranslationMemorySegments(
    tmId: number,
    options?: {
      shouldStop?: (segments: CrowdinTranslationMemorySegment[]) => boolean;
    },
  ): Promise<CrowdinTranslationMemorySegment[]> {
    return this.listPaginated<CrowdinTranslationMemorySegment>(`/tms/${tmId}/segments`, options);
  }

  async searchGlossaryConcordance(
    projectId: number,
    input: {
      sourceLanguageId: string;
      targetLanguageId: string;
      expressions: string[];
    },
  ): Promise<CrowdinGlossaryConcordanceResult[]> {
    if (input.expressions.length === 0) {
      return [];
    }

    const response = await this.post<
      CrowdinListResponse<{
        glossary: { id: number; name: string };
        concept: { id: number };
        sourceTerms: CrowdinGlossaryTerm[];
        targetTerms: CrowdinGlossaryTerm[];
      }>
    >(`/projects/${projectId}/glossaries/concordance`, {
      sourceLanguageId: input.sourceLanguageId,
      targetLanguageId: input.targetLanguageId,
      expressions: input.expressions,
    });

    return response.data.map((item) => item.data);
  }

  async searchTranslationMemoryConcordance(
    projectId: number,
    input: {
      sourceLanguageId: string;
      targetLanguageId: string;
      expressions: string[];
      minRelevant?: number;
    },
  ): Promise<CrowdinTranslationMemoryConcordanceResult[]> {
    if (input.expressions.length === 0) {
      return [];
    }

    const response = await this.post<
      CrowdinListResponse<CrowdinTranslationMemoryConcordanceResult>
    >(`/projects/${projectId}/tms/concordance`, {
      sourceLanguageId: input.sourceLanguageId,
      targetLanguageId: input.targetLanguageId,
      autoSubstitution: true,
      minRelevant: input.minRelevant ?? 60,
      expressions: input.expressions,
    });

    return response.data.map((item) => item.data);
  }

  private async listPaginated<T>(
    path: string,
    options?: { shouldStop?: (items: T[]) => boolean },
  ): Promise<T[]> {
    const items: T[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const separator = path.includes("?") ? "&" : "?";
      const response = await this.get<CrowdinListResponse<T>>(
        `${path}${separator}limit=${limit}&offset=${offset}`,
      );
      const page = response.data.map((item) => item.data);
      items.push(...page);

      if (options?.shouldStop?.(items) || page.length < limit) {
        break;
      }

      offset += limit;
    }

    return items;
  }

  private authHeaders(contentType = "application/json"): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": contentType,
    };
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, {
      method: "GET",
      headers: this.authHeaders(),
    });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(body),
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

      throw new CrowdinApiError(
        `Crowdin API returned HTTP ${response.status} for ${path}`,
        response.status,
        body,
      );
    }

    return response.json() as Promise<T>;
  }
}
