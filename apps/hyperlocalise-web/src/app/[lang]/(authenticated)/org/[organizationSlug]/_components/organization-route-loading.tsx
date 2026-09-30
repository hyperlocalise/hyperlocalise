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
import { Skeleton } from "@/components/ui/skeleton";

import { WorkspacePageShell } from "./workspace-resource-shared";

export function OrganizationRouteLoading() {
  return (
    <WorkspacePageShell aria-busy="true" aria-live="polite">
      <div className="flex justify-end">
        <Skeleton className="h-9 w-28 shrink-0" />
      </div>

      <div className="grid gap-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-3/4" />
      </div>
    </WorkspacePageShell>
  );
}
