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
import { err, ok, type Result } from "@/lib/primitives/result/results";

import {
  STORYBLOK_EXPORT_FORMAT_VERSION,
  STORYBLOK_MAX_RATE_LIMIT_RETRIES,
  STORYBLOK_RATE_LIMIT_BASE_DELAY_MS,
  STORYBLOK_REGION_BASE_URLS,
  STORYBLOK_STORIES_PAGE_SIZE,
  type StoryblokRegion,
} from "./constants";
import type {
  StoryblokClientError,
  StoryblokExportPayload,
  StoryblokLanguage,
  StoryblokSpace,
  StoryblokSpaceSummary,
  StoryblokStoriesPage,
  StoryblokStorySummary,
} from "./types";

function readId(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" ? value : "";
}

function parseSpaceSummary(raw: Record<string, unknown>): StoryblokSpaceSummary {
  return {
    id: readId(raw.id),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Space",
    region: typeof raw.region === "string" ? raw.region : null,
  };
}

function parseLanguages(raw: unknown): StoryblokLanguage[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(
      (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
    )
    .map((entry) => ({
      code: typeof entry.code === "string" ? entry.code.trim() : "",
      name: typeof entry.name === "string" ? entry.name : "",
    }))
    .filter((language) => language.code.length > 0);
}

export function parseStoryblokSpace(raw: Record<string, unknown>): StoryblokSpace {
  const options =
    raw.options && typeof raw.options === "object" ? (raw.options as Record<string, unknown>) : {};
  return {
    ...parseSpaceSummary(raw),
    languages: parseLanguages(options.languages ?? raw.languages),
  };
}

function parseStorySummary(raw: Record<string, unknown>): StoryblokStorySummary {
  const slug = typeof raw.slug === "string" ? raw.slug : "";
  return {
    id: readId(raw.id),
    name: typeof raw.name === "string" ? raw.name : slug,
    slug,
    fullSlug: typeof raw.full_slug === "string" && raw.full_slug ? raw.full_slug : slug,
    isFolder: raw.is_folder === true,
    updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
}

/**
 * Keeps only string and number values. Storyblok's export is a flat object;
 * anything else would be a format change we should not send back on import.
 */
export function parseStoryblokExportPayload(raw: unknown): StoryblokExportPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const payload: StoryblokExportPayload = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number") {
      payload[key] = value;
    }
  }
  return payload;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function retryAfterMs(header: string | null, attempt: number): number {
  const seconds = header ? Number.parseFloat(header) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  return STORYBLOK_RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt;
}

