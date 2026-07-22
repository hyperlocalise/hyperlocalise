"use client";

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
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { getTmsUserOAuthErrorCopy } from "@/lib/providers/credentials/tms-user-oauth-error-copy";

function shouldShowToastForPath(pathname: string) {
  // Integrations renders a persistent in-page error banner from server props.
  return !pathname.includes("/integrations");
}

export function TmsUserOAuthErrorToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const handledOAuthErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const errorCode = searchParams.get("error");
    const errorCopy = getTmsUserOAuthErrorCopy(errorCode);
    if (!errorCopy) {
      return;
    }
    if (handledOAuthErrorRef.current === errorCode) {
      return;
    }
    handledOAuthErrorRef.current = errorCode;

    if (shouldShowToastForPath(pathname)) {
      toast.error(errorCopy.title, { description: errorCopy.description });
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url.toString());
  }, [pathname, searchParams]);

  return null;
}
