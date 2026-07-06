"use client";

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
