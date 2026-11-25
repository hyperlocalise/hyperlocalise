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
import type { BreadcrumbList, WithContext } from "schema-dts";

import type { AppLocale } from "@/lib/app-i18n/locales";
import { getLocalizedAbsoluteUrl } from "@/lib/seo/localized-alternates";

const BRAND_TITLE_SUFFIX = /\s*\|\s*Hyperlocalise\s*$/;

/** "Blog | Hyperlocalise" → "Blog". Lets breadcrumbs reuse localized page titles. */
export function stripBrandTitleSuffix(title: string): string {
  return title.replace(BRAND_TITLE_SUFFIX, "").trim();
}

export type BreadcrumbItem = {
  name: string;
  /** Locale-less path, for example `/blog/my-post`. */
  path: string;
};

/** BreadcrumbList rooted at the localized homepage. Pass the trail below the homepage. */
export function buildBreadcrumbJsonLd(
  locale: AppLocale,
  items: readonly BreadcrumbItem[],
): WithContext<BreadcrumbList> {
  const trail: BreadcrumbItem[] = [{ name: "Hyperlocalise", path: "/" }, ...items];

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: getLocalizedAbsoluteUrl(locale, item.path),
    })),
  };
}
