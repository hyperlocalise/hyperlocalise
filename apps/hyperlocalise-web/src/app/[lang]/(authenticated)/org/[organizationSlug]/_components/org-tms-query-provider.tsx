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
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  activeTmsProviderQueryKey,
  fetchActiveTmsProviderConnection,
  TMS_PROVIDER_CONNECTION_STALE_TIME_MS,
  type ActiveTmsProviderConnection,
} from "../_hooks/use-active-tms-provider";

export function OrgTmsQueryProvider({
  children,
  initialTmsProviderConnection,
  organizationSlug,
}: {
  children: ReactNode;
  initialTmsProviderConnection: ActiveTmsProviderConnection | null;
  organizationSlug: string;
}) {
  useQuery({
    queryKey: activeTmsProviderQueryKey(organizationSlug),
    queryFn: () => fetchActiveTmsProviderConnection(organizationSlug),
    initialData: initialTmsProviderConnection,
    staleTime: TMS_PROVIDER_CONNECTION_STALE_TIME_MS,
  });

  return children;
}
