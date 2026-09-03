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
import type { ReactNode } from "react";

import type { OrganizationCapability } from "@/api/auth/policy";

import { SettingsLayoutFrame } from "./settings-page-chrome";
import { SettingsNav } from "./settings-nav";

export function SettingsLayoutClient({
  capabilities,
  children,
  organizationSlug,
}: {
  capabilities: readonly OrganizationCapability[];
  children: ReactNode;
  organizationSlug: string;
}) {
  return (
    <SettingsLayoutFrame
      nav={<SettingsNav organizationSlug={organizationSlug} capabilities={capabilities} />}
    >
      {children}
    </SettingsLayoutFrame>
  );
}
