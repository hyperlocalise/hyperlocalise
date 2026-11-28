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
import { useQuery } from "@tanstack/react-query";

import { createApiClient } from "@/lib/api-client";

const api = createApiClient();

export const bitbucketConnectionsQueryKey = (organizationSlug: string) =>
  ["bitbucket", organizationSlug, "connections"] as const;

/** Every connection, the default first; empty when there are none or this person can't see them. */
export function useBitbucketConnections(organizationSlug: string) {
  return useQuery({
    queryKey: bitbucketConnectionsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].bitbucket.connections.$get({
        param: { organizationSlug },
      });
      if (response.status === 403) {
        return [];
      }
      if (!response.ok) {
        throw new Error("bitbucket_connections_load_failed");
      }
      const body = await response.json();
      return "bitbucketConnections" in body ? body.bitbucketConnections : [];
    },
  });
}
