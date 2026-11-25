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

import type { ProductPageSlug } from "@/components/marketing/product/product-page-content";
import { getIntlShape } from "@/lib/app-i18n/intl";
import type { AppLocale } from "@/lib/app-i18n/locales";
import { buildBreadcrumbJsonLd, stripBrandTitleSuffix } from "@/lib/seo/breadcrumb-json-ld";

import { getProductRouteMetadata } from "./product-route-metadata";

export function buildProductBreadcrumbJsonLd(
  slug: ProductPageSlug,
  locale: AppLocale,
): WithContext<BreadcrumbList> | null {
  const metadata = getProductRouteMetadata(slug, getIntlShape(locale));
  if (!metadata) {
    return null;
  }

  return buildBreadcrumbJsonLd(locale, [
    { name: stripBrandTitleSuffix(metadata.title), path: `/product/${slug}` },
  ]);
}
