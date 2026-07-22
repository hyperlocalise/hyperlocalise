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
import { AutumnProvider } from "autumn-js/react";

import {
  AUTUMN_API_PATH_PREFIX,
  ORGANIZATION_SLUG_HEADER,
} from "@/lib/billing/autumn-public-config";

export function AutumnBillingProvider({
  children,
  organizationSlug,
}: {
  children: React.ReactNode;
  organizationSlug: string;
}) {
  return (
    <AutumnProvider
      pathPrefix={AUTUMN_API_PATH_PREFIX}
      includeCredentials
      headers={{
        [ORGANIZATION_SLUG_HEADER]: organizationSlug,
      }}
    >
      {children}
    </AutumnProvider>
  );
}
