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
import { useIntl } from "react-intl";

import { IntegrationLogoMark } from "@/components/marketing/integrations/integration-logo-mark";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { getIntegrationCatalogEntry } from "@/lib/integrations/integration-catalog";
import { getIntegrationPath } from "@/lib/integrations/integration-path";
import { resolveIntegrationBySlug } from "@/lib/integrations/resolve-integration-catalog";

import { productPageMessages } from "./product-page-content.messages";

export const AUTOMATION_HOW_IT_WORKS_INTEGRATION_SLUGS = [
  "slack",
  "notion",
  "canva",
  "contentful",
  "webflow",
  "github",
  "gitlab",
  "jira",
  "linear",
  "intercom",
  "crowdin",
  "lokalise",
  "phrase",
  "smartling",
  "ahrefs",
  "semrush",
  "zernio",
  "resend",
] as const;

export function AutomationHowItWorksIntegrations() {
  const locale = useAppLocale();
  const intl = useIntl();
  const label = intl.formatMessage(productPageMessages.agentsAutomationIntegrationsLabel);

  return (
    <ul aria-label={label} className="flex flex-wrap items-center gap-3">
      {AUTOMATION_HOW_IT_WORKS_INTEGRATION_SLUGS.map((slug) => {
        const entry = getIntegrationCatalogEntry(slug);
        const resolved = resolveIntegrationBySlug(locale, slug);
        const name = resolved?.name ?? slug;
        const href = entry?.marketing ? getIntegrationPath(locale, slug) : null;
        const mark = (
          <IntegrationLogoMark
            iconKey={entry?.iconKey}
            logoSrc={entry?.logoSrc}
            name={name}
            size="sm"
          />
        );

        return (
          <li key={slug}>
            {href ? (
              <Link
                aria-label={name}
                className="block transition-opacity hover:opacity-80"
                href={href}
              >
                {mark}
              </Link>
            ) : (
              <span className="block" title={name}>
                {mark}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
