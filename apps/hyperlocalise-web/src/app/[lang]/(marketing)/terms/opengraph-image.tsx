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

export const alt = "Hyperlocalise terms of service";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type TermsOgImageProps = {
  params: Promise<{ lang: string }>;
};

export default async function Image({ params }: TermsOgImageProps) {
  const { lang } = await params;
  const intl = getIntlShape(lang);

  const heading = intl.formatMessage({
    defaultMessage: "Terms of service",
    id: "zizlseLf1J",
    description: "Open Graph heading for the terms of service page",
  });
  const description = intl.formatMessage({
    defaultMessage:
      "The baseline terms that govern use of Hyperlocalise websites, docs, and services.",
    id: "gvMFvBmTU/",
    description: "Open Graph description for the terms of service page",
  });

  return createMarketingOgImage({
    heading,
    description,
  });
}
