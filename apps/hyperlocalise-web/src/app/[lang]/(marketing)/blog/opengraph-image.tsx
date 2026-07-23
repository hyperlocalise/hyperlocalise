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
import { getIntlShape } from "@/lib/app-i18n/intl";
import {
  createMarketingOgImage,
  marketingOgImageContentType,
  marketingOgImageSize,
  toMarketingOgHeading,
} from "@/lib/og/create-marketing-og-image";

import { getBlogRouteMetadata } from "./blog-route-metadata";

export const alt = "Hyperlocalise Blog";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type BlogIndexOgImageProps = {
  params: Promise<{ lang: string }>;
};

export default async function Image({ params }: BlogIndexOgImageProps) {
  const { lang } = await params;
  const intl = getIntlShape(lang);
  const metadata = getBlogRouteMetadata(intl);

  return createMarketingOgImage({
    heading: toMarketingOgHeading(metadata.title),
    description: metadata.description,
  });
}
