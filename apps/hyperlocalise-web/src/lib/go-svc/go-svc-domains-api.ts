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
import type { DomainResearchCatalog } from "@/lib/domains/research-prototype";
import type { GscDateRange } from "@/lib/gsc/constants";
import type { GscInspection, GscPerformanceSnapshot } from "@/lib/gsc/types";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";

import type { GoSvcRequestOptions } from "./go-svc-client.types";
import { GoSvcClientError, orgPath, type GoSvcRequest } from "./go-svc-request";

function researchPath(organizationSlug: string, linkedDomainId: string, ...rest: string[]) {
  return orgPath(organizationSlug, "domains", linkedDomainId, "research", ...rest);
}

function searchConsolePath(organizationSlug: string, linkedDomainId: string, ...rest: string[]) {
  return orgPath(organizationSlug, "domains", linkedDomainId, "search-console", ...rest);
}

async function readJsonBody<T>(response: Response): Promise<T> {
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

async function ensureOk(response: Response, body: { message?: string; error?: string }) {
  if (response.ok) {
    return;
  }
  throw new GoSvcClientError({
    code: typeof body.error === "string" && body.error ? body.error : "http_error",
    message:
      typeof body.message === "string" && body.message
        ? body.message
        : `go-svc request failed with status ${response.status}`,
    status: response.status,
  });
}

export class GoSvcDomainsApi {
  constructor(private readonly request: GoSvcRequest) {}

  async getResearch(
    organizationSlug: string,
    linkedDomainId: string,
    options: GoSvcRequestOptions = {},
  ): Promise<{ catalog: DomainResearchCatalog | null; linkedDomain?: LinkedDomainPublic }> {
    const response = await this.request.response(
      researchPath(organizationSlug, linkedDomainId),
      options,
    );
    if (response.status === 404) {
      return { catalog: null, linkedDomain: undefined };
    }
    const body = await readJsonBody<{
      catalog?: DomainResearchCatalog;
      linkedDomain?: LinkedDomainPublic;
      message?: string;
      error?: string;
    }>(response);
    await ensureOk(response, body);
    if (!body.catalog) {
      throw new GoSvcClientError({
        code: "invalid_response",
        message: "go-svc returned research without a catalog",
        status: response.status,
      });
    }
    return { catalog: body.catalog, linkedDomain: body.linkedDomain };
  }

  expandKeywords(
    organizationSlug: string,
    linkedDomainId: string,
    body: { seedKeyword: string; marketId: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ ideas: import("@/lib/domains/research-prototype").KeywordIdea[] }>(
      researchPath(organizationSlug, linkedDomainId, "keywords", "expand"),
      { method: "POST", body, ...options },
    );
  }

  saveKeywords(
    organizationSlug: string,
    linkedDomainId: string,
    body: {
      marketId: string;
      seedKeyword?: string;
      keywords: Array<{
        keyword: string;
        volume: number;
        kd: number;
        cpc: number;
        intent: string;
      }>;
    },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(researchPath(organizationSlug, linkedDomainId, "keywords", "save"), {
      method: "POST",
      body,
      ...options,
    });
  }

  inspectSerp(
    organizationSlug: string,
    linkedDomainId: string,
    body: { keyword: string; marketId: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ results: import("@/lib/domains/research-prototype").SerpResult[] }>(
      researchPath(organizationSlug, linkedDomainId, "serp"),
      { method: "POST", body, ...options },
    );
  }

  trackRanks(
    organizationSlug: string,
    linkedDomainId: string,
    body: {
      marketId: string;
      device?: "desktop" | "mobile";
      keywords: Array<{
        keyword: string;
        volume?: number;
        kd?: number;
        cpc?: number;
        intent?: string;
      }>;
    },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(researchPath(organizationSlug, linkedDomainId, "ranks"), {
      method: "POST",
      body,
      ...options,
    });
  }

  refreshRanks(
    organizationSlug: string,
    linkedDomainId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(researchPath(organizationSlug, linkedDomainId, "ranks", "refresh"), {
      method: "POST",
      ...options,
    });
  }

  async getSearchConsole(
    organizationSlug: string,
    linkedDomainId: string,
    query: { dateRange: GscDateRange; locale?: string | null },
    options: GoSvcRequestOptions = {},
  ): Promise<GscPerformanceSnapshot> {
    const response = await this.request.response(
      searchConsolePath(organizationSlug, linkedDomainId),
      { query, ...options },
    );
    const body = await readJsonBody<{
      searchConsole?: GscPerformanceSnapshot;
      message?: string;
      error?: string;
    }>(response);
    await ensureOk(response, body);
    if (!body.searchConsole) {
      throw new GoSvcClientError({
        code: "invalid_response",
        message: "go-svc returned Search Console without a snapshot",
        status: response.status,
      });
    }
    return body.searchConsole;
  }

  inspectSearchConsole(
    organizationSlug: string,
    linkedDomainId: string,
    body: { url: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ inspection: GscInspection }>(
      searchConsolePath(organizationSlug, linkedDomainId, "inspect"),
      { method: "POST", body, ...options },
    );
  }
}
