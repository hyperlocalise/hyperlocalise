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
import {
  assertResolvablePublicHttpUrl,
  readBoundedResponseBody,
  withPublicHttpFetch,
} from "@/lib/security/public-http-fetch";

import { extractLocalisationPage, normalizeAuditUrl } from "./parser";
import type { AuditedPage, LocalisationAuditError } from "./types";

const MAX_AUDIT_PAGE_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

type RawFetchResult =
  | { kind: "redirect"; location: string; status: number }
  | { kind: "response"; status: number; contentType: string; body: Uint8Array };

function mapFetchFailure(error: unknown): LocalisationAuditError {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("too large")) {
    return {
      code: "audit_response_too_large",
      message: "The page exceeds the audit response size limit.",
    };
  }
  return { code: "audit_fetch_failed", message: "The page could not be fetched." };
}

export async function fetchAuditPage(
  value: string,
  options: { locale?: string | null; isPrimary?: boolean; signal?: AbortSignal } = {},
): Promise<Result<AuditedPage, LocalisationAuditError>> {
  let currentUrl = normalizeAuditUrl(value);
  if (!currentUrl) {
    return err({ code: "invalid_audit_url", message: "Enter a valid HTTP(S) URL." });
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const validation = await assertResolvablePublicHttpUrl(currentUrl);
    if (isErr(validation)) {
      return err({
        code: "audit_url_not_public",
        message: "The URL must resolve to a public internet address.",
      });
    }

    const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    let fetched: RawFetchResult;
    try {
      fetched = await withPublicHttpFetch(
        currentUrl,
        {
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": "Hyperlocalise-Localisation-Audit/1.0",
          },
          redirect: "manual",
          signal,
        },
        async (response) => {
          if (response.status >= 300 && response.status < 400) {
            return {
              kind: "redirect" as const,
              location: response.headers.get("location") ?? "",
              status: response.status,
            };
          }
          return {
            kind: "response" as const,
            status: response.status,
            contentType: response.headers.get("content-type") ?? "",
            body: await readBoundedResponseBody(response, MAX_AUDIT_PAGE_BYTES),
          };
        },
      );
    } catch (error) {
      return err(mapFetchFailure(error));
    }

    if (fetched.kind === "redirect") {
      if (!fetched.location || redirectCount === MAX_REDIRECTS) {
        return err({
          code: "audit_fetch_failed",
          message: "The page redirected too many times.",
        });
      }
      const redirectUrl = normalizeAuditUrl(fetched.location, currentUrl);
      if (!redirectUrl) {
        return err({
          code: "audit_fetch_failed",
          message: "The page redirected to an invalid URL.",
        });
      }
      currentUrl = redirectUrl;
      continue;
    }

    if (fetched.status < 200 || fetched.status >= 300) {
      return ok({
        url: currentUrl,
        locale: options.locale ?? null,
        isPrimary: options.isPrimary ?? false,
        status: fetched.status === 401 || fetched.status === 403 ? "blocked" : "failed",
        failureCode: `http_${fetched.status}`,
        httpStatus: fetched.status,
      });
    }

    if (
      !fetched.contentType.toLowerCase().includes("text/html") &&
      !fetched.contentType.toLowerCase().includes("application/xhtml+xml")
    ) {
      return err({
        code: "audit_response_not_html",
        message: "The URL did not return an HTML document.",
      });
    }

    const html = new TextDecoder("utf-8", { fatal: false }).decode(fetched.body);
    return ok({
      url: currentUrl,
      locale: options.locale ?? null,
      isPrimary: options.isPrimary ?? false,
      status: "extracted",
      httpStatus: fetched.status,
      extracted: extractLocalisationPage(html, currentUrl),
    });
  }

  return err({ code: "audit_fetch_failed", message: "The page could not be fetched." });
}
