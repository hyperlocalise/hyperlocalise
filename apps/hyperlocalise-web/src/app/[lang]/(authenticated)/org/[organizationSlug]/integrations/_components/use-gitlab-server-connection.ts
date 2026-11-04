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
import { useQuery } from "@tanstack/react-query";

import { createApiClient } from "@/lib/api-client";

const api = createApiClient();

/** The saved connection, or null when there is none or this person's role can't see it. */
export function useGitLabServerConnection(organizationSlug: string) {
  return useQuery({
    queryKey: ["gitlab", organizationSlug, "connection"],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].gitlab.connection.$get({
        param: { organizationSlug },
      });
      if (response.status === 403) {
        return null;
      }
      if (!response.ok) {
        throw new Error("gitlab_connection_load_failed");
      }
      const body = await response.json();
      return "gitlabConnection" in body ? body.gitlabConnection : null;
    },
  });
}
