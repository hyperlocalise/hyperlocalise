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
    const fetchImpl = this.options.fetchImpl ?? fetch;
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

  async updateEntryDraft(input: {
    entry: ContentfulEntry;
    translations: ContentfulDraftTranslation[];
  }) {
    const fields = { ...input.entry.fields };
    for (const translation of input.translations) {
      fields[translation.fieldId] = {
        ...fields[translation.fieldId],
        [translation.locale]: translation.value,
      };
    }

    return this.request<ContentfulEntry>(
      this.environmentPath(`/entries/${encodeURIComponent(input.entry.sys.id)}`),
      {
        method: "PUT",
        headers: {
          "x-contentful-version": String(input.entry.sys.version),
        },
        body: JSON.stringify({ fields }),
      },
    );
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
