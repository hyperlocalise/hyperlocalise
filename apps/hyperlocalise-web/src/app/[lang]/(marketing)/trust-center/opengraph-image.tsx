/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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

export const alt = "Hyperlocalise Trust Center";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type TrustCenterOgImageProps = {
  params: Promise<{ lang: string }>;
};

export default async function Image({ params }: TrustCenterOgImageProps) {
  const { lang } = await params;
  const intl = getIntlShape(lang);

  const heading = intl.formatMessage({
    defaultMessage: "Trust Center",
    id: "zVPPsHIMWR",
    description: "Open Graph heading for the Trust Center page",
  });
  const description = intl.formatMessage({
    defaultMessage:
      "Security, subprocessor, privacy, and certification status information for Hyperlocalise.",
    id: "VBPz2AKNYS",
    description: "Open Graph description for the Trust Center page",
  });

  return createMarketingOgImage({
    heading,
    description,
  });
}
