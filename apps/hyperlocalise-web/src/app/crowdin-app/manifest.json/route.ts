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
import { NextResponse } from "next/server";

import { buildCrowdinAppManifest } from "@/lib/crowdin-app/manifest";

export function GET() {
  return NextResponse.json(buildCrowdinAppManifest(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
