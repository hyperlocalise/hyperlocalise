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
export const DEFAULT_FIGMA_PLUGIN_ORIGINS = [
  "https://www.figma.com",
  "https://figma.com",
  "null",
] as const;

export const FIGMA_OAUTH_MESSAGE_TYPE = "hyperlocalise-figma-oauth";

export type FigmaOAuthMessage = {
  type: typeof FIGMA_OAUTH_MESSAGE_TYPE;
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
};

export function postFigmaOAuthResult(
  opener: { postMessage: (message: unknown, targetOrigin: string) => void },
  payload: FigmaOAuthMessage,
) {
  for (const targetOrigin of DEFAULT_FIGMA_PLUGIN_ORIGINS) {
    opener.postMessage(payload, targetOrigin);
  }
}
