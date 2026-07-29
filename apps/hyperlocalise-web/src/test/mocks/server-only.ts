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

/**
 * Vitest stub for `server-only`.
 *
 * The real package throws when imported outside a React Server Component
 * context. AuthKit 4.3+ (and some app modules) import it at module scope,
 * which breaks route/auth tests that load those modules via `importOriginal`.
 */
export {};
