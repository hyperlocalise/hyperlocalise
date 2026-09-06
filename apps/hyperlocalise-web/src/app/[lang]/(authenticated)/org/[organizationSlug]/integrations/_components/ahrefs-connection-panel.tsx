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
import { AHREFS_PIPES_SLUG } from "@/lib/ahrefs/constants";

import { PipesConnectionPanel, usePipesStatus } from "./pipes-connection-panel";

export function useAhrefsPipesStatus(organizationSlug: string, refetchWhileOpen = false) {
  return usePipesStatus(organizationSlug, AHREFS_PIPES_SLUG, refetchWhileOpen);
}

export function AhrefsConnectionPanel({
  organizationSlug,
  disabled,
  isLast = false,
}: {
  organizationSlug: string;
  disabled?: boolean;
  isLast?: boolean;
}) {
  return (
    <PipesConnectionPanel
      organizationSlug={organizationSlug}
      provider={AHREFS_PIPES_SLUG}
      disabled={disabled}
      isLast={isLast}
    />
  );
}
