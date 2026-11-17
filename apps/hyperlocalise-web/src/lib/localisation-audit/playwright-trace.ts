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
 * Route that must receive `playwright-core`, including `browsers.json`.
 *
 * Workflow v5 runs steps inside `/.well-known/workflow/v1/flow` and does not
 * generate the old step route. `playwright-core` loads `browsers.json` through
 * `path.join(packageRoot, "browsers.json")`, which file tracing cannot see.
 */
export const PLAYWRIGHT_CORE_TRACE_ROUTE = "/.well-known/workflow/v1/flow";

/** pnpm layout used on Vercel. `__dirname` in `coreBundle.js` is this directory. */
export const PLAYWRIGHT_CORE_TRACE_GLOBS = [
  "./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**/*",
] as const;
