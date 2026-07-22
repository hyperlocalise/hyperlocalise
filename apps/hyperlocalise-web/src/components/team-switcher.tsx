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
export function buildOrganizationSwitchReturnTo(
  pathname: string,
  activeSlug: string,
  targetSlug: string,
) {
  if (pathname.startsWith(`/org/${activeSlug}`)) {
    return pathname.replace(`/org/${activeSlug}`, `/org/${targetSlug}`);
  }

  return `/org/${targetSlug}/dashboard`;
}

export function buildOrganizationSwitchHref(
  targetSlug: string,
  pathname: string,
  activeSlug: string,
) {
  const returnTo = buildOrganizationSwitchReturnTo(pathname, activeSlug, targetSlug);
  return `/auth/select-organization/${targetSlug}?returnTo=${encodeURIComponent(returnTo)}`;
}
