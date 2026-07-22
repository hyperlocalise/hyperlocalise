/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { IntlShape } from "@formatjs/intl";

export function getBlogRouteMetadata(intl: IntlShape) {
  return {
    title: intl.formatMessage({
      defaultMessage: "Blog | Hyperlocalise",
      id: "SGrQFByJdA",
      description: "Meta title for the marketing blog index page",
    }),
    description: intl.formatMessage({
      defaultMessage:
        "Updates, product thinking, and lessons from building agent-native localisation workflows.",
      id: "7OEl2Ch1Rv",
      description: "Meta description for the marketing blog index page",
    }),
  };
}
