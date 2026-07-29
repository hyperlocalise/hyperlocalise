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
