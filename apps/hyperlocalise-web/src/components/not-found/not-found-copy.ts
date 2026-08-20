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

export const NOT_FOUND_STATUS_CODE = "404";

export function getNotFoundCopy(intl: IntlShape) {
  const title = intl.formatMessage({
    defaultMessage: "Page not found",
    id: "3rvYG+2rma",
    description: "Heading on the application 404 page",
  });

  return {
    statusCode: NOT_FOUND_STATUS_CODE,
    title,
    description: intl.formatMessage({
      defaultMessage: "This address does not match a page. Return home, or open your dashboard.",
      id: "zfBUiflpJx",
      description: "Guidance on the application 404 page",
    }),
    homeLabel: intl.formatMessage({
      defaultMessage: "Back to homepage",
      id: "b/LOcyQLjC",
      description: "Link from the 404 page to the marketing homepage",
    }),
    dashboardLabel: intl.formatMessage({
      defaultMessage: "Go to dashboard",
      id: "lmLPnsMyhs",
      description: "Link from the 404 page to the workspace dashboard",
    }),
    supportLabel: intl.formatMessage({
      defaultMessage: "Contact support",
      id: "eOj0ETOfEV",
      description: "Link from the 404 page to email customer support",
    }),
    documentTitle: intl.formatMessage(
      {
        defaultMessage: "{title} | Hyperlocalise",
        id: "1XPTC/SDY9",
        description: "Browser tab title for the application 404 page",
      },
      { title },
    ),
  };
}
