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

export function getStartupsRouteMetadata(intl: IntlShape) {
  return {
    title: intl.formatMessage({
      defaultMessage: "Hyperlocalise for Startups | Up to 80% off Growth",
      id: "k/fYpNgsXA",
      description: "Meta title for the marketing startups page",
    }),
    description: intl.formatMessage({
      defaultMessage:
        "Apply for the Hyperlocalise Startup Program — up to 80% off Growth for early-stage teams launching localisation with AI agents and human review.",
      id: "oNa7FPedul",
      description: "Meta description for the marketing startups page",
    }),
  };
}
