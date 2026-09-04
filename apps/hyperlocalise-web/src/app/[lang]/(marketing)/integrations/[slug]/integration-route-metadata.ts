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
import type { IntlShape } from "@formatjs/intl";

import { getMarketingIntegrationBySlug } from "@/components/marketing/integrations/integrations-page-content";

export function getIntegrationRouteMetadata(intl: IntlShape, slug: string) {
  const integration = getMarketingIntegrationBySlug(intl.locale, slug);

  if (!integration) {
    return null;
  }

  return {
    title: integration.metadata.title,
    description: integration.metadata.description,
    keywords: integration.metadata.keywords,
  };
}
