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

export function getPricingRouteMetadata(intl: IntlShape) {
  return {
    title: intl.formatMessage({
      defaultMessage: "Pricing | Hyperlocalise",
      id: "wN/evt/nnl",
      description: "Meta title for the marketing pricing page",
    }),
    description: intl.formatMessage({
      defaultMessage:
        "Compare Free, Starter, Growth, and Enterprise plans for Hyperlocalise — agentic localisation for teams shipping global product content.",
      id: "hMhzJOyOF3",
      description: "Meta description for the marketing pricing page",
    }),
  };
}
