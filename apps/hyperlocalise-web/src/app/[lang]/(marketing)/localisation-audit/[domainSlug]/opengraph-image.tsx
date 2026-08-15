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
import { isValidDomainSlug } from "@/lib/localisation-audit/domain-slug";
import { findLocalisationAuditBySlug } from "@/lib/localisation-audit/store";
import {
  createLocalisationAuditResultOgImage,
  marketingOgImageContentType,
  marketingOgImageSize,
} from "@/lib/og/create-localisation-audit-result-og-image";
import { createMarketingOgImage, toMarketingOgHeading } from "@/lib/og/create-marketing-og-image";

export const alt = "Hyperlocalise localisation audit result";
export const size = marketingOgImageSize;
export const contentType = marketingOgImageContentType;

type LocalisationAuditResultOgImageProps = {
  params: Promise<{ lang: string; domainSlug: string }>;
};

export default async function Image({ params }: LocalisationAuditResultOgImageProps) {
  const { lang, domainSlug } = await params;
  const intl = getIntlShape(lang);

  if (!isValidDomainSlug(domainSlug)) {
    return createMarketingOgImage({
      heading: "Localisation audit",
      description: intl.formatMessage({
        defaultMessage: "The best agentic localisation platform",
        id: "CYGau9cDQe",
        description: "Open Graph fallback description for unknown pages",
      }),
    });
  }

  const audit = await findLocalisationAuditBySlug(domainSlug);
  if (!audit) {
    return createMarketingOgImage({
      heading: toMarketingOgHeading("Localisation audit | Hyperlocalise"),
      description: intl.formatMessage({
        defaultMessage: "The best agentic localisation platform",
        id: "CYGau9cDQe",
        description: "Open Graph fallback description for unknown pages",
      }),
    });
  }

  const dimensionScores = audit.teaser?.dimensionScores ?? audit.report?.dimensionScores ?? null;

  return createLocalisationAuditResultOgImage({
    domainKey: audit.domainKey,
    dimensionScores,
  });
}
