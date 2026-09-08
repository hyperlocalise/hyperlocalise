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
import { getPublicApiProtectedResourceMetadata } from "../../../../../lib/workos/agent-access-token";
import { getWorkosAuthkitIssuerUrl } from "../../../../../lib/workos/config";

export function GET(request: Request) {
  if (!getWorkosAuthkitIssuerUrl()) {
    return new Response(null, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  return Response.json(getPublicApiProtectedResourceMetadata(origin));
}
