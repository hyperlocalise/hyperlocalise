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

import type { ComponentProps } from "react";
import { AiUserIcon, CreditCardIcon, Globe02Icon, Key01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IntlShape } from "@formatjs/intl";

import type { OrganizationCapability } from "@/api/auth/policy";

export type SettingsHubRowConfig = {
  description: string;
  href: string;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  label: string;
  requiredCapability?: OrganizationCapability;
  absoluteHref?: boolean;
  requiresDomainsFeature?: boolean;
};

export function buildSettingsHubRows(
  intl: IntlShape,
  organizationSlug: string,
): readonly SettingsHubRowConfig[] {
  return [
    {
      label: intl.formatMessage({
        defaultMessage: "Account",
        id: "318/PLILOK",
        description: "Settings hub row label for account settings",
      }),
      description: intl.formatMessage({
        defaultMessage: "Profile details and workspace identity.",
        id: "PnVI3u5zSd",
        description: "Settings hub row description for account settings",
      }),
      href: "account",
      icon: AiUserIcon,
    },
    {
      label: intl.formatMessage({
        defaultMessage: "Personal access tokens",
        id: "rfxarBP3bw",
        description: "Settings hub row label for personal access tokens",
      }),
      description: intl.formatMessage({
        defaultMessage: "Create and revoke tokens that act with your current workspace access.",
        id: "kpE4nKZSfj",
        description: "Settings hub row description for personal access tokens",
      }),
      href: "personal-access-tokens",
      icon: Key01Icon,
    },
    {
      label: intl.formatMessage({
        defaultMessage: "API Keys",
        id: "Wzlq8Ew/Ii",
        description: "Settings hub row label for API keys",
      }),
      description: intl.formatMessage({
        defaultMessage:
          "Manage API keys for programmatic access to translation jobs and workspace data.",
        id: "5qiaSV4RG8",
        description: "Settings hub row description for API keys",
      }),
      href: "api-keys",
      icon: Key01Icon,
      requiredCapability: "api_keys:read",
    },
    {
      label: intl.formatMessage({
        defaultMessage: "Domains",
        id: "UFpFmP3uvn",
        description: "Settings hub row label for workspace domains",
      }),
      description: intl.formatMessage({
        defaultMessage: "View verified domains and attached localisation audit reports.",
        id: "gqCGKqkwz/",
        description: "Settings hub row description for workspace domains",
      }),
      href: `/org/${organizationSlug}/domains`,
      absoluteHref: true,
      icon: Globe02Icon,
      requiredCapability: "projects:read",
      requiresDomainsFeature: true,
    },
    {
      label: intl.formatMessage({
        defaultMessage: "Billing",
        id: "OmGkdjrtzD",
        description: "Settings hub row label for billing",
      }),
      description: intl.formatMessage({
        defaultMessage: "Plan usage, payment method, invoices, and billing contacts.",
        id: "K0I+hdjpXe",
        description: "Settings hub row description for billing",
      }),
      href: "billing",
      icon: CreditCardIcon,
      requiredCapability: "billing:read",
    },
  ];
}

export function filterVisibleSettingsHubRows(
  rows: readonly SettingsHubRowConfig[],
  capabilities: readonly OrganizationCapability[],
  domainsEnabled: boolean,
): SettingsHubRowConfig[] {
  return rows.filter((row) => {
    if (row.requiredCapability && !capabilities.includes(row.requiredCapability)) {
      return false;
    }
    if (row.requiresDomainsFeature && !domainsEnabled) {
      return false;
    }
    return true;
  });
}
