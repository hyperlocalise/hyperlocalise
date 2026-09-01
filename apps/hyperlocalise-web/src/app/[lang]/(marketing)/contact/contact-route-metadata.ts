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

export function getContactRouteMetadata(intl: IntlShape) {
  return {
    title: intl.formatMessage({
      defaultMessage: "Contact Hyperlocalise",
      id: "mN+eL4E4T/",
      description: "Meta title for the marketing contact page",
    }),
    description: intl.formatMessage({
      defaultMessage: "Email the Hyperlocalise team about localisation, pricing, or support.",
      id: "0S1pdjIx4Z",
      description: "Meta description for the marketing contact page",
    }),
  };
}
