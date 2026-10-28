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

import { WEBFLOW_API_BASE_URL, WEBFLOW_COLLECTION_ITEMS_PAGE_SIZE } from "./constants";
import type {
  WebflowClientError,
  WebflowCollection,
  WebflowCollectionItem,
  WebflowCollectionSummary,
  WebflowPagination,
  WebflowSite,
  WebflowSiteLocales,
  WebflowSiteSummary,
} from "./types";

export function isWebflowClientError(value: unknown): value is WebflowClientError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value as WebflowClientError).code === "webflow_request_failed"
  );
}

function parseLocale(raw: Record<string, unknown>) {
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    cmsLocaleId:
      typeof raw.cmsLocaleId === "string"
        ? raw.cmsLocaleId
        : typeof raw.id === "string"
          ? raw.id
          : "",
    tag: typeof raw.tag === "string" ? raw.tag : "",
    enabled: raw.enabled !== false,
    subdirectory: typeof raw.subdirectory === "string" ? raw.subdirectory : null,
  };
}

function parseSiteLocales(raw: unknown): WebflowSiteLocales | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const locales = raw as Record<string, unknown>;
  const primaryRaw = locales.primary;
  if (!primaryRaw || typeof primaryRaw !== "object") {
    return null;
  }
  const secondaryRaw = Array.isArray(locales.secondary) ? locales.secondary : [];
  return {
    primary: parseLocale(primaryRaw as Record<string, unknown>),
    secondary: secondaryRaw
      .filter(
        (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
      )
      .map(parseLocale),
  };
}

function parseSiteSummary(raw: Record<string, unknown>): WebflowSiteSummary {
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    displayName:
      typeof raw.displayName === "string"
        ? raw.displayName
        : typeof raw.shortName === "string"
          ? raw.shortName
          : typeof raw.name === "string"
            ? raw.name
            : "Site",
    lastPublished: typeof raw.lastPublished === "string" ? raw.lastPublished : null,
    lastUpdated: typeof raw.lastUpdated === "string" ? raw.lastUpdated : null,
  };
}

function parseCollectionSummary(raw: Record<string, unknown>): WebflowCollectionSummary {
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    displayName:
      typeof raw.displayName === "string"
        ? raw.displayName
        : typeof raw.name === "string"
          ? raw.name
          : "Collection",
    slug: typeof raw.slug === "string" ? raw.slug : "",
    lastUpdated: typeof raw.lastUpdated === "string" ? raw.lastUpdated : null,
  };
}

function parseCollectionItem(raw: Record<string, unknown>): WebflowCollectionItem {
  const fieldData =
    raw.fieldData && typeof raw.fieldData === "object"
      ? (raw.fieldData as WebflowCollectionItem["fieldData"])
      : {};
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    cmsLocaleId: typeof raw.cmsLocaleId === "string" ? raw.cmsLocaleId : null,
    lastPublished: typeof raw.lastPublished === "string" ? raw.lastPublished : null,
    lastUpdated: typeof raw.lastUpdated === "string" ? raw.lastUpdated : null,
    createdOn: typeof raw.createdOn === "string" ? raw.createdOn : null,
    isArchived: raw.isArchived === true,
    isDraft: raw.isDraft === true,
    fieldData,
  };
}

