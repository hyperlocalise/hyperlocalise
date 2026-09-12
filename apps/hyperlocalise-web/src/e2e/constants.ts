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
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export const E2E_DEFAULT_LOCALE = "en";

export function e2eUrl(path: string) {
  return new URL(path, E2E_BASE_URL).toString();
}

export function organizationPath(organizationSlug: string, suffix = "") {
  const normalized = suffix === "" || suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `/${E2E_DEFAULT_LOCALE}/org/${organizationSlug}${normalized}`;
}

export function organizationDashboardPath(organizationSlug: string) {
  return organizationPath(organizationSlug, "/dashboard");
}

export function organizationProjectsPath(organizationSlug: string) {
  return organizationPath(organizationSlug, "/projects");
}
