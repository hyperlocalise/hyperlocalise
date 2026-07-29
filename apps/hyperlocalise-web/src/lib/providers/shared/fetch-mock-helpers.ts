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
export function requestUrlString(url: Parameters<typeof fetch>[0]): string {
  if (typeof url === "string") {
    return url;
  }
  if (url instanceof URL) {
    return url.toString();
  }
  return url.url;
}

export function requestBodyString(body: BodyInit | null | undefined): string {
  if (typeof body === "string") {
    return body;
  }
  throw new Error(
    body == null
      ? "Expected fetch mock request body"
      : `Unsupported fetch mock body type: ${typeof body}`,
  );
}
