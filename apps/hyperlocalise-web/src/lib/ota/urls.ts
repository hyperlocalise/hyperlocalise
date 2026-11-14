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
import { env } from "@/lib/env";

export const DEFAULT_OTA_PUBLIC_BASE_URL = "https://ota.hyperlocalise.com";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function hostedOtaPublicBaseUrl(): string {
  const configured = env.OTA_PUBLIC_BASE_URL?.trim();
  if (configured) {
    return trimTrailingSlash(configured);
  }
  return DEFAULT_OTA_PUBLIC_BASE_URL;
}

export function otaManifestUrl(baseUrl: string, hash: string): string {
  return `${trimTrailingSlash(baseUrl)}/${hash}/manifest.json`;
}

export function otaContentUrl(baseUrl: string, hash: string, contentPath: string): string {
  const relative = contentPath.startsWith("/") ? contentPath : `/${contentPath}`;
  return `${trimTrailingSlash(baseUrl)}/${hash}${relative}`;
}
