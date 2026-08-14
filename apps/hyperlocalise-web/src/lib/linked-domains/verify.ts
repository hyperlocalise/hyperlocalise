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
import { resolveTxt } from "node:dns/promises";

import type { LinkedDomainVerificationMethod } from "@/lib/database/schema/linked-domains";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  readBoundedResponseBody,
  withPublicHttpFetch,
} from "@/lib/security/public-http-fetch";

import {
  dnsTxtRecordMatchesToken,
  htmlBodyMatchesToken,
  htmlContainsVerificationMeta,
  linkedDomainDnsTxtHost,
} from "./challenges";
import { LINKED_DOMAIN_HTML_PATH, type LinkedDomainError } from "./types";

export type ResolveTxtFn = (hostname: string) => Promise<string[][]>;

export type PublicFetchFn = typeof withPublicHttpFetch;

const MAX_VERIFY_RESPONSE_BYTES = 256 * 1024;

export async function verifyLinkedDomainChallenge(input: {
  method: LinkedDomainVerificationMethod;
  domainKey: string;
  sourceUrl: string;
  token: string;
  resolveTxt?: ResolveTxtFn;
  fetchPublic?: PublicFetchFn;
}): Promise<Result<{ method: LinkedDomainVerificationMethod }, LinkedDomainError>> {
  switch (input.method) {
    case "dns_txt":
      return verifyDnsTxt(input);
    case "html_file":
      return verifyHtmlFile(input);
    case "meta_tag":
      return verifyMetaTag(input);
    default:
      return err({
        code: "verification_not_found",
        message: "Unknown verification method.",
      });
  }
}

async function verifyDnsTxt(input: {
  domainKey: string;
  token: string;
  resolveTxt?: ResolveTxtFn;
}): Promise<Result<{ method: LinkedDomainVerificationMethod }, LinkedDomainError>> {
  const host = linkedDomainDnsTxtHost(input.domainKey);
  const lookup = input.resolveTxt ?? resolveTxt;
  let records: string[][];
  try {
    records = await lookup(host);
  } catch {
    return err({
      code: "verification_not_found",
      message: "DNS TXT record was not found.",
    });
  }

  const flat = records.flatMap((chunks) => chunks.join(""));
  if (flat.some((record) => dnsTxtRecordMatchesToken(record, input.token))) {
    return ok({ method: "dns_txt" });
  }

  return err({
    code: "verification_mismatch",
    message: "DNS TXT record did not match the verification token.",
  });
}

async function verifyHtmlFile(input: {
  sourceUrl: string;
  token: string;
  fetchPublic?: PublicFetchFn;
}): Promise<Result<{ method: LinkedDomainVerificationMethod }, LinkedDomainError>> {
  const origin = new URL(input.sourceUrl).origin;
  const url = `${origin}${LINKED_DOMAIN_HTML_PATH}`;
  const fetchPublic = input.fetchPublic ?? withPublicHttpFetch;

  try {
    const body = await fetchPublic(
      url,
      { method: "GET", redirect: "error" },
      async (response) => {
        if (!response.ok) {
          throw new Error(`http_${response.status}`);
        }
        const bytes = await readBoundedResponseBody(response, MAX_VERIFY_RESPONSE_BYTES);
        return new TextDecoder("utf-8").decode(bytes);
      },
      { maxResponseSize: MAX_VERIFY_RESPONSE_BYTES },
    );

    if (htmlBodyMatchesToken(body, input.token)) {
      return ok({ method: "html_file" });
    }

    return err({
      code: "verification_mismatch",
      message: "Verification file contents did not match the token.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch_failed";
    if (message.startsWith("http_")) {
      return err({
        code: "verification_not_found",
        message: "Verification file was not found.",
      });
    }
    return err({
      code: "verification_fetch_failed",
      message: "Could not fetch the verification file.",
    });
  }
}

async function verifyMetaTag(input: {
  sourceUrl: string;
  token: string;
  fetchPublic?: PublicFetchFn;
}): Promise<Result<{ method: LinkedDomainVerificationMethod }, LinkedDomainError>> {
  const fetchPublic = input.fetchPublic ?? withPublicHttpFetch;

  try {
    const html = await fetchPublic(
      input.sourceUrl,
      { method: "GET", redirect: "error" },
      async (response) => {
        if (!response.ok) {
          throw new Error(`http_${response.status}`);
        }
        const bytes = await readBoundedResponseBody(response, MAX_VERIFY_RESPONSE_BYTES);
        return new TextDecoder("utf-8").decode(bytes);
      },
      { maxResponseSize: MAX_VERIFY_RESPONSE_BYTES },
    );

    if (htmlContainsVerificationMeta(html, input.token)) {
      return ok({ method: "meta_tag" });
    }

    return err({
      code: "verification_mismatch",
      message: "Homepage meta tag did not match the verification token.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch_failed";
    if (message.startsWith("http_")) {
      return err({
        code: "verification_not_found",
        message: "Homepage was not reachable for meta verification.",
      });
    }
    return err({
      code: "verification_fetch_failed",
      message: "Could not fetch the homepage for meta verification.",
    });
  }
}
