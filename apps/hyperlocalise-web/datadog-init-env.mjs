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

// dd-trace's default query-string obfuscation only matches known secret
// parameter names. This app puts customer translation text in `search`
// (see tm-entry-list-state.ts). `.*` redacts the entire query string
// before it is written to http.url.
export const COMPLETE_QUERY_STRING_REDACTION_REGEXP = ".*";

/**
 * Assign deployment tags and data-safety defaults before dd-trace loads.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function applyDatadogInitEnv(env) {
  if (!env.DD_ENV && env.VERCEL_ENV) {
    env.DD_ENV = env.VERCEL_ENV;
  }
  if (!env.DD_VERSION && env.VERCEL_GIT_COMMIT_SHA) {
    env.DD_VERSION = env.VERCEL_GIT_COMMIT_SHA;
  }

  // Force complete redaction. A weaker operator override would leak
  // customer search text into http.url.
  env.DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP = COMPLETE_QUERY_STRING_REDACTION_REGEXP;

  return env;
}
