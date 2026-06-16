import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import type {
  ContentfulAsset,
  ContentfulContentType,
  ContentfulDraftTranslation,
  ContentfulEntry,
} from "./types";

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
  contentfulErrorId?: string;
};

function parseContentfulManagementError(text: string): {
  message?: string;
  contentfulErrorId?: string;
} {
  try {
    const body = JSON.parse(text) as {
      message?: string;
      sys?: { id?: string };
    };
    return {
      message: typeof body.message === "string" ? body.message : undefined,
      contentfulErrorId: typeof body.sys?.id === "string" ? body.sys.id : undefined,
    };
  } catch {
    return {};
  }
}

function buildContentfulClientError(input: {
  status: number;
  fallbackMessage: string;
  responseText?: string;
}): ContentfulClientError {
  const parsed = input.responseText ? parseContentfulManagementError(input.responseText) : {};
  return {
    code: "contentful_request_failed",
    status: input.status,
    message: parsed.message ?? input.fallbackMessage,
    ...(parsed.contentfulErrorId ? { contentfulErrorId: parsed.contentfulErrorId } : {}),
  };
}

type ContentfulLocale = { code: string; name: string; default: boolean };
type ContentfulConnectionValidation = {
  environmentId: string;
  locales: ContentfulLocale[];
};
type ContentfulAssetFileDownload = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
};

type ContentfulAssetUploadFile = {
  contentType: string;
  fileName: string;
  uploadFrom: {
    sys: {
      type: "Link";
      linkType: "Upload";
      id: string;
    };
  };
};

function prepareAssetFilesForLocaleUpdate(input: {
  existingFiles?: ContentfulAsset["fields"]["file"];
  locale: string;
  file: ContentfulAssetUploadFile;
}): ContentfulAsset["fields"]["file"] {
  const files: NonNullable<ContentfulAsset["fields"]["file"]> = {};
  for (const [locale, existingFile] of Object.entries(input.existingFiles ?? {})) {
    const { url: _url, uploadFrom: _uploadFrom, ...fileDescriptor } = existingFile;
    files[locale] = fileDescriptor;
  }
  files[input.locale] = input.file;
  return files;
}

