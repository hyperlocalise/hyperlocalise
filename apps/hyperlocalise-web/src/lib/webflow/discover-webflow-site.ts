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
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import type { WebflowCollectionSummary } from "./types";

import { WebflowDataClient, probeWebflowScopes } from "./client";
import type { WebflowClientError, WebflowDiscoveryResult } from "./types";

export async function discoverWebflowWithToken(input: {
  accessToken: string;
  siteId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<Result<WebflowDiscoveryResult, WebflowClientError>> {
  const client = new WebflowDataClient({
    accessToken: input.accessToken,
    fetchImpl: input.fetchImpl,
  });

  const sitesResult = await client.listSites();
  if (isErr(sitesResult)) {
    return sitesResult;
  }

  const siteId = input.siteId?.trim() || sitesResult.value[0]?.id || "";
  let site = null;
  let collections: WebflowCollectionSummary[] = [];
  let locales = null;

  if (siteId) {
    const siteResult = await client.getSite(siteId);
    if (isErr(siteResult)) {
      return siteResult;
    }
    site = siteResult.value;
    locales = site.locales;

    const collectionsResult = await client.listCollections(siteId);
    if (isErr(collectionsResult)) {
      return collectionsResult;
    }
    collections = collectionsResult.value;
  }

  const scopes = await probeWebflowScopes(client);

  return ok({
    sites: sitesResult.value,
    site,
    collections,
    locales,
    scopes,
  });
}

export function formatWebflowValidationMessage(input: {
  scopes: WebflowDiscoveryResult["scopes"];
  requireWrite?: boolean;
}): { status: "valid" | "invalid"; message: string | null } {
  if (!input.scopes.sitesRead) {
    return {
      status: "invalid",
      message: "Missing sites:read scope. Create a site token with Sites read access.",
    };
  }
  if (!input.scopes.cmsRead) {
    return {
      status: "invalid",
      message: "Missing cms:read scope. Add CMS read access to the site token.",
    };
  }
  if (input.requireWrite && !input.scopes.cmsWrite) {
    return {
      status: "invalid",
      message: "Missing cms:write scope required for push writeback.",
    };
  }
  return { status: "valid", message: null };
}

export async function validateWebflowAccessToken(input: {
  accessToken: string;
  siteId: string;
  fetchImpl?: typeof fetch;
}): Promise<
  Result<{ discovery: WebflowDiscoveryResult; message: string | null }, WebflowClientError>
> {
  const discovery = await discoverWebflowWithToken({
    accessToken: input.accessToken,
    siteId: input.siteId,
    fetchImpl: input.fetchImpl,
  });
  if (isErr(discovery)) {
    if (discovery.error.status === 401) {
      return err({
        ...discovery.error,
        message: "Invalid or expired Webflow site token.",
      });
    }
    return discovery;
  }

  if (!discovery.value.site) {
    return err({
      code: "webflow_request_failed",
      status: 404,
      message: "Site not found for this token.",
      operation: "validateWebflowAccessToken",
    });
  }

  const validation = formatWebflowValidationMessage({ scopes: discovery.value.scopes });
  if (validation.status === "invalid") {
    return err({
      code: "webflow_request_failed",
      status: 403,
      message: validation.message ?? "Missing required Webflow scopes.",
      operation: "validateWebflowAccessToken",
    });
  }

  return ok({
    discovery: discovery.value,
    message: validation.message,
  });
}