export class WebflowDataClient {
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(input: { accessToken: string; fetchImpl?: typeof fetch }) {
    this.accessToken = input.accessToken;
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  private async request<T>(input: {
    path: string;
    method?: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    operation: string;
  }): Promise<Result<T, WebflowClientError>> {
    const url = new URL(`${WEBFLOW_API_BASE_URL}${input.path}`);
    if (input.query) {
      for (const [key, value] of Object.entries(input.query)) {
        if (value === undefined || value === "") {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: input.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
          ...(input.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      });
    } catch (error) {
      return err({
        code: "webflow_request_failed",
        status: 0,
        message: error instanceof Error ? error.message : "Network request failed",
        operation: input.operation,
      });
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      return err({
        code: "webflow_request_failed",
        status: 429,
        message: retryAfter
          ? `Rate limited. Retry after ${retryAfter}s.`
          : "Rate limited by Webflow API.",
        operation: input.operation,
      });
    }

    if (!response.ok) {
      let message = response.statusText || "Webflow request failed";
      try {
        const body = (await response.json()) as { message?: string; code?: string };
        if (body.message) {
          message = body.message;
        } else if (body.code) {
          message = body.code;
        }
      } catch {
        // ignore parse errors
      }
      return err({
        code: "webflow_request_failed",
        status: response.status,
        message,
        operation: input.operation,
      });
    }

    if (response.status === 204) {
      return ok(undefined as T);
    }

    try {
      return ok((await response.json()) as T);
    } catch {
      return err({
        code: "webflow_request_failed",
        status: response.status,
        message: "Invalid JSON response from Webflow",
        operation: input.operation,
      });
    }
  }

  async listSites(): Promise<Result<WebflowSiteSummary[], WebflowClientError>> {
    const result = await this.request<{ sites?: Record<string, unknown>[] }>({
      path: "/sites",
      operation: "listSites",
    });
    if (result.ok === false) {
      return result;
    }
    const sites = (result.value.sites ?? []).map(parseSiteSummary);
    return ok(sites);
  }

  async getSite(siteId: string): Promise<Result<WebflowSite, WebflowClientError>> {
    const result = await this.request<Record<string, unknown>>({
      path: `/sites/${encodeURIComponent(siteId)}`,
      operation: "getSite",
    });
    if (result.ok === false) {
      return result;
    }
    const locales = parseSiteLocales(result.value.locales);
    if (!locales) {
      return err({
        code: "webflow_request_failed",
        status: 200,
        message: "Site response missing locales",
        operation: "getSite",
      });
    }
    return ok({
      ...parseSiteSummary(result.value),
      locales,
    });
  }

  async listCollections(
    siteId: string,
  ): Promise<Result<WebflowCollectionSummary[], WebflowClientError>> {
    const result = await this.request<{ collections?: Record<string, unknown>[] }>({
      path: `/sites/${encodeURIComponent(siteId)}/collections`,
      operation: "listCollections",
    });
    if (result.ok === false) {
      return result;
    }
    return ok((result.value.collections ?? []).map(parseCollectionSummary));
  }

  async getCollection(
    collectionId: string,
  ): Promise<Result<WebflowCollection, WebflowClientError>> {
    const result = await this.request<Record<string, unknown>>({
      path: `/collections/${encodeURIComponent(collectionId)}`,
      operation: "getCollection",
    });
    if (result.ok === false) {
      return result;
    }
    const fieldsRaw = Array.isArray(result.value.fields) ? result.value.fields : [];
    const fields = fieldsRaw
      .filter(
        (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
      )
      .map((field) => {
        const slug = typeof field.slug === "string" ? field.slug : "";
        const displayName =
          typeof field.displayName === "string" ? field.displayName : slug || "Field";
        const type = typeof field.type === "string" ? field.type : "PlainText";
        return {
          id: typeof field.id === "string" ? field.id : "",
          slug,
          displayName,
          type: type as WebflowCollection["fields"][number]["type"],
          isRequired: field.isRequired === true,
        };
      });
    return ok({
      ...parseCollectionSummary(result.value),
      fields,
    });
  }

  async listCollectionItems(input: {
    collectionId: string;
    cmsLocaleId: string;
    limit?: number;
    offset?: number;
    lastUpdatedGte?: string;
    sortLastUpdatedAsc?: boolean;
  }): Promise<
    Result<{ items: WebflowCollectionItem[]; pagination: WebflowPagination }, WebflowClientError>
  > {
    const limit = input.limit ?? WEBFLOW_COLLECTION_ITEMS_PAGE_SIZE;
    const query: Record<string, string | number | undefined> = {
      cmsLocaleId: input.cmsLocaleId,
      limit,
      offset: input.offset ?? 0,
    };
    if (input.lastUpdatedGte) {
      query["lastUpdated[gte]"] = input.lastUpdatedGte;
    }
    if (input.sortLastUpdatedAsc) {
      query.sortBy = "lastUpdated";
      query.sortOrder = "asc";
    }

    const result = await this.request<{
      items?: Record<string, unknown>[];
      pagination?: Partial<WebflowPagination>;
    }>({
      path: `/collections/${encodeURIComponent(input.collectionId)}/items`,
      query,
      operation: "listCollectionItems",
    });
    if (result.ok === false) {
      return result;
    }

    const paginationRaw = result.value.pagination ?? {};
    const pagination: WebflowPagination = {
      limit: Number(paginationRaw.limit ?? limit),
      offset: Number(paginationRaw.offset ?? input.offset ?? 0),
      total: Number(paginationRaw.total ?? 0),
    };

    return ok({
      items: (result.value.items ?? []).map(parseCollectionItem),
      pagination,
    });
  }

  async getCollectionItem(input: {
    collectionId: string;
    itemId: string;
    cmsLocaleId: string;
  }): Promise<Result<WebflowCollectionItem, WebflowClientError>> {
    const result = await this.request<Record<string, unknown>>({
      path: `/collections/${encodeURIComponent(input.collectionId)}/items/${encodeURIComponent(input.itemId)}`,
      query: { cmsLocaleId: input.cmsLocaleId },
      operation: "getCollectionItem",
    });
    if (result.ok === false) {
      return result;
    }
    return ok(parseCollectionItem(result.value));
  }

  /**
   * Adds a secondary-locale variant to an existing item. PATCH cannot create
   * variants, so push calls this when the target locale variant is missing
   * (see `runPushWebflowTranslations`). Translated content rides along in
   * the same request via `fieldData`.
   */
  async createCollectionItemVariant(input: {
    collectionId: string;
    itemId: string;
    cmsLocaleId: string;
    fieldData: WebflowCollectionItem["fieldData"];
  }): Promise<Result<WebflowCollectionItem, WebflowClientError>> {
    const result = await this.request<{ items?: Record<string, unknown>[] }>({
      path: `/collections/${encodeURIComponent(input.collectionId)}/items/insert`,
      method: "POST",
      body: {
        items: [
          {
            id: input.itemId,
            cmsLocaleIds: [input.cmsLocaleId],
            fieldData: input.fieldData,
          },
        ],
      },
      operation: "createCollectionItemVariant",
    });
    if (result.ok === false) {
      return result;
    }
    const [first] = result.value.items ?? [];
    if (!first) {
      return err({
        code: "webflow_request_failed",
        status: 200,
        message: "Create variant returned no items",
        operation: "createCollectionItemVariant",
      });
    }
    return ok(parseCollectionItem(first));
  }

  async patchCollectionItem(input: {
    collectionId: string;
    itemId: string;
    cmsLocaleId: string;
    fieldData: WebflowCollectionItem["fieldData"];
  }): Promise<Result<WebflowCollectionItem, WebflowClientError>> {
    const result = await this.request<Record<string, unknown>>({
      path: `/collections/${encodeURIComponent(input.collectionId)}/items/${encodeURIComponent(input.itemId)}`,
      method: "PATCH",
      query: { cmsLocaleId: input.cmsLocaleId },
      body: { fieldData: input.fieldData },
      operation: "patchCollectionItem",
    });
    if (result.ok === false) {
      return result;
    }
    return ok(parseCollectionItem(result.value));
  }

  async publishCollectionItem(input: {
    collectionId: string;
    itemId: string;
    cmsLocaleIds: string[];
  }): Promise<Result<void, WebflowClientError>> {
    return this.request<void>({
      path: `/collections/${encodeURIComponent(input.collectionId)}/items/${encodeURIComponent(input.itemId)}/publish`,
      method: "POST",
      body: { cmsLocaleIds: input.cmsLocaleIds },
      operation: "publishCollectionItem",
    });
  }
}

export async function probeWebflowScopes(client: WebflowDataClient): Promise<{
  sitesRead: boolean;
  cmsRead: boolean;
  cmsWrite: boolean;
  componentsRead: boolean;
}> {
  const scopes = {
    sitesRead: false,
    cmsRead: false,
    cmsWrite: false,
    componentsRead: false,
  };

  const sites = await client.listSites();
  if (sites.ok) {
    scopes.sitesRead = true;
    const siteId = sites.value[0]?.id;
    if (siteId) {
      const site = await client.getSite(siteId);
      if (site.ok) {
        const collections = await client.listCollections(siteId);
        scopes.cmsRead = collections.ok;
        if (collections.ok && collections.value[0]) {
          const collection = await client.getCollection(collections.value[0].id);
          scopes.cmsRead = collection.ok;
        }
      }
    }
  }

  return scopes;
}
