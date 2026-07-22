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
