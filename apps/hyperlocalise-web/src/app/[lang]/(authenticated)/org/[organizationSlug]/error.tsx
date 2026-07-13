"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

import { LocalizedErrorRecovery } from "@/components/error-recovery/localized-error-recovery";

type OrganizationErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function OrganizationError({ error, unstable_retry }: OrganizationErrorProps) {
  const { lang, organizationSlug } = useParams<{
    lang: string;
    organizationSlug: string;
  }>();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <LocalizedErrorRecovery
      dashboardHref={`/${lang}/org/${organizationSlug}/dashboard`}
      retry={unstable_retry}
    />
  );
}
