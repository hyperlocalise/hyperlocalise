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
import { GoSvcClientError } from "./go-svc-client";

const TRANSPORT_ERROR_CODES = new Set(["network_error", "missing_access_token"]);

/** go-svc answers these when the route still belongs on the Next.js app. */
const CAT_DEFERRED_TO_APP = new Set(["provider_cat_deferred", "string_context_deferred"]);

export function isCatDeferredToApp(error: unknown): boolean {
  return error instanceof GoSvcClientError && CAT_DEFERRED_TO_APP.has(error.code);
}

export function goSvcErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof GoSvcClientError && TRANSPORT_ERROR_CODES.has(error.code)) {
    console.warn("[go-svc] browser request failed", error);
    return fallback;
  }

  return error instanceof Error ? error.message : fallback;
}
