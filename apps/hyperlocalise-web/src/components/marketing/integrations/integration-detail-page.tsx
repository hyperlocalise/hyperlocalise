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
import { ArrowLeftIcon, ArrowUpRightIcon, CaretDownIcon } from "@phosphor-icons/react/ssr";

import type { MarketingIntegration } from "@/components/marketing/integrations/integrations-page-content";
import {
  getIntegrationCtaCopy,
  getIntegrationDetailCopy,
  getRelatedIntegrations,
  getRelatedUseCaseLink,
} from "@/components/marketing/integrations/integrations-page-content";
import { IntegrationCtaSection } from "@/components/marketing/integrations/integration-cta-section";
import { IntegrationLogoMark } from "@/components/marketing/integrations/integration-logo-mark";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";
import { Separator } from "@/components/ui/separator";
import {
  TypographyH1,
  TypographyH2,
  TypographyMuted,
  TypographyP,
} from "@/components/ui/typography";
import type { AppLocale } from "@/lib/app-i18n/locales";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { getIntegrationPath } from "@/lib/integrations/integration-path";

type IntegrationDetailPageProps = {
  integration: MarketingIntegration;
  locale: AppLocale;
};

function formatStepLabel(index: number) {
  return String(index + 1).padStart(2, "0");
}

function SectionHeading({ children }: { children: string }) {
  return (
    <TypographyH2 className="pb-0" size="medium">
      {children}
    </TypographyH2>
  );
}

function NumberedStep({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description?: string;
}) {
  return (
    <li className="flex gap-4 border-t border-border py-5 first:border-t-0 first:pt-0">
      <div className="min-w-8 shrink-0 tabular-nums">
        <TypographyMuted>{formatStepLabel(index)}</TypographyMuted>
      </div>
      <Rows spacing="1u">
        <TypographyP weight="medium">{title}</TypographyP>
        {description ? <TypographyMuted size="small">{description}</TypographyMuted> : null}
      </Rows>
    </li>
  );
}

