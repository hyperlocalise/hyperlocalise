"use client";

import { useEffect } from "react";

import { ErrorRecovery } from "@/components/error-recovery/error-recovery";

import "./globals.css";

const GLOBAL_ERROR_DOCUMENT_TITLE = "Page unavailable | Hyperlocalise";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function GlobalError({ error, unstable_retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>{GLOBAL_ERROR_DOCUMENT_TITLE}</title>
        <ErrorRecovery
          title="We couldn't load this page"
          description="The problem may be temporary. Try loading the page again, or return to your dashboard."
          tryAgainLabel="Try again"
          dashboardLabel="Go to dashboard"
          supportLabel="Contact support"
          dashboardHref="/dashboard"
          retry={unstable_retry}
          fullPage
        />
      </body>
    </html>
  );
}
