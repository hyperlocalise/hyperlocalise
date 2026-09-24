/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { GoSvcDownload, GoSvcErrorBody, GoSvcRequestOptions } from "./go-svc-client.types";

export const DEFAULT_GO_SVC_BASE_URL = "https://api.hyperlocalise.com";

export type GoSvcClientOptions = {
  getAccessToken: () => string | null | undefined | Promise<string | null | undefined>;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export type GoSvcJsonRequest = GoSvcRequestOptions & {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: object;
  body?: unknown;
};

export class GoSvcClientError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details: unknown;

  constructor(input: {
    code: string;
    message: string;
    status?: number | null;
    details?: unknown;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "GoSvcClientError";
    this.code = input.code;
    this.status = input.status ?? null;
    this.details = input.details;
  }
}

export class GoSvcRequest {
  readonly baseUrl: string;

  private readonly getAccessToken: GoSvcClientOptions["getAccessToken"];
  private readonly fetch: typeof fetch;

  constructor(options: GoSvcClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_GO_SVC_BASE_URL);
    this.getAccessToken = options.getAccessToken;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async json<T>(path: string, request: GoSvcJsonRequest = {}): Promise<T> {
    const response = await this.send(path, request);
    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new GoSvcClientError({
        code: "invalid_response",
        message: "go-svc returned an invalid JSON response",
        status: response.status,
        cause,
      });
    }
  }

  async empty(path: string, request: GoSvcJsonRequest = {}): Promise<void> {
    await this.send(path, request);
  }

  async download(path: string, request: GoSvcJsonRequest = {}): Promise<GoSvcDownload> {
    const response = await this.send(path, request);
    return {
      blob: await response.blob(),
      contentType: response.headers.get("content-type"),
      filename: responseFilename(response.headers.get("content-disposition")),
      extension: response.headers.get("x-export-extension"),
    };
  }

  private async send(path: string, request: GoSvcJsonRequest): Promise<Response> {
    const token = String((await this.getAccessToken()) ?? "").trim();
    if (!token) {
      throw new GoSvcClientError({
        code: "missing_access_token",
        message: "A WorkOS access token is required",
      });
    }

    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    });
    let body: BodyInit | undefined;
    if (request.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(request.body);
    }

    const requestUrl = this.url(path, request.query);
    let response: Response;
    try {
      response = await this.fetch(requestUrl, {
        method: request.method ?? "GET",
        headers,
        body,
        credentials: "omit",
        signal: request.signal,
      });
    } catch (cause) {
      if (isAbortError(cause)) {
        throw cause;
      }
      throw new GoSvcClientError({
        code: "network_error",
        message: "Unable to reach go-svc",
        cause,
      });
    }

    if (!response.ok) {
      throw await responseError(response);
    }
    return response;
  }

  private url(path: string, query?: object): string {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new TypeError("go-svc paths must start with one slash");
    }
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, rawValue] of Object.entries(query)) {
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        for (const value of values) {
          if (value !== null && value !== undefined) {
            url.searchParams.append(key, String(value));
          }
        }
      }
    }
    return url.toString();
  }
}

export function orgPath(organizationSlug: string, ...segments: string[]): string {
  return `/v1/orgs/${encodeURIComponent(organizationSlug)}/${segments
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function issueSheetPath(
  organizationSlug: string,
  projectId: string,
  ...segments: string[]
): string {
  return orgPath(organizationSlug, "projects", projectId, "issue-sheet", ...segments);
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError("Invalid go-svc base URL");
  }
  return url.toString().replace(/\/+$/, "");
}

async function responseError(response: Response): Promise<GoSvcClientError> {
  let body: GoSvcErrorBody = {};
  try {
    const parsed: unknown = await response.json();
    if (isErrorEnvelope(parsed)) {
      body = parsed;
    }
  } catch {
    // A non-JSON upstream error still carries useful HTTP status context.
  }
  return new GoSvcClientError({
    code: typeof body.error === "string" && body.error ? body.error : "http_error",
    message:
      typeof body.message === "string" && body.message
        ? body.message
        : `go-svc request failed with status ${response.status}`,
    status: response.status,
    details: body.details,
  });
}

function isErrorEnvelope(value: unknown): value is GoSvcErrorBody {
  return typeof value === "object" && value !== null;
}

function responseFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      return utf8;
    }
  }
  return /filename="?([^";]+)"?/i.exec(contentDisposition)?.[1] ?? null;
}

function isAbortError(value: unknown): boolean {
  return (
    (value instanceof DOMException && value.name === "AbortError") ||
    (typeof value === "object" && value !== null && "name" in value && value.name === "AbortError")
  );
}
