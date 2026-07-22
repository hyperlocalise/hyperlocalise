/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { WorkOS } from "@workos-inc/node";

import { getWorkosAuthKitConfig } from "@/lib/workos/config";

let workosClient: WorkOS | null | undefined;

export function getWorkosServerClient(): WorkOS | null {
  if (workosClient !== undefined) {
    return workosClient;
  }

  const config = getWorkosAuthKitConfig();
  if (!config) {
    workosClient = null;
    return workosClient;
  }

  workosClient = new WorkOS(config.apiKey);
  return workosClient;
}
