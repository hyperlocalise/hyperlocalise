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
      defaultMessage: "Free localisation audit (0–100) | Hyperlocalise",
      id: "rEsQotUfrf",
      description: "Meta title for the public localisation audit landing page",
    }),
    description: intl.formatMessage({
      defaultMessage:
        "Run a free localisation audit on any public website. Get a 0–100 localization score for hreflang, translations, and layout, then the full report.",
      id: "W8LPAvbHSr",
      description: "Meta description for the public localisation audit landing page",
    }),
  };
}

export function getLocalisationAuditResultRouteMetadata(
  intl: IntlShape,
  input: {
    domainKey: string;
    companyName?: string | null;
    score: number | null;
  },
) {
  const company = input.companyName?.trim() || input.domainKey;
  const { domainKey, score } = input;

  return {
    title:
      score == null
        ? intl.formatMessage(
            {
              defaultMessage: "{company} localisation audit | Hyperlocalise",
              id: "+uLgIho1rV",
              description: "Meta title for an in-progress localisation audit result page",
            },
            { company },
          )
        : intl.formatMessage(
            {
              defaultMessage: "{company} localisation score {score}/100 | Hyperlocalise",
              id: "rZilDJjoet",
              description: "Meta title for a completed localisation audit result page",
            },
            { company, score },
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
                "{company} scored {score}/100 on a free localisation audit of {domain}. Hreflang, translation, and layout findings from Hyperlocalise.",
              id: "7ydPKQUcQA",
              description: "Meta description for a completed localisation audit result page",
            },
            { company, domain: domainKey, score },
          ),
  };
}
