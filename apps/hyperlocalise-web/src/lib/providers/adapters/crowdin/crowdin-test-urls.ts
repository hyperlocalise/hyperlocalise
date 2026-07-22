/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
/** Example Crowdin Enterprise API base URL for tests (not a real workspace). */
export const EXAMPLE_CROWDIN_ENTERPRISE_API_BASE_URL =
  "https://example-org.api.crowdin.com/api/v2" as const;

export const EXAMPLE_CROWDIN_ENTERPRISE_API_HOSTNAME = "example-org.api.crowdin.com" as const;

export const EXAMPLE_CROWDIN_ENTERPRISE_AUTHENTICATED_USER_URL =
  `${EXAMPLE_CROWDIN_ENTERPRISE_API_BASE_URL}/user` as const;
