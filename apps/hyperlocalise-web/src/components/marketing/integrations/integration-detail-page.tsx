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
import { ArrowLeft01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { MarketingIntegration } from "@/components/marketing/integrations/integrations-page-content";
import {
  getCategoryLabelForIntegration,
  getIntegrationDetailCopy,
} from "@/components/marketing/integrations/integrations-page-content";
import { IntegrationLogoMark } from "@/components/marketing/integrations/integration-logo-mark";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { Separator } from "@/components/ui/separator";
import {
  TypographyH1,
  TypographyH2,
  TypographyMuted,
  TypographyP,
} from "@/components/ui/typography";

type IntegrationDetailPageProps = {
  integration: MarketingIntegration;
};

function getStatusLabel(
  integration: MarketingIntegration,
  copy: ReturnType<typeof getIntegrationDetailCopy>,
) {
  if (integration.status === "native") {
    return copy.statusNative;
  }

  if (integration.status === "coming-soon") {
    return copy.statusComingSoon;
  }

  return copy.statusAvailable;
}

export function IntegrationDetailPage({ integration }: IntegrationDetailPageProps) {
  const appLocale = useAppLocale();
  const copy = getIntegrationDetailCopy(appLocale);
  const integrationsIndexHref = rewriteAppLocalePath("/integrations", appLocale);
  const categoryLabel = getCategoryLabelForIntegration(appLocale, integration.category);
  const statusLabel = getStatusLabel(integration, copy);
  const typeLabel = integration.type === "native" ? copy.typeNative : copy.typePartner;
  const canConnect = integration.status === "available" || integration.status === "native";

  return (
    <Box background="canvas" width="full">
      <main className="mx-auto min-h-screen max-w-7xl text-foreground">
        <Rows spacing="0">
          <Box paddingX="3u" paddingTop="6u" paddingBottom="8u">
            <Rows spacing="4u">
              <Link
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                href={integrationsIndexHref}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
                {copy.backToIntegrations}
              </Link>

              <Columns collapseBelow="large" spacing="6u">
                <Column width="1/3">
                  <Rows spacing="3u">
                    <IntegrationLogoMark
                      iconKey={integration.iconKey}
                      logoSrc={integration.logoSrc}
                      name={integration.name}
                      size="lg"
                    />

                    <Rows spacing="1u">
                      <TypographyH1 className="text-3xl sm:text-4xl">
                        {integration.name}
                      </TypographyH1>
                      <TypographyP tone="subtle">{integration.tagline}</TypographyP>
                    </Rows>

                    {canConnect ? (
                      <Button
                        nativeButton={false}
                        render={<a href="/auth/sign-in" rel="noopener noreferrer" />}
                      >
                        {copy.connectCta}
                      </Button>
                    ) : (
                      <Button disabled type="button">
                        {copy.comingSoonCta}
                      </Button>
                    )}

                    <Separator />

                    <Rows spacing="2u">
                      <Rows spacing="0.5u">
                        <TypographyMuted size="small">{copy.categoriesHeading}</TypographyMuted>
                        <Badge variant="secondary">{categoryLabel}</Badge>
                      </Rows>

                      <Rows spacing="0.5u">
                        <TypographyMuted size="small">{copy.typeHeading}</TypographyMuted>
                        <TypographyP size="small">{typeLabel}</TypographyP>
                      </Rows>

                      <Rows spacing="0.5u">
                        <TypographyMuted size="small">{copy.statusHeading}</TypographyMuted>
                        <TypographyP size="small">{statusLabel}</TypographyP>
                      </Rows>

                      {integration.websiteUrl || integration.docsUrl ? (
                        <Rows spacing="1u">
                          <TypographyMuted size="small">{copy.resourcesHeading}</TypographyMuted>
                          {integration.websiteUrl ? (
                            <a
                              className="inline-flex items-center gap-1 text-sm text-foreground transition-colors hover:text-muted-foreground"
                              href={integration.websiteUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              {copy.websiteLink}
                              <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" />
                            </a>
                          ) : null}
                          {integration.docsUrl ? (
                            <a
                              className="inline-flex items-center gap-1 text-sm text-foreground transition-colors hover:text-muted-foreground"
                              href={integration.docsUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              {copy.docsLink}
                              <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" />
                            </a>
                          ) : null}
                        </Rows>
                      ) : null}
                    </Rows>
                  </Rows>
                </Column>

                <Column width="2/3">
                  <Rows spacing="6u">
                    <Rows spacing="2u">
                      <TypographyH2 className="text-2xl tracking-tight">
                        {copy.overviewHeading}
                      </TypographyH2>
                      {integration.overview.map((paragraph) => (
                        <TypographyP key={paragraph} tone="subtle">
                          {paragraph}
                        </TypographyP>
                      ))}
                    </Rows>

                    <Rows spacing="3u">
                      <TypographyH2 className="text-2xl tracking-tight">
                        {copy.productsHeading}
                      </TypographyH2>
                      <Rows spacing="2u">
                        {integration.products.map((product) => (
                          <Box
                            key={product.name}
                            background="surface"
                            border="standard"
                            borderRadius="large"
                            padding="3u"
                          >
                            <Rows spacing="1u">
                              <TypographyP weight="medium">{product.name}</TypographyP>
                              <TypographyMuted size="small">{product.description}</TypographyMuted>
                            </Rows>
                          </Box>
                        ))}
                      </Rows>
                    </Rows>
                  </Rows>
                </Column>
              </Columns>
            </Rows>
          </Box>

          <Separator />
          <Box paddingX="3u" paddingY="8u">
            <div className="mx-auto max-w-3xl text-center">
              <Rows spacing="2u" align="center">
                <TypographyH2 className="text-3xl tracking-tight">
                  {copy.finalCtaHeadline}
                </TypographyH2>
                <TypographyP className="max-w-2xl text-center" tone="subtle">
                  {copy.finalCtaDescription}
                </TypographyP>
                <Button
                  nativeButton={false}
                  render={<a href={REQUEST_DEMO_URL} rel="noopener noreferrer" target="_blank" />}
                >
                  {copy.connectCta}
                </Button>
              </Rows>
            </div>
          </Box>

          <Separator />
          <Box paddingX="3u" paddingTop="6u">
            <MarketingFooter columns={footerColumns} />
          </Box>
        </Rows>
      </main>
    </Box>
  );
}
