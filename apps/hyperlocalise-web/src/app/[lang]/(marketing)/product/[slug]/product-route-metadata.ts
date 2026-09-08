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

export function getProductRouteMetadata(slug: string, intl: IntlShape) {
  switch (slug) {
    case "agents-automation":
      return {
        title: intl.formatMessage({
          defaultMessage: "Stop Chasing Localisation Work Across Tools | Hyperlocalise",
          id: "AWZymO5ooC",
          description: "Page title for the agents automation product page",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Catch source changes, route localisation work, gather context, and keep human review in control across your existing tools.",
          id: "63np7ewMDD",
          description: "Meta description for the agents automation product page",
        }),
      };
    case "multilingual-content-studio":
      return {
        title: intl.formatMessage({
          defaultMessage: "Multilingual Content Studio | Hyperlocalise",
          id: "8GHZDPEhIo",
          description: "Page title for the multilingual Content Studio product page",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Create and adapt text, documents, slides, images, and video in one multilingual workspace with shared context and human review.",
          id: "yfyxggCpJF",
          description: "Meta description for the multilingual Content Studio product page",
        }),
      };
    case "guidelines":
      return {
        title: intl.formatMessage({
          defaultMessage: "Keep the Docs You Have. Put Them to Work. | Hyperlocalise",
          id: "qqzc5HNRQF",
          description: "Page title for the Guidelines product page",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Connect Google Drive, Notion, and SharePoint, or type guidelines in. Agents check drafts against the brand and compliance files your team already maintains.",
          id: "wwKiGsumAM",
          description: "Meta description for the Guidelines product page",
        }),
      };
    default:
      return null;
  }
}