export class ContentfulManagementClient {
  constructor(
    private readonly options: {
      accessToken: string;
      spaceId: string;
      environmentId: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<Result<T, ContentfulClientError>> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.options.accessToken}`);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/vnd.contentful.management.v1+json");
    }

    let response: Response;
    try {
      response = await fetchImpl(`${CONTENTFUL_CMA_BASE_URL}${path}`, {
        ...init,
        headers,
      });
    } catch {
      return err(
        buildContentfulClientError({
          status: 0,
          fallbackMessage: "Contentful request failed before receiving a response",
        }),
      );
    }

    if (!response.ok) {
      let responseText = "";
      try {
        responseText = await response.text();
      } catch {
        return err(
          buildContentfulClientError({
            status: response.status,
            fallbackMessage: `Contentful request failed with status ${response.status}`,
          }),
        );
      }

      return err(
        buildContentfulClientError({
          status: response.status,
          fallbackMessage: `Contentful request failed with status ${response.status}`,
          responseText,
        }),
      );
    }

    if (response.status === 204) {
      return ok(undefined as T);
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      return err(
        buildContentfulClientError({
          status: response.status,
          fallbackMessage: "Contentful response body could not be read",
        }),
      );
    }

    if (!text) {
      return ok(undefined as T);
    }

    try {
      return ok(JSON.parse(text) as T);
    } catch {
      return err(
        buildContentfulClientError({
          status: response.status,
          fallbackMessage: "Contentful response body was not valid JSON",
          responseText: text,
        }),
      );
    }
  }

  private environmentPath(path: string) {
    return `/spaces/${encodeURIComponent(this.options.spaceId)}/environments/${encodeURIComponent(
      this.options.environmentId,
    )}${path}`;
  }

  private spacePath(path: string) {
    return `/spaces/${encodeURIComponent(this.options.spaceId)}${path}`;
  }

  async validateConnection(): Promise<
    Result<ContentfulConnectionValidation, ContentfulClientError>
  > {
    const [environmentResult, localesResult] = await Promise.all([
      this.request<{ sys: { id: string } }>(this.environmentPath("")),
      this.listLocales(),
    ]);
    if (isErr(environmentResult)) {
      return err(environmentResult.error);
    }
    if (isErr(localesResult)) {
      return err(localesResult.error);
    }
    return ok({
      environmentId: environmentResult.value.sys.id,
      locales: localesResult.value,
    });
  }

  async listLocales(): Promise<Result<ContentfulLocale[], ContentfulClientError>> {
    const responseResult = await this.request<{
      items: Array<{ code: string; name: string; default?: boolean }>;
    }>(this.environmentPath("/locales"));
    if (isErr(responseResult)) {
      return err(responseResult.error);
    }
    return ok(
      responseResult.value.items.map((locale) => ({
        code: locale.code,
        name: locale.name,
        default: Boolean(locale.default),
      })),
    );
  }

  async getEntry(entryId: string): Promise<Result<ContentfulEntry, ContentfulClientError>> {
    return this.request<ContentfulEntry>(
      this.environmentPath(`/entries/${encodeURIComponent(entryId)}`),
    );
  }

  async getContentType(
    contentTypeId: string,
  ): Promise<Result<ContentfulContentType, ContentfulClientError>> {
    return this.request<ContentfulContentType>(
      this.environmentPath(`/content_types/${encodeURIComponent(contentTypeId)}`),
    );
  }

  async listContentTypes(): Promise<
    Result<Array<{ id: string; name: string }>, ContentfulClientError>
  > {
    const pageSize = 100;
    const items: Array<{
      sys: { id: string };
      name?: string;
    }> = [];
    let skip = 0;
    let total = Number.POSITIVE_INFINITY;

    while (skip < total) {
      const responseResult = await this.request<{
        total: number;
        items: Array<{
          sys: { id: string };
          name?: string;
        }>;
      }>(this.environmentPath(`/content_types?limit=${pageSize}&skip=${skip}`));
      if (isErr(responseResult)) {
        return err(responseResult.error);
      }

      items.push(...responseResult.value.items);
      total = responseResult.value.total;
      skip += pageSize;
    }

    return ok(
      items.map((contentType) => ({
        id: contentType.sys.id,
        name: contentType.name ?? contentType.sys.id,
      })),
    );
  }

  async getAsset(assetId: string): Promise<Result<ContentfulAsset, ContentfulClientError>> {
    return this.request<ContentfulAsset>(
      this.environmentPath(`/assets/${encodeURIComponent(assetId)}`),
    );
  }

  async downloadAssetFile(input: {
    asset: ContentfulAsset;
    locale: string;
  }): Promise<Result<ContentfulAssetFileDownload, ContentfulClientError>> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const file = input.asset.fields.file?.[input.locale];
    if (!file?.url) {
      return err({
        code: "contentful_request_failed",
        status: 404,
        message: `Contentful asset ${input.asset.sys.id} has no file for locale ${input.locale}`,
      });
    }

    const fileUrl = file.url.startsWith("//") ? `https:${file.url}` : file.url;
    let response: Response;
    try {
      response = await fetchImpl(fileUrl);
    } catch {
      return err({
        code: "contentful_request_failed",
        status: 0,
        message: "Failed to download Contentful asset file before receiving a response",
      });
    }
    if (!response.ok) {
      return err({
        code: "contentful_request_failed",
        status: response.status,
        message: `Failed to download Contentful asset file with status ${response.status}`,
      });
    }

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await response.arrayBuffer();
    } catch {
      return err({
        code: "contentful_request_failed",
        status: response.status,
        message: "Contentful asset file response body could not be read",
      });
    }

    const buffer = Buffer.from(arrayBuffer);
    return ok({
      buffer,
      fileName: file.fileName,
      contentType: file.contentType,
    });
  }

  async createLocalizedAsset(input: {
    locale: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
    title?: string;
    description?: string;
  }): Promise<Result<ContentfulAsset, ContentfulClientError>> {
    const uploadResult = await this.request<{ sys: { id: string } }>(this.spacePath("/uploads"), {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
      },
      body: new Uint8Array(input.buffer),
    });
    if (isErr(uploadResult)) {
      return err(uploadResult.error);
    }

    const assetResult = await this.request<ContentfulAsset>(this.environmentPath("/assets"), {
      method: "POST",
      body: JSON.stringify({
        fields: {
          title: { [input.locale]: input.title ?? input.fileName },
          ...(input.description ? { description: { [input.locale]: input.description } } : {}),
          file: {
            [input.locale]: {
              contentType: input.contentType,
              fileName: input.fileName,
              uploadFrom: {
                sys: {
                  type: "Link",
                  linkType: "Upload",
                  id: uploadResult.value.sys.id,
                },
              },
            },
          },
        },
      }),
    });
    if (isErr(assetResult)) {
      return err(assetResult.error);
    }

    const processResult = await this.request<void>(
      this.environmentPath(
        `/assets/${encodeURIComponent(assetResult.value.sys.id)}/files/${encodeURIComponent(input.locale)}/process`,
      ),
      {
        method: "PUT",
        headers: {
          "X-Contentful-Version": String(assetResult.value.sys.version),
        },
      },
    );
    if (isErr(processResult)) {
      return err(processResult.error);
    }

    return ok(assetResult.value);
  }

  async updateAssetLocaleFile(input: {
    asset: ContentfulAsset;
    locale: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
    title?: string;
    description?: string;
  }): Promise<Result<ContentfulAsset, ContentfulClientError>> {
    const uploadResult = await this.request<{ sys: { id: string } }>(this.spacePath("/uploads"), {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
      },
      body: new Uint8Array(input.buffer),
    });
    if (isErr(uploadResult)) {
      return err(uploadResult.error);
    }

    const file: ContentfulAssetUploadFile = {
      contentType: input.contentType,
      fileName: input.fileName,
      uploadFrom: {
        sys: {
          type: "Link",
          linkType: "Upload",
          id: uploadResult.value.sys.id,
        },
      },
    };
    const fields: ContentfulAsset["fields"] = {
      ...input.asset.fields,
      title: {
        ...input.asset.fields.title,
        [input.locale]: input.asset.fields.title?.[input.locale] ?? input.title ?? input.fileName,
      },
      ...(input.asset.fields.description || input.description
        ? {
            description: {
              ...input.asset.fields.description,
              ...(input.description && !input.asset.fields.description?.[input.locale]
                ? { [input.locale]: input.description }
                : {}),
            },
          }
        : {}),
      file: prepareAssetFilesForLocaleUpdate({
        existingFiles: input.asset.fields.file,
        locale: input.locale,
        file,
      }),
    };

    const assetResult = await this.request<ContentfulAsset>(
      this.environmentPath(`/assets/${encodeURIComponent(input.asset.sys.id)}`),
      {
        method: "PUT",
        headers: {
          "X-Contentful-Version": String(input.asset.sys.version),
        },
        body: JSON.stringify({ fields }),
      },
    );
    if (isErr(assetResult)) {
      return err(assetResult.error);
    }

    const processResult = await this.request<void>(
      this.environmentPath(
        `/assets/${encodeURIComponent(assetResult.value.sys.id)}/files/${encodeURIComponent(input.locale)}/process`,
      ),
      {
        method: "PUT",
        headers: {
          "X-Contentful-Version": String(assetResult.value.sys.version),
        },
      },
    );
    if (isErr(processResult)) {
      return err(processResult.error);
    }

    return ok(assetResult.value);
  }

  async listWebhooks(): Promise<Result<ContentfulWebhookDefinition[], ContentfulClientError>> {
    const responseResult = await this.request<{ items: ContentfulWebhookDefinition[] }>(
      this.spacePath("/webhook_definitions"),
    );
    if (isErr(responseResult)) {
      return err(responseResult.error);
    }
    return ok(responseResult.value.items);
  }

  async getWebhook(
    webhookId: string,
  ): Promise<Result<ContentfulWebhookDefinition, ContentfulClientError>> {
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
  }): Promise<Result<ContentfulWebhookDefinition, ContentfulClientError>> {
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
  ): Promise<Result<ContentfulWebhookDefinition, ContentfulClientError>> {
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

  async deleteWebhook(webhookId: string): Promise<Result<void, ContentfulClientError>> {
    return this.request<void>(
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

  private putEntryDraft(
    entry: ContentfulEntry,
    fields: ContentfulEntry["fields"],
  ): Promise<Result<ContentfulEntry, ContentfulClientError>> {
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
  }): Promise<Result<ContentfulEntry, ContentfulClientError>> {
    const maxRetries = input.maxVersionConflictRetries ?? 5;
    let entry = input.entry;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const updateResult = await this.putEntryDraft(
        entry,
        this.applyDraftTranslations(entry, input.translations),
      );
      if (!isErr(updateResult)) {
        return updateResult;
      }

      const isVersionConflict = updateResult.error.status === 409 && attempt < maxRetries;
      if (!isVersionConflict) {
        return updateResult;
      }

      const entryResult = await this.getEntry(entry.sys.id);
      if (isErr(entryResult)) {
        return entryResult;
      }
      entry = entryResult.value;
    }

    return err({
      code: "contentful_request_failed",
      status: 409,
      message: "Contentful entry version conflict persisted after retries",
    });
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
