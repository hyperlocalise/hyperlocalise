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
import { createClient, type SanityClient } from "@sanity/client";

import { SANITY_API_VERSION } from "./constants";

export function createSanityClient(input: {
  token: string;
  projectId: string;
  dataset: string;
  includeDrafts?: boolean;
}): SanityClient {
  return createClient({
    projectId: input.projectId,
    dataset: input.dataset,
    apiVersion: SANITY_API_VERSION,
    token: input.token,
    useCdn: false,
    perspective: input.includeDrafts ? "previewDrafts" : "published",
  });
}

export type { SanityClient };
