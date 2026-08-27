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

const FIGMA_CALLBACK_PATH = "/auth/figma/callback";
const DEFAULT_LOCAL_FIGMA_REDIRECT_URI = `http://localhost:3000${FIGMA_CALLBACK_PATH}`;

/**
 * HTTPS (or local HTTP) callback used by the Figma plugin PKCE popup.
 * Register this exact URI in the WorkOS AuthKit redirect allowlist.
 */
export function getFigmaRedirectUri(): string {
    if (env.WORKOS_FIGMA_REDIRECT_URI) {
        return env.WORKOS_FIGMA_REDIRECT_URI;
    }

    if (env.HYPERLOCALISE_PUBLIC_APP_URL) {
        return new URL(FIGMA_CALLBACK_PATH, env.HYPERLOCALISE_PUBLIC_APP_URL).toString();
    }

    if (env.WORKOS_REDIRECT_URI) {
        return new URL(FIGMA_CALLBACK_PATH, env.WORKOS_REDIRECT_URI).toString();
    }

    return DEFAULT_LOCAL_FIGMA_REDIRECT_URI;
}

export function isFigmaRedirectUri(redirectUri: string): boolean {
    return redirectUri.trim() === getFigmaRedirectUri();
}
