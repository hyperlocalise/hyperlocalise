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
} from "@/lib/og/create-marketing-og-image";

import { getIrisRouteMetadata } from "./iris-route-metadata";

export const alt = "Iris, the AI localisation engine for multilingual assets";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type IrisOgImageProps = {
  params: Promise<{ lang: string }>;
};

export default async function Image({ params }: IrisOgImageProps) {
  const { lang } = await params;
  const intl = getIntlShape(lang);
  const metadata = getIrisRouteMetadata(intl);

  return createMarketingOgImage({
    heading: metadata.ogHeading,
    description: metadata.description,
    locale: lang,
  });
}
