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

/** Canva editor hosts that may embed or open the integration. */
export const DEFAULT_CANVA_EDITOR_ORIGINS = [
  "https://app.canva.com",
  "https://www.canva.com",
  "https://canva.com",
] as const;

/**
 * Canva Apps iframe origin, e.g. https://app-aahognqjkw4.canva-apps.com
 * @see https://www.canva.dev/docs/apps/previewing-apps/
 */
const CANVA_APPS_ORIGIN_PATTERN = /^https:\/\/app-[a-z0-9]+\.canva-apps\.com$/i;

export function isCanvaAppsIframeOrigin(origin: string): boolean {
  return CANVA_APPS_ORIGIN_PATTERN.test(origin);
}
