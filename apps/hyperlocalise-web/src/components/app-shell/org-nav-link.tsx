"use client";

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
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

import { localizeOrgHref } from "@/lib/navigation/localize-org-href";
import { getOrgNavigationTransitionTypes } from "@/lib/navigation/org-nav-transition";

type OrgNavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
};

/**
 * Link to an org page. Use it over `next/link` for `/org/...` hrefs: it adds the current locale,
 * which saves the proxy's locale redirect on each click and prefetch.
 */
export function OrgNavLink({ href, ...props }: OrgNavLinkProps) {
  const pathname = usePathname();
  const transitionTypes = getOrgNavigationTransitionTypes(pathname, href);

  return (
    <Link href={localizeOrgHref(href, pathname)} transitionTypes={transitionTypes} {...props} />
  );
}
