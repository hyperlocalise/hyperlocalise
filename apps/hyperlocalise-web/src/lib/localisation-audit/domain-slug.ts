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
  normalizeHostname,
  validatePublicHttpUrl,
  type SsrfGuardError,
} from "@/lib/security/ssrf-guard";

export type DomainIdentityError = SsrfGuardError | { code: "empty_slug" };

export type DomainIdentity = {
  sourceUrl: string;
  hostname: string;
  domainKey: string;
  domainSlug: string;
  origin: string;
};

const DOMAIN_SLUG_PATTERN = /^[a-z]+(?:-[a-z]+)*$/;

export function isValidDomainSlug(slug: string): boolean {
  return DOMAIN_SLUG_PATTERN.test(slug);
}

/**
 * SEO slug: lowercase a-z and hyphens only.
 * Dots and other non-letters become hyphens; digits are dropped.
 */
export function hostnameToDomainSlug(hostname: string): string {
  const normalized = normalizeHostname(hostname).replace(/^www\./, "");
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug;
}

export function normalizeDomainKey(hostname: string): string {
  return normalizeHostname(hostname).replace(/^www\./, "");
}

export function resolveDomainIdentity(
  inputUrl: string,
): Result<DomainIdentity, DomainIdentityError> {
  const trimmed = inputUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const urlResult = validatePublicHttpUrl(withProtocol);
  if (isErr(urlResult)) {
    return err(urlResult.error);
  }

  const url = urlResult.value;
  const hostname = normalizeHostname(url.hostname);
  const domainKey = normalizeDomainKey(hostname);
  const domainSlug = hostnameToDomainSlug(hostname);
  if (!domainSlug || !isValidDomainSlug(domainSlug)) {
    return err({ code: "empty_slug" });
  }

  return ok({
    sourceUrl: `${url.protocol}//${hostname}/`,
    hostname,
    domainKey,
    domainSlug,
    origin: `${url.protocol}//${hostname}`,
  });
}
