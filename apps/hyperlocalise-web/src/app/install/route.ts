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
const installDocsUrl = "https://hyperlocalise.dev/getting-started/install";
const installScriptUrl =
  "https://raw.githubusercontent.com/hyperlocalise/hyperlocalise/main/install.sh";

function prefersHtml(acceptHeader: string | null): boolean {
  return acceptHeader?.toLowerCase().includes("text/html") ?? false;
}

export function GET(request: Request): Response {
  const destination = prefersHtml(request.headers.get("accept"))
    ? installDocsUrl
    : installScriptUrl;
  return new Response(null, {
    status: 308,
    headers: {
      Location: destination,
      Vary: "Accept",
    },
  });
}
