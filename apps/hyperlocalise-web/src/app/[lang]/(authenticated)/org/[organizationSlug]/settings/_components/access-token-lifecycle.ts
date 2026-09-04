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

import type { IntlShape } from "react-intl";

import type { ApiKeyOwner } from "@/api/routes/api-key/api-key.schema";

export type AccessTokenSummary = {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  owner?: ApiKeyOwner | null;
};

export function formatAccessTokenDate(
  intl: Pick<IntlShape, "formatDate">,
  date: string | null,
  neverUsedLabel: string,
) {
  if (!date) {
    return neverUsedLabel;
  }

  return intl.formatDate(new Date(date), { dateStyle: "medium" });
}