export function IntegrationDetailPage({ integration, locale }: IntegrationDetailPageProps) {
  const copy = getIntegrationDetailCopy(locale);
  const ctaCopy = getIntegrationCtaCopy(locale, integration.name);
  const integrationsIndexHref = rewriteAppLocalePath("/integrations", locale);
  const relatedIntegrations = getRelatedIntegrations(locale, integration);
  const relatedUseCase = getRelatedUseCaseLink(locale, integration.relatedUseCaseSlug);
  const relatedUseCaseHref = relatedUseCase
    ? rewriteAppLocalePath(relatedUseCase.href, locale)
    : null;
  const isComingSoon = integration.status === "coming-soon";
  const canSignIn = integration.status === "available" || integration.status === "native";
  const primaryWorkflow = integration.workflows[0];

  return (
    <Box background="canvas" width="full">
      <main className="mx-auto min-h-screen max-w-7xl text-foreground">
        <Rows spacing="0">
          <Box paddingX="3u" paddingTop="6u" paddingBottom="8u">
            <div className="mx-auto max-w-3xl">
              <Rows spacing="8u">
                <Rows spacing="4u">
                  <Link
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    href={integrationsIndexHref}
                  >
                    <ArrowLeftIcon className="size-4" />
                    {copy.backToIntegrations}
                  </Link>

                  <Rows spacing="3u">
                    <div className="flex flex-wrap items-center gap-3">
                      <IntegrationLogoMark
                        iconKey={integration.iconKey}
                        logoSrc={integration.logoSrc}
                        name={integration.name}
                        size="sm"
                        slug={integration.slug}
                      />
                      <TypographyMuted>{integration.name}</TypographyMuted>
                      {isComingSoon ? (
                        <Badge variant="outline">{copy.comingSoonLabel}</Badge>
                      ) : null}
                    </div>

                    <Rows spacing="2u">
                      <TypographyH1 className="max-w-3xl" size="large">
                        {integration.headline}
                      </TypographyH1>
                      <TypographyP size="large" tone="subtle">
                        {integration.tagline}
                      </TypographyP>
                    </Rows>

                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <Button
                        nativeButton={false}
                        render={
                          <a href={REQUEST_DEMO_URL} rel="noopener noreferrer" target="_blank" />
                        }
                      >
                        {copy.requestDemoCta}
                      </Button>
                      {canSignIn ? (
                        <Link
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                          href="/auth/sign-in"
                        >
                          {copy.signInLink}
                        </Link>
                      ) : null}
                    </div>

                    {relatedUseCase && relatedUseCaseHref ? (
                      <Link
                        className="text-sm text-foreground underline underline-offset-4"
                        href={relatedUseCaseHref}
                      >
                        {relatedUseCase.label}
                      </Link>
                    ) : null}

                    {integration.docsUrl ? (
                      <a
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        href={integration.docsUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {copy.docsLink}
                        <ArrowUpRightIcon className="size-3.5" />
                      </a>
                    ) : null}
                  </Rows>
                </Rows>

                {primaryWorkflow ? (
                  <Rows spacing="3u">
                    <SectionHeading>{copy.workflowsHeading}</SectionHeading>
                    <ol className="list-none p-0">
                      {primaryWorkflow.steps.map((step, index) => (
                        <NumberedStep
                          key={step.label}
                          description={step.description}
                          index={index}
                          title={step.label}
                        />
                      ))}
                    </ol>
                  </Rows>
                ) : null}

                {integration.capabilities.length > 0 ? (
                  <Rows spacing="3u">
                    <SectionHeading>{copy.capabilitiesHeading}</SectionHeading>
                    <Rows spacing="0">
                      {integration.capabilities.map((capability) => (
                        <div
                          key={capability.title}
                          className="border-t border-border py-5 first:border-t-0 first:pt-0"
                        >
                          <Rows spacing="1u">
                            <TypographyP weight="medium">{capability.title}</TypographyP>
                            <TypographyMuted size="small">{capability.description}</TypographyMuted>
                          </Rows>
                        </div>
                      ))}
                    </Rows>
                  </Rows>
                ) : null}

                {integration.setupSteps.length > 0 ? (
                  <Rows spacing="3u">
                    <SectionHeading>{copy.setupHeading}</SectionHeading>
                    <ol className="list-none p-0">
                      {integration.setupSteps.map((step, index) => (
                        <NumberedStep
                          key={step.title}
                          description={step.description}
                          index={index}
                          title={step.title}
                        />
                      ))}
                    </ol>
                  </Rows>
                ) : null}

                {integration.faqs.length > 0 ? (
                  <Rows spacing="3u">
                    <SectionHeading>{copy.faqHeading}</SectionHeading>
                    <div>
                      {integration.faqs.map((item) => (
                        <details
                          key={item.question}
                          className="group border-t border-border py-5 first:border-t-0 first:pt-0"
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                            {item.question}
                            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                          </summary>
                          <TypographyMuted className="pt-2" size="small">
                            {item.answer}
                          </TypographyMuted>
                        </details>
                      ))}
                    </div>
                  </Rows>
                ) : null}

                {relatedIntegrations.length > 0 ? (
                  <Rows spacing="3u">
                    <SectionHeading>{copy.relatedHeading}</SectionHeading>
                    <Rows spacing="0">
                      {relatedIntegrations.map((related) => {
                        const href = getIntegrationPath(locale, related.slug);
                        if (!href) {
                          return null;
                        }

                        return (
                          <Link
                            key={related.slug}
                            className="flex items-start gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 transition-colors hover:text-muted-foreground"
                            href={href}
                          >
                            <IntegrationLogoMark
                              iconKey={related.iconKey}
                              logoSrc={related.logoSrc}
                              name={related.name}
                              size="sm"
                              slug={related.slug}
                            />
                            <Rows spacing="0.5u">
                              <div className="flex flex-wrap items-center gap-2">
                                <TypographyP weight="medium">{related.name}</TypographyP>
                                {related.status === "coming-soon" ? (
                                  <Badge variant="outline">{copy.comingSoonLabel}</Badge>
                                ) : null}
                              </div>
                              <TypographyMuted size="small">{related.tagline}</TypographyMuted>
                            </Rows>
                          </Link>
                        );
                      })}
                    </Rows>
                  </Rows>
                ) : null}
              </Rows>
            </div>
          </Box>

          <Separator />
          <IntegrationCtaSection
            description={ctaCopy.description}
            headline={ctaCopy.headline}
            primaryCtaLabel={ctaCopy.primaryCtaLabel}
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
