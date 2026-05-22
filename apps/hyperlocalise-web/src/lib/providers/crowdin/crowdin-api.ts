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
   * List branches for a given project.
   */
  async listBranches(projectId: number): Promise<CrowdinBranch[]> {
    const response = await this.get<CrowdinListResponse<CrowdinBranch>>(
      `/projects/${projectId}/branches?limit=500`,
    );
    return response.data.map((item) => item.data);
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
