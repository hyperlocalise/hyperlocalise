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
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";

import type { MarketingIntegration } from "@/components/marketing/integrations/integrations-page-content";
import {
  getCategoryLabelForIntegration,
  getIntegrationCtaCopy,
  getIntegrationDetailCopy,
  getIntegrationNamesBySlug,
  getRelatedIntegrations,
} from "@/components/marketing/integrations/integrations-page-content";
import { IntegrationCard } from "@/components/marketing/integrations/integration-card";
import { IntegrationCtaSection } from "@/components/marketing/integrations/integration-cta-section";
import { IntegrationLogoMark } from "@/components/marketing/integrations/integration-logo-mark";
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
  TypographyH3,
  TypographyMuted,
  TypographyP,
} from "@/components/ui/typography";

const IntegrationWorkflowPreview = dynamic(
  () =>
    import("@/components/marketing/integrations/integration-workflow-preview").then(
      (module) => module.IntegrationWorkflowPreview,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[22rem] items-center justify-center rounded-2xl border border-border bg-background">
        <TypographyMuted>Loading workflow preview…</TypographyMuted>
      </div>
    ),
  },
);

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

function formatStepLabel(index: number) {
  return `0${index + 1}`;
}

export function IntegrationDetailPage({ integration }: IntegrationDetailPageProps) {
  const appLocale = useAppLocale();
  const copy = getIntegrationDetailCopy(appLocale);
  const ctaCopy = getIntegrationCtaCopy(appLocale, integration.name);
  const integrationsIndexHref = rewriteAppLocalePath("/integrations", appLocale);
  const categoryLabel = getCategoryLabelForIntegration(appLocale, integration.category);
  const statusLabel = getStatusLabel(integration, copy);
  const typeLabel = integration.type === "native" ? copy.typeNative : copy.typePartner;
  const canConnect = integration.status === "available" || integration.status === "native";
  const relatedIntegrations = getRelatedIntegrations(appLocale, integration);
  const integrationNamesBySlug = useMemo(
    () => ({
      ...getIntegrationNamesBySlug(appLocale),
      hyperlocalise: "Hyperlocalise",
    }),
    [appLocale],
  );
  const workflowPreviewCopy = useMemo(
    () => ({
      triggerLabel: copy.workflowTriggerLabel,
      actionLabel: copy.workflowActionLabel,
      previewHint: copy.workflowPreviewHint,
      playLabel: copy.workflowPlayLabel,
      pauseLabel: copy.workflowPauseLabel,
    }),
    [copy],
  );

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
                      <TypographyH1>{integration.name}</TypographyH1>
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
                  <Rows spacing="8u">
                    <Rows spacing="2u">
                      <TypographyH2 size="medium">{copy.overviewHeading}</TypographyH2>
                      {integration.overview.map((paragraph) => (
                        <TypographyP key={paragraph} tone="subtle">
                          {paragraph}
                        </TypographyP>
                      ))}
                    </Rows>

                    {integration.capabilities.length > 0 ? (
                      <Rows spacing="3u">
                        <TypographyH2 size="medium">{copy.capabilitiesHeading}</TypographyH2>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {integration.capabilities.map((capability) => (
                            <Box
                              key={capability.title}
                              background="surface"
                              border="standard"
                              borderRadius="large"
                              padding="3u"
                            >
                              <Rows spacing="1u">
                                <TypographyH3 size="medium" weight="medium">
                                  {capability.title}
                                </TypographyH3>
                                <TypographyMuted size="small">
                                  {capability.description}
                                </TypographyMuted>
                              </Rows>
                            </Box>
                          ))}
                        </div>
                      </Rows>
                    ) : null}

                    {integration.products.length > 0 ? (
                      <Rows spacing="3u">
                        <TypographyH2 size="medium">{copy.productsHeading}</TypographyH2>
                        <div className="grid gap-3 sm:grid-cols-2">
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
                                <TypographyMuted size="small">
                                  {product.description}
                                </TypographyMuted>
                              </Rows>
                            </Box>
                          ))}
                        </div>
                      </Rows>
                    ) : null}

                    {integration.workflows.length > 0 ? (
                      <Rows spacing="3u">
                        <Rows spacing="1u">
                          <TypographyH2 size="medium">{copy.workflowsHeading}</TypographyH2>
                          <TypographyMuted>{copy.workflowsDescription}</TypographyMuted>
                        </Rows>
                        <IntegrationWorkflowPreview
                          copy={workflowPreviewCopy}
                          integrationNamesBySlug={integrationNamesBySlug}
                          integrationSlug={integration.slug}
                          workflows={integration.workflows}
                        />
                      </Rows>
                    ) : null}

                    {integration.setupSteps.length > 0 ? (
                      <Rows spacing="3u">
                        <TypographyH2 size="medium">{copy.setupHeading}</TypographyH2>
                        <Rows spacing="0">
                          {integration.setupSteps.map((step, index) => (
                            <div
                              key={step.title}
                              className="flex gap-4 border-t border-border py-5 first:border-t-0 first:pt-0"
                            >
                              <div className="min-w-8 shrink-0 tabular-nums">
                                <TypographyMuted>{formatStepLabel(index)}</TypographyMuted>
                              </div>
                              <Rows spacing="1u">
                                <TypographyP weight="medium">{step.title}</TypographyP>
                                <TypographyMuted size="small">{step.description}</TypographyMuted>
                              </Rows>
                            </div>
                          ))}
                        </Rows>
                      </Rows>
                    ) : null}

                    {relatedIntegrations.length > 0 ? (
                      <Rows spacing="3u">
                        <TypographyH2 size="medium">{copy.relatedHeading}</TypographyH2>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {relatedIntegrations.map((related) => (
                            <IntegrationCard
                              key={related.slug}
                              categoryLabel={getCategoryLabelForIntegration(
                                appLocale,
                                related.category,
                              )}
                              integration={related}
                              lang={appLocale}
                            />
                          ))}
                        </div>
                      </Rows>
                    ) : null}
                  </Rows>
                </Column>
              </Columns>
            </Rows>
          </Box>

          <Separator />
          <IntegrationCtaSection
            description={ctaCopy.description}
            headline={ctaCopy.headline}
            primaryCtaLabel={ctaCopy.primaryCtaLabel}
            secondaryCtaLabel={ctaCopy.secondaryCtaLabel}
          />

          <Separator />
          <Box paddingX="3u" paddingTop="6u">
            <MarketingFooter columns={footerColumns} />
          </Box>
        </Rows>
      </main>
    </Box>
  );
}
