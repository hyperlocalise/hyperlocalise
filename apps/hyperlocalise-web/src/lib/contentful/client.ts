import { providerSafeFetch } from "@/lib/providers/provider-safe-fetch";

import type { ContentfulContentType, ContentfulDraftTranslation, ContentfulEntry } from "./types";

const CONTENTFUL_CMA_BASE_URL = "https://api.contentful.com";

export type ContentfulClientError = {
  code: "contentful_request_failed";
  status: number;
  message: string;
};

export class ContentfulManagementClient {
  constructor(
    private readonly options: {
      accessToken: string;
      spaceId: string;
      environmentId: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    // We use providerSafeFetch to mitigate SSRF risks via DNS-level validation and IP blocklisting
    const fetchImpl = this.options.fetchImpl ?? providerSafeFetch;
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.options.accessToken}`);
    headers.set("content-type", "application/vnd.contentful.management.v1+json");

    const response = await fetchImpl(`${CONTENTFUL_CMA_BASE_URL}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw {
        code: "contentful_request_failed",
        status: response.status,
        message: `Contentful request failed with status ${response.status}`,
      } satisfies ContentfulClientError;
    }

    return (await response.json()) as T;
  }

  private environmentPath(path: string) {
    return `/spaces/${encodeURIComponent(this.options.spaceId)}/environments/${encodeURIComponent(
      this.options.environmentId,
    )}${path}`;
  }

  async validateConnection() {
    const [environment, locales] = await Promise.all([
      this.request<{ sys: { id: string } }>(this.environmentPath("")),
      this.listLocales(),
    ]);
    return {
      environmentId: environment.sys.id,
      locales,
    };
  }

  async listLocales() {
    const response = await this.request<{
      items: Array<{ code: string; name: string; default?: boolean }>;
    }>(this.environmentPath("/locales"));
    return response.items.map((locale) => ({
      code: locale.code,
      name: locale.name,
      default: Boolean(locale.default),
    }));
  }

  async getEntry(entryId: string) {
    return this.request<ContentfulEntry>(
      this.environmentPath(`/entries/${encodeURIComponent(entryId)}`),
    );
  }

  async getContentType(contentTypeId: string) {
    return this.request<ContentfulContentType>(
      this.environmentPath(`/content_types/${encodeURIComponent(contentTypeId)}`),
    );
  }

  private applyDraftTranslations(
    entry: ContentfulEntry,
    translations: ContentfulDraftTranslation[],
  ) {
    const fields = { ...entry.fields };
    for (const translation of translations) {
      fields[translation.fieldId] = {
        ...fields[translation.fieldId],
        [translation.locale]: translation.value,
      };
    }
    return fields;
  }

  private putEntryDraft(entry: ContentfulEntry, fields: ContentfulEntry["fields"]) {
    return this.request<ContentfulEntry>(
      this.environmentPath(`/entries/${encodeURIComponent(entry.sys.id)}`),
      {
        method: "PUT",
        headers: {
          "x-contentful-version": String(entry.sys.version),
        },
        body: JSON.stringify({ fields }),
      },
    );
  }

  async updateEntryDraft(input: {
    entry: ContentfulEntry;
    translations: ContentfulDraftTranslation[];
    maxVersionConflictRetries?: number;
  }) {
    const maxRetries = input.maxVersionConflictRetries ?? 5;
    let entry = input.entry;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.putEntryDraft(
          entry,
          this.applyDraftTranslations(entry, input.translations),
        );
      } catch (error) {
        const isVersionConflict =
          isContentfulClientError(error) && error.status === 409 && attempt < maxRetries;
        if (!isVersionConflict) {
          throw error;
        }
        entry = await this.getEntry(entry.sys.id);
      }
    }

    throw {
      code: "contentful_request_failed",
      status: 409,
      message: "Contentful entry version conflict persisted after retries",
    } satisfies ContentfulClientError;
  }
}

export function isContentfulClientError(error: unknown): error is ContentfulClientError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "contentful_request_failed"
  );
}
