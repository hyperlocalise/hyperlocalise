import type { ContentfulContentType, ContentfulDraftTranslation, ContentfulEntry } from "./types";

const CONTENTFUL_CMA_BASE_URL = "https://api.contentful.com";

export const CONTENTFUL_WEBHOOK_SECRET_HEADER = "x-hyperlocalise-webhook-secret";
export const CONTENTFUL_WEBHOOK_PUBLISH_TOPIC = "Entry.publish";

export type ContentfulWebhookDefinition = {
  sys: {
    id: string;
    version?: number;
  };
  name: string;
  url: string;
  topics: string[];
  filters: Array<Record<string, unknown>>;
  headers: Array<{
    key: string;
    value?: string;
    secret?: boolean;
  }>;
};

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

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  private environmentPath(path: string) {
    return `/spaces/${encodeURIComponent(this.options.spaceId)}/environments/${encodeURIComponent(
      this.options.environmentId,
    )}${path}`;
  }

  private spacePath(path: string) {
    return `/spaces/${encodeURIComponent(this.options.spaceId)}${path}`;
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

  async listWebhooks() {
    const response = await this.request<{ items: ContentfulWebhookDefinition[] }>(
      this.spacePath("/webhook_definitions"),
    );
    return response.items;
  }

  async getWebhook(webhookId: string) {
    return this.request<ContentfulWebhookDefinition>(
      this.spacePath(`/webhook_definitions/${encodeURIComponent(webhookId)}`),
    );
  }

  async createWebhook(input: {
    name: string;
    url: string;
    topics: string[];
    filters: Array<Record<string, unknown>>;
    headers: ContentfulWebhookDefinition["headers"];
  }) {
    return this.request<ContentfulWebhookDefinition>(this.spacePath("/webhook_definitions"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateWebhook(
    webhookId: string,
    input: {
      version: number;
      name: string;
      url: string;
      topics: string[];
      filters: Array<Record<string, unknown>>;
      headers: ContentfulWebhookDefinition["headers"];
    },
  ) {
    return this.request<ContentfulWebhookDefinition>(
      this.spacePath(`/webhook_definitions/${encodeURIComponent(webhookId)}`),
      {
        method: "PUT",
        headers: {
          "x-contentful-version": String(input.version),
        },
        body: JSON.stringify({
          name: input.name,
          url: input.url,
          topics: input.topics,
          filters: input.filters,
          headers: input.headers,
        }),
      },
    );
  }

  async deleteWebhook(webhookId: string) {
    await this.request<void>(
      this.spacePath(`/webhook_definitions/${encodeURIComponent(webhookId)}`),
      {
        method: "DELETE",
      },
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
