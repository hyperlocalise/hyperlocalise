"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

import { LocalizedErrorRecovery } from "@/components/error-recovery/localized-error-recovery";

type LocaleErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function LocaleError({ error, unstable_retry }: LocaleErrorProps) {
  const { lang } = useParams<{ lang: string }>();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <LocalizedErrorRecovery dashboardHref={`/${lang}/dashboard`} retry={unstable_retry} fullPage />
  );
}
