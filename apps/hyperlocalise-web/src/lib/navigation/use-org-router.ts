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
import { usePathname, useRouter } from "next/navigation";
import { addTransitionType, startTransition } from "react";

import { navigateThroughLeaveGuard } from "@/lib/navigation/leave-guard";
import { localizeOrgHref } from "@/lib/navigation/localize-org-href";
import { getOrgNavigationTransitionTypes } from "@/lib/navigation/org-nav-transition";

type OrgRouterNavigateOptions = {
  replace?: boolean;
  scroll?: boolean;
};

/**
 * Router for moving between org pages. Use it over `useRouter` for `/org/...` hrefs: it adds the
 * current locale, which saves the proxy's locale redirect, and respects the page's leave guard.
 */
export function useOrgRouter() {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(orgHref: string, options?: OrgRouterNavigateOptions) {
    const href = localizeOrgHref(orgHref, pathname);
    const transitionTypes = getOrgNavigationTransitionTypes(pathname, href);

    // A page with unsaved changes may ask first, and may need its extra history entry replaced.
    navigateThroughLeaveGuard(href, ({ replace }) => {
      startTransition(() => {
        for (const transitionType of transitionTypes ?? []) {
          addTransitionType(transitionType);
        }

        if (options?.replace || replace) {
          router.replace(href, { scroll: options?.scroll });
          return;
        }

        router.push(href, { scroll: options?.scroll });
      });
    });
  }

  return {
    push: (href: string, options?: Omit<OrgRouterNavigateOptions, "replace">) =>
      navigate(href, options),
    replace: (href: string, options?: Omit<OrgRouterNavigateOptions, "replace">) =>
      navigate(href, { ...options, replace: true }),
  };
}
