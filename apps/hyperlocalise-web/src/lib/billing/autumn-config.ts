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

export { AUTUMN_API_PATH_PREFIX, ORGANIZATION_SLUG_HEADER } from "./autumn-public-config";

/**
 * Resolves the Autumn secret key. The app stores `AUTUMN_API_KEY`; Autumn's SDK
 * also accepts `AUTUMN_SECRET_KEY`, which we mirror when a key is configured.
 */
export function getAutumnSecretKey(): string | undefined {
  return env.AUTUMN_API_KEY ?? process.env.AUTUMN_SECRET_KEY;
}

export function isAutumnConfigured(): boolean {
  return Boolean(getAutumnSecretKey());
}
