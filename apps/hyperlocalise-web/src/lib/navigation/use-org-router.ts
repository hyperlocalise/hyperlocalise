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

import { getOrgNavigationTransitionTypes } from "@/lib/navigation/org-nav-transition";

type OrgRouterNavigateOptions = {
  replace?: boolean;
  scroll?: boolean;
};

export function useOrgRouter() {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(href: string, options?: OrgRouterNavigateOptions) {
    const transitionTypes = getOrgNavigationTransitionTypes(pathname, href);

    startTransition(() => {
      for (const transitionType of transitionTypes ?? []) {
        addTransitionType(transitionType);
      }

      if (options?.replace) {
        router.replace(href, { scroll: options.scroll });
        return;
      }

      router.push(href, { scroll: options?.scroll });
    });
  }

  return {
    push: (href: string, options?: Omit<OrgRouterNavigateOptions, "replace">) =>
      navigate(href, options),
    replace: (href: string, options?: Omit<OrgRouterNavigateOptions, "replace">) =>
      navigate(href, { ...options, replace: true }),
  };
}
