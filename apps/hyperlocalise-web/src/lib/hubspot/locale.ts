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

import { BlogPostLanguageEnum } from "@hubspot/api-client/lib/codegen/cms/blogs/blog_posts/models/BlogPost";
import { PageLanguageEnum } from "@hubspot/api-client/lib/codegen/cms/pages/models/Page";
import { EmailUpdateRequestLanguageEnum } from "@hubspot/api-client/lib/codegen/marketing/emails/models/EmailUpdateRequest";
import { HubSpotFormConfigurationLanguageEnum } from "@hubspot/api-client/lib/codegen/marketing/forms/models/HubSpotFormConfiguration";

import type { HubspotResourceKind } from "./constants";

export type HubspotSurface = HubspotResourceKind;

const ACCEPTED_CODES: Record<HubspotSurface, ReadonlySet<string>> = {
  email: new Set(Object.values(EmailUpdateRequestLanguageEnum)),
  form: new Set(Object.values(HubSpotFormConfigurationLanguageEnum)),
  blog: new Set(Object.values(BlogPostLanguageEnum)),
  "landing-page": new Set(Object.values(PageLanguageEnum)),
  "website-page": new Set(Object.values(PageLanguageEnum)),
};

export function normalizeHubspotLocaleTag(locale: string): string {
  return locale.trim().replace(/_/g, "-").toLowerCase();
}

function aliasHubspotCode(code: string, accepted: ReadonlySet<string>): string | null {
  if (code === "zh-hans" || code === "zh-cn") {
    return accepted.has("zh-cn") ? "zh-cn" : null;
  }
  if (code === "zh-hant" || code === "zh-tw") {
    if (accepted.has("zh-tw")) {
      return "zh-tw";
    }
    return accepted.has("zh-hk") ? "zh-hk" : null;
  }
  if (code === "nb" || code === "nn" || code === "no") {
    return accepted.has("no-no") ? "no-no" : null;
  }
  if (code === "he") {
    return accepted.has("he-il") ? "he-il" : null;
  }
  return null;
}

/**
 * Map a project locale onto a HubSpot language code for one surface.
 * Regional tags stay distinct when HubSpot accepts them (`fr-ca` stays `fr-ca`).
 * Returns null when the surface has no matching code.
 */
export function mapProjectLocaleToHubspot(locale: string, surface: HubspotSurface): string | null {
  const accepted = ACCEPTED_CODES[surface];
  const normalized = normalizeHubspotLocaleTag(locale);
  if (!normalized) {
    return null;
  }
  if (accepted.has(normalized)) {
    return normalized;
  }
  const aliased = aliasHubspotCode(normalized, accepted);
  if (aliased) {
    return aliased;
  }
  const primary = normalized.split("-")[0] ?? "";
  if (primary && primary !== normalized && accepted.has(primary)) {
    return primary;
  }
  return null;
}

export function hubspotLanguageMatchesSource(input: {
  objectLanguage: string | null | undefined;
  projectSourceLocale: string;
  surface: HubspotSurface;
}): boolean {
  const raw = input.objectLanguage?.trim();
  if (!raw) {
    return true;
  }
  const objectCode = mapProjectLocaleToHubspot(raw, input.surface);
  const sourceCode = mapProjectLocaleToHubspot(input.projectSourceLocale, input.surface);
  if (!objectCode || !sourceCode) {
    return false;
  }
  return objectCode === sourceCode;
}

export type HubspotLocaleAssignment = {
  mapped: Array<{ locale: string; code: string }>;
  collisions: Array<{ locale: string; code: string; keptLocale: string }>;
  unmapped: string[];
};

/** First project locale wins when two tags collapse to one HubSpot code. */
export function assignHubspotLocales(
  locales: readonly string[],
  surface: HubspotSurface,
): HubspotLocaleAssignment {
  const used = new Map<string, string>();
  const mapped: HubspotLocaleAssignment["mapped"] = [];
  const collisions: HubspotLocaleAssignment["collisions"] = [];
  const unmapped: string[] = [];
  for (const locale of locales) {
    const code = mapProjectLocaleToHubspot(locale, surface);
    if (!code) {
      unmapped.push(locale);
      continue;
    }
    const keptLocale = used.get(code);
    if (keptLocale) {
      collisions.push({ locale, code, keptLocale });
      continue;
    }
    used.set(code, locale);
    mapped.push({ locale, code });
  }
  return { mapped, collisions, unmapped };
}

/** Locale copies keep the full project tag, even when HubSpot stores a shorter code. */
export function hubspotCopyName(sourceName: string, locale: string): string {
  const base = sourceName.trim() || "Content";
  return `${base} [${locale.trim() || "locale"}]`;
}

export function isHubspotLocaleCopyName(name: string): boolean {
  return /\[[^\]]+\]\s*$/.test(name.trim());
}
