"use client";

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
import Link from "next/link";

import type { MarketingIntegration } from "@/components/marketing/integrations/integrations-page-content";
import { IntegrationLogoMark } from "@/components/marketing/integrations/integration-logo-mark";
import { getIntegrationPath } from "@/lib/integrations/integration-path";
import { Badge } from "@/components/ui/badge";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyMuted, TypographyP } from "@/components/ui/typography";

type IntegrationCardProps = {
  integration: MarketingIntegration;
  lang: string;
  categoryLabel: string;
};

export function IntegrationCard({ integration, lang, categoryLabel }: IntegrationCardProps) {
  const href = getIntegrationPath(lang, integration.slug);

  if (!href) {
    return null;
  }

  return (
    <Link className="group block h-full" href={href}>
      <Box
        background="surface"
        border="standard"
        borderRadius="large"
        padding="3u"
        display="flex"
        height="full"
      >
        <Rows spacing="2u">
          <IntegrationLogoMark
            iconKey={integration.iconKey}
            logoSrc={integration.logoSrc}
            name={integration.name}
          />
          <Rows spacing="1u">
            <TypographyP weight="medium">{integration.name}</TypographyP>
            <TypographyMuted size="small">{integration.tagline}</TypographyMuted>
          </Rows>
          <Badge variant="secondary">{categoryLabel}</Badge>
        </Rows>
      </Box>
    </Link>
  );
}
