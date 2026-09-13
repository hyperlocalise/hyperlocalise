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
import { createHmac } from "node:crypto";

import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import type { GscDateRange } from "./constants";
import type { GscInspection, GscProviderError, GscSearchAnalyticsRow, GscSite } from "./types";

type GoSvcErrorBody = {
  error?: string;
  message?: string;
};

function goSvcBaseUrl() {
  return (env.GO_SVC_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
}

function goSvcResearchToken() {
  return createHmac("sha256", env.WORKOS_COOKIE_PASSWORD ?? "")
    .update("go-svc-research")
    .digest("hex");
}

function mapProviderError(status: number, body: GoSvcErrorBody): GscProviderError {
  if (status === 401 || body.error === "gsc_auth_failed") {
    return {
      code: "gsc_auth_failed",
      message: body.message || "Search Console denied access to this property.",
    };
  }
  if (status === 429 || body.error === "gsc_rate_limited") {
    return {
      code: "gsc_rate_limited",
      message: body.message || "Search Console rate limited the request.",
    };
  }
  if (status === 404 || body.error === "gsc_not_found") {
    return {
      code: "gsc_not_found",
      message: body.message || "Search Console property was not found.",
    };
  }
  if (status === 400 || body.error === "gsc_validation_error") {
    return {
      code: "gsc_validation_error",
      message: body.message || "Search Console rejected the request.",
    };
  }
  return {
    code: "gsc_upstream_unavailable",
    message: body.message || "Search Console request failed.",
  };
}

async function postGoSvc<T>(
  path: string,
  body: unknown,
  options: { cookie?: string; signal?: AbortSignal },
): Promise<Result<T, GscProviderError>> {
  try {
    const response = await fetch(`${goSvcBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Go-Svc-Research-Token": goSvcResearchToken(),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T & GoSvcErrorBody;
    if (!response.ok) {
      return err(mapProviderError(response.status, payload));
    }
    return ok(payload);
  } catch {
    return err({
      code: "provider_unavailable",
      message: "The Search Console service is unavailable.",
    });
  }
}

export type GscProvider = {
  listSites(input: {
    accessToken: string;
    cookie?: string;
    signal?: AbortSignal;
  }): Promise<Result<GscSite[], GscProviderError>>;
  queryPerformance(input: {
    accessToken: string;
    siteUrl: string;
    dateRange: GscDateRange;
    dimensions?: string[];
    country?: string | null;
    rowLimit?: number;
    cookie?: string;
    signal?: AbortSignal;
  }): Promise<
    Result<{ rows: GscSearchAnalyticsRow[]; startDate: string; endDate: string }, GscProviderError>
  >;
  inspectUrl(input: {
    accessToken: string;
    siteUrl: string;
    inspectionUrl: string;
    languageCode?: string;
    cookie?: string;
    signal?: AbortSignal;
  }): Promise<Result<GscInspection | null, GscProviderError>>;
};

export function createGoSvcGscProvider(): GscProvider {
  return {
    async listSites(input) {
      const result = await postGoSvc<{ sites?: GscSite[] }>(
        "/v1/domains/gsc/sites",
        { accessToken: input.accessToken },
        input,
      );
      if (!result.ok) {
        return result;
      }
      return ok(result.value.sites ?? []);
    },
    async queryPerformance(input) {
      const result = await postGoSvc<{
        rows?: GscSearchAnalyticsRow[];
        startDate?: string;
        endDate?: string;
      }>(
        "/v1/domains/gsc/performance",
        {
          accessToken: input.accessToken,
          siteUrl: input.siteUrl,
          dateRange: input.dateRange,
          dimensions: input.dimensions,
          country: input.country ?? undefined,
          rowLimit: input.rowLimit,
        },
        input,
      );
      if (!result.ok) {
        return result;
      }
      return ok({
        rows: result.value.rows ?? [],
        startDate: result.value.startDate ?? "",
        endDate: result.value.endDate ?? "",
      });
    },
    async inspectUrl(input) {
      const result = await postGoSvc<{ inspection?: GscInspection | null }>(
        "/v1/domains/gsc/inspect",
        {
          accessToken: input.accessToken,
          siteUrl: input.siteUrl,
          inspectionUrl: input.inspectionUrl,
          languageCode: input.languageCode,
        },
        input,
      );
      if (!result.ok) {
        return result;
      }
      return ok(result.value.inspection ?? null);
    },
  };
}

let activeProvider: GscProvider = createGoSvcGscProvider();

export function getGscProvider(): GscProvider {
  return activeProvider;
}

export function setGscProviderForTests(provider: GscProvider) {
  activeProvider = provider;
}

export function resetGscProviderForTests() {
  activeProvider = createGoSvcGscProvider();
}
