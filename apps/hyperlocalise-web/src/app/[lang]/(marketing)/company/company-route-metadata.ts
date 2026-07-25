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

export function getCompanyRouteMetadata(intl: IntlShape) {
  return {
    title: intl.formatMessage({
      defaultMessage: "Company | Hyperlocalise",
      id: "hdNOTMXsn9",
      description: "Meta title for the marketing company page",
    }),
    description: intl.formatMessage({
      defaultMessage:
        "Meet the Hyperlocalise founders and our mission: an AI workforce that acts like your team of local experts.",
      id: "ph6IrwwW1W",
      description: "Meta description for the marketing company page",
    }),
  };
}
