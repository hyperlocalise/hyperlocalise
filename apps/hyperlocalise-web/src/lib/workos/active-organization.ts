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
import { cookies } from "next/headers";

export const activeOrganizationCookieName = "hl_active_org_slug";

export async function getStoredActiveOrganizationSlug() {
  return (await cookies()).get(activeOrganizationCookieName)?.value ?? null;
}

export async function setStoredActiveOrganizationSlug(slug: string) {
  (await cookies()).set(activeOrganizationCookieName, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
