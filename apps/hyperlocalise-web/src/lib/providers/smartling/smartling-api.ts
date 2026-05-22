/**
 * Smartling API client for authentication and project discovery.
 *
 * This module intentionally implements only the endpoints required for
 * credential validation and the TMS connector project-scan flow.
 */

import { parseSmartlingCredentials, type SmartlingCredentials } from "./smartling-credentials";

const DEFAULT_AUTH_BASE_URL = "https://api.smartling.com/auth-api/v2";
const DEFAULT_ACCOUNTS_BASE_URL = "https://api.smartling.com/accounts-api/v2";
const DEFAULT_PROJECTS_BASE_URL = "https://api.smartling.com/projects-api/v2";
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DEFAULT_PAGE_SIZE = 500;

export interface SmartlingApiClientOptions {
  credentials: SmartlingCredentials | string;
  authBaseUrl?: string;
  accountsBaseUrl?: string;
  projectsBaseUrl?: string;
  fetchFn?: typeof fetch;
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

  private async get<T>(url: string, token: string): Promise<T> {
    const response = await this.fetchFn(url, {
      method: "GET",
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
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return parseSmartlingResponse<T>(response, url);
  }
}

export function deriveServiceBaseUrl(authBaseUrl: string, service: "accounts" | "projects") {
  const normalized = normalizeServiceBaseUrl(authBaseUrl, authBaseUrl);
  if (normalized.includes("/auth-api/")) {
    return normalized.replace("/auth-api/", `/${service}-api/`);
  }

  return service === "accounts" ? DEFAULT_ACCOUNTS_BASE_URL : DEFAULT_PROJECTS_BASE_URL;
}

export function normalizeServiceBaseUrl(baseUrl: string | undefined, fallback: string) {
  try {
    const url = new URL(baseUrl ?? fallback);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
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
    throw new SmartlingApiError(
      classified.message,
      response.status,
      envelope.response.code ?? classified.errorCode,
      body,
    );
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
