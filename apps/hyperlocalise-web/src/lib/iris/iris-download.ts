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

// The Iris desktop release workflow publishes each build's DMG to the same
// unversioned key in its update feed, so these always point at the latest release.
export const IRIS_DOWNLOAD_ORIGIN = "https://iris.hyperlocalise.com/iris";

export type IrisMacArch = "arm64" | "x64";

export function irisMacDownloadUrl(arch: IrisMacArch) {
  return `${IRIS_DOWNLOAD_ORIGIN}/darwin/${arch}/Iris-${arch}.dmg`;
}
