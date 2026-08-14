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

export function getLocalisationAuditRouteMetadata(intl: IntlShape) {
  return {
    title: intl.formatMessage({
      defaultMessage: "Localisation audit | Hyperlocalise",
      id: "NdDEnysUFB",
      description: "Meta title for the public localisation audit landing page",
    }),
    description: intl.formatMessage({
      defaultMessage:
        "Enter a URL to see how your site feels in other languages. A clear score, then the full report by email.",
      id: "M/3YJiyMT3",
      description: "Meta description for the public localisation audit landing page",
    }),
  };
}

export function getLocalisationAuditResultRouteMetadata(
  intl: IntlShape,
  domainKey: string,
  score: number | null,
) {
  return {
    title: intl.formatMessage(
      {
        defaultMessage: "Localisation audit for {domain} | Hyperlocalise",
        id: "YhCxIj8rLK",
        description: "Meta title for a public localisation audit result page",
      },
      { domain: domainKey },
    ),
    description:
      score == null
        ? intl.formatMessage(
            {
              defaultMessage: "Localisation health check results for {domain}.",
              id: "5+ZicYt+Yo",
              description: "Meta description for an in-progress localisation audit result page",
            },
            { domain: domainKey },
          )
        : intl.formatMessage(
            {
              defaultMessage:
                "Localisation score {score}/100 for {domain}. Technical and linguistic findings from Hyperlocalise.",
              id: "QoSDgiiNvY",
              description: "Meta description for a completed localisation audit result page",
            },
            { domain: domainKey, score },
          ),
  };
}
