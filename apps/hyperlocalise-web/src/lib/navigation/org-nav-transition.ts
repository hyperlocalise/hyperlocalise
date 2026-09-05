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
import { stripAppLocalePrefix } from "@/components/app-shell/navigation-config";

export type OrgNavTransitionType = "nav-forward" | "nav-back";

export function getOrgRouteDepth(pathname: string): number {
  const segments = stripAppLocalePrefix(pathname).split("/").filter(Boolean);

  if (segments[0] !== "org" || !segments[1]) {
    return 0;
  }

  return segments.length - 2;
}

export function getOrgNavigationTransitionTypes(
  fromPathname: string,
  toHref: string,
): OrgNavTransitionType[] | undefined {
  const fromDepth = getOrgRouteDepth(fromPathname);
  const toDepth = getOrgRouteDepth(toHref);

  if (toDepth > fromDepth) {
    return ["nav-forward"];
  }

  if (toDepth < fromDepth) {
    return ["nav-back"];
  }

  return undefined;
}
