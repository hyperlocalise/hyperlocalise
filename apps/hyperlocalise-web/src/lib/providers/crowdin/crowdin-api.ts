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
  async listSourceStrings(projectId: number, fileId?: number): Promise<CrowdinSourceString[]> {
    const strings: CrowdinSourceString[] = [];
    let offset = 0;
    const limit = 500;

    const fileParam = fileId !== undefined ? `&fileId=${fileId}` : "";

    while (true) {
      const response = await this.get<CrowdinListResponse<CrowdinSourceString>>(
        `/projects/${projectId}/strings?limit=${limit}&offset=${offset}${fileParam}`,
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

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchFn(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });

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
