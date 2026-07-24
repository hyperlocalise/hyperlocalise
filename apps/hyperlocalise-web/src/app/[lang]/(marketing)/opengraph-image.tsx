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

export const alt = "Hyperlocalise";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type HomeOgImageProps = {
  params: Promise<{ lang: string }>;
};

export default async function Image({ params }: HomeOgImageProps) {
  const { lang } = await params;
  const intl = getIntlShape(lang);

  const title = intl.formatMessage({
    defaultMessage: "Hyperlocalise | The Best Agentic Localisation Platform",
    id: "9EV17CGa2+",
    description: "Page title for the marketing homepage",
  });
  const description = intl.formatMessage({
    defaultMessage: "The best agentic localisation platform to launch globally in days.",
    id: "cdezPwXx10",
    description:
      "Open Graph meta description for the marketing homepage (shorter than the main description)",
  });

  return createMarketingOgImage({
    heading: toMarketingOgHeading(title),
    description,
  });
}
