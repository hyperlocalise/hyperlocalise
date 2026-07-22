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
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export const E2E_DEFAULT_LOCALE = "en";

export function organizationDashboardPath(organizationSlug: string) {
  return `/${E2E_DEFAULT_LOCALE}/org/${organizationSlug}/dashboard`;
}

export function organizationProjectsPath(organizationSlug: string) {
  return `/${E2E_DEFAULT_LOCALE}/org/${organizationSlug}/projects`;
}
