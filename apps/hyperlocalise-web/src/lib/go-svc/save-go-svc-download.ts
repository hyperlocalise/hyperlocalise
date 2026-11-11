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

import type { GoSvcDownload } from "@/lib/go-svc/go-svc-client.types";

const DOWNLOAD_RELEASE_MS = 40_000;

/** Saves a go-svc file download in the browser. */
export function saveGoSvcDownload(file: GoSvcDownload, fallbackFilename: string) {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename ?? fallbackFilename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_RELEASE_MS);
}
