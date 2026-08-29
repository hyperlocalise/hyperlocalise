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
import { buildDisavowFile } from "@/lib/seo/disavow-file";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildDisavowFile(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'inline; filename="disavow.txt"',
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
