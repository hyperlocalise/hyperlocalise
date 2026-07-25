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

import { getPricingRouteMetadata } from "./pricing-route-metadata";

export const alt = "Hyperlocalise Pricing";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type PricingOgImageProps = {
  params: Promise<{ lang: string }>;
};

export default async function Image({ params }: PricingOgImageProps) {
  const { lang } = await params;
  const intl = getIntlShape(lang);
  const metadata = getPricingRouteMetadata(intl);

  return createMarketingOgImage({
    heading: toMarketingOgHeading(metadata.title),
    description: metadata.description,
  });
}