export class StoryblokManagementClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(input: {
    accessToken: string;
    region: StoryblokRegion;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  }) {
    this.accessToken = input.accessToken;
    this.baseUrl = STORYBLOK_REGION_BASE_URLS[input.region];
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.sleep = input.sleep ?? delay;
  }

  private async request<T>(input: {
    path: string;
    method?: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    operation: string;
    signal?: AbortSignal;
  }): Promise<Result<{ body: T; headers: Headers }, StoryblokClientError>> {
    const url = new URL(`${this.baseUrl}${input.path}`);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value === undefined || value === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }

    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url.toString(), {
          method: input.method ?? "GET",
          headers: {
            // Personal access tokens are sent as-is, without a Bearer prefix.
            Authorization: this.accessToken,
            Accept: "application/json",
            ...(input.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
          signal: input.signal,
        });
      } catch (error) {
        return err({
          code: "storyblok_request_failed",
          status: 0,
          message: error instanceof Error ? error.message : "Network request failed",
          operation: input.operation,
        });
      }

      if (response.status === 429 && attempt < STORYBLOK_MAX_RATE_LIMIT_RETRIES) {
        await this.sleep(retryAfterMs(response.headers.get("retry-after"), attempt), input.signal);
        continue;
      }

      if (!response.ok) {
        return err({
          code: "storyblok_request_failed",
          status: response.status,
          message: await readErrorMessage(response),
          operation: input.operation,
        });
      }

      if (response.status === 204) {
        return ok({ body: undefined as T, headers: response.headers });
      }

      try {
        return ok({ body: (await response.json()) as T, headers: response.headers });
      } catch {
        return err({
          code: "storyblok_request_failed",
          status: response.status,
          message: "Invalid JSON response from Storyblok",
          operation: input.operation,
        });
      }
    }
  }

  async listSpaces(
    options: { signal?: AbortSignal } = {},
  ): Promise<Result<StoryblokSpaceSummary[], StoryblokClientError>> {
    const result = await this.request<{ spaces?: Record<string, unknown>[] }>({
      path: "/spaces",
      operation: "listSpaces",
      signal: options.signal,
    });
    if (!result.ok) {
      return result;
    }
    return ok((result.value.body.spaces ?? []).map(parseSpaceSummary));
  }

  async getSpace(
    spaceId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<Result<StoryblokSpace, StoryblokClientError>> {
    const result = await this.request<{ space?: Record<string, unknown> }>({
      path: `/spaces/${encodeURIComponent(spaceId)}`,
      operation: "getSpace",
      signal: options.signal,
    });
    if (!result.ok) {
      return result;
    }
    const space = result.value.body.space;
    if (!space) {
      return err({
        code: "storyblok_request_failed",
        status: 404,
        message: "Space not found.",
        operation: "getSpace",
      });
    }
    return ok(parseStoryblokSpace(space));
  }

  async listStories(input: {
    spaceId: string;
    page?: number;
    startsWith?: string;
    foldersOnly?: boolean;
    signal?: AbortSignal;
  }): Promise<Result<StoryblokStoriesPage, StoryblokClientError>> {
    const page = input.page ?? 1;
    const result = await this.request<{ stories?: Record<string, unknown>[] }>({
      path: `/spaces/${encodeURIComponent(input.spaceId)}/stories`,
      query: {
        page,
        per_page: STORYBLOK_STORIES_PAGE_SIZE,
        starts_with: input.startsWith,
        ...(input.foldersOnly ? { folder_only: true } : { story_only: true }),
        sort_by: "updated_at:asc",
      },
      operation: "listStories",
      signal: input.signal,
    });
    if (!result.ok) {
      return result;
    }
    const stories = (result.value.body.stories ?? []).map(parseStorySummary);
    const totalHeader = Number.parseInt(result.value.headers.get("total") ?? "", 10);
    return ok({
      stories,
      total: Number.isFinite(totalHeader) ? totalHeader : stories.length,
      page,
      perPage: STORYBLOK_STORIES_PAGE_SIZE,
    });
  }

  /**
   * Exports a story's translatable fields. Without `langCode` the values are
   * the default language. With `langCode` the values are that language's
   * translations. Requires a plan that includes translation export.
   */
  async exportStory(input: {
    spaceId: string;
    storyId: string;
    langCode?: string;
    signal?: AbortSignal;
  }): Promise<Result<StoryblokExportPayload, StoryblokClientError>> {
    const result = await this.request<unknown>({
      path: `/spaces/${encodeURIComponent(input.spaceId)}/stories/${encodeURIComponent(input.storyId)}/export.json`,
      query: {
        version: STORYBLOK_EXPORT_FORMAT_VERSION,
        ...(input.langCode ? { lang_code: input.langCode, export_lang: true } : {}),
      },
      operation: "exportStory",
      signal: input.signal,
    });
    if (!result.ok) {
      return result;
    }
    const payload = parseStoryblokExportPayload(result.value.body);
    if (!payload) {
      return err({
        code: "storyblok_request_failed",
        status: 502,
        message: "Storyblok returned an export in an unexpected format.",
        operation: "exportStory",
      });
    }
    return ok(payload);
  }

  /** Writes one language's translations back onto a story. */
  async importStoryTranslation(input: {
    spaceId: string;
    storyId: string;
    langCode: string;
    payload: StoryblokExportPayload;
    signal?: AbortSignal;
  }): Promise<Result<void, StoryblokClientError>> {
    const result = await this.request<unknown>({
      path: `/spaces/${encodeURIComponent(input.spaceId)}/stories/${encodeURIComponent(input.storyId)}/import.json`,
      method: "PUT",
      query: {
        version: STORYBLOK_EXPORT_FORMAT_VERSION,
        lang_code: input.langCode,
        import_lang: true,
      },
      body: { data: JSON.stringify(input.payload) },
      operation: "importStoryTranslation",
      signal: input.signal,
    });
    if (!result.ok) {
      return result;
    }
    return ok(undefined);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = response.statusText || "Storyblok request failed";
  try {
    const body = (await response.json()) as unknown;
    if (typeof body === "string" && body.trim()) {
      return body;
    }
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      for (const key of ["error", "message"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) {
          return value;
        }
      }
    }
  } catch {
    // Storyblok sometimes answers errors with plain text; keep the status text.
  }
  return fallback;
}
