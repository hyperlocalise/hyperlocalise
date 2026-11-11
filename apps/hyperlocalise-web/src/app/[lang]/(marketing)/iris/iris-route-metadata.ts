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

export const irisRouteKeywords = [
  "AI localisation engine",
  "multilingual assets",
  "AI image localisation",
  "video localisation",
  "motion localisation",
  "audio localisation",
];

export function getIrisRouteMetadata(intl: IntlShape) {
  return {
    title: intl.formatMessage({
      defaultMessage: "Iris | AI Localisation Engine for Multilingual Assets | Hyperlocalise",
      id: "AQZXVFsnl+",
      description: "Page title for the Iris waitlist page",
    }),
    description: intl.formatMessage({
      defaultMessage:
        "Iris is Hyperlocalise's AI localisation engine for multilingual assets. Create and adapt images, video, motion, and audio for every language. Join the waitlist.",
      id: "QZjNY0zpti",
      description: "Meta description for the Iris waitlist page",
    }),
    ogHeading: intl.formatMessage({
      defaultMessage: "Iris, the AI localisation engine",
      id: "GZPe87SKjx",
      description: "Open Graph heading for the Iris waitlist page",
    }),
    keywords: irisRouteKeywords,
  };
}
