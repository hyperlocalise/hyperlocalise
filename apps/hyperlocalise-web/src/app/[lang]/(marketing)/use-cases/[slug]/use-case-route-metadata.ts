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

export function getUseCaseRouteMetadata(slug: string, intl: IntlShape) {
  switch (slug) {
    case "product-localisation":
      return {
        title: intl.formatMessage({
          defaultMessage: "Product Localisation That Keeps Up With Every Release | Hyperlocalise",
          id: "6LxKn3JIpf",
          description: "Page title for the product-localisation use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Turn product changes, pull requests, and launch briefs into reviewed, release-ready translations. Keep localisation inside your release workflow without replacing your TMS.",
          id: "1yht4L4f8q",
          description: "Meta description for the product-localisation use case",
        }),
      };
    case "marketing-localisation":
      return {
        title: intl.formatMessage({
          defaultMessage:
            "Campaign Localisation That Protects Brand Voice in Every Market | Hyperlocalise",
          id: "gLY1S7oNNH",
          description: "Page title for the marketing-localisation use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Turn campaign briefs into brand-safe, locale-adapted marketing copy with review workflows and asset delivery built in. Keep global messaging consistent without slowing launches.",
          id: "Pele5LgqUl",
          description: "Meta description for the marketing-localisation use case",
        }),
      };
    case "help-center-localisation":
      return {
        title: intl.formatMessage({
          defaultMessage: "Support Content That Stays Current in Every Language | Hyperlocalise",
          id: "kgZXe0zuly",
          description: "Page title for the help-center-localisation use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Keep support articles translated and fresh across locales. Connect CMS updates to review workflows and freshness monitoring without support content lag.",
          id: "Gq3EWF71If",
          description: "Meta description for the help-center-localisation use case",
        }),
      };
    case "github-release-localisation":
      return {
        title: intl.formatMessage({
          defaultMessage: "Localisation Checks That Run With Every Pull Request | Hyperlocalise",
          id: "hQHAZFLEs7",
          description: "Page title for the github-release-localisation use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Automate localisation checks in CI/CD. Detect string changes in pull requests, draft translations, and gate releases before bad translations reach production.",
          id: "Ljk3e3F6pc",
          description: "Meta description for the github-release-localisation use case",
        }),
      };
    case "localisation-quality-monitoring":
      return {
        title: intl.formatMessage({
          defaultMessage: "Catch Translation Drift Before Your Customers Do | Hyperlocalise",
          id: "yB2wsLvc7h",
          description: "Page title for the localisation-quality-monitoring use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Monitor translation quality, terminology drift, and locale coverage at scale. Run quality gates and catch regressions before they reach customers.",
          id: "wm8WIk0lDQ",
          description: "Meta description for the localisation-quality-monitoring use case",
        }),
      };
    case "localisation-operations":
      return {
        title: intl.formatMessage({
          defaultMessage:
            "One Operations Layer Across Your Entire Localisation Stack | Hyperlocalise",
          id: "mXH9Amn98O",
          description: "Page title for the localisation-operations use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Orchestrate localisation across TMS platforms, LLM providers, vendors, and reviewers. One workflow layer for localisation managers without replacing your stack.",
          id: "Euo1Muino3",
          description: "Meta description for the localisation-operations use case",
        }),
      };
    default:
      return null;
  }
}
