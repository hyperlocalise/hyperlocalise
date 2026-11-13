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

import { createHash } from "node:crypto";

/** SHA-256 of HubSpot content. Server-only: the editor imports `document.ts` in the browser. */
export function hashHubspotContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
