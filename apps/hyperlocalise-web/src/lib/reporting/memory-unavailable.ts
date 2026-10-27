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
 * The error a strict Reports write throws when the project's memory cannot be read or scored, so
 * a caller can tell that from a failed write: only then may the strings be recorded without match
 * bands instead. On its own, with no Node modules, so a workflow function can import it: the
 * workflow bundler refuses Node modules in workflow code.
 */

/**
 * Starts the error's message: a stable code, matched on the message because a step's error
 * reaches its workflow through the runtime's serialisation, which keeps an error's message but
 * is not documented to keep other fields. A thrown error is needed so the runtime retries the
 * step first.
 */
export const MEMORY_UNAVAILABLE = "reporting_memory_unavailable";

export function isMemoryUnavailableError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(MEMORY_UNAVAILABLE);
}

/**
 * A plain error with the cause's message only: a step's failure crosses the workflow runtime's
 * serialisation, which a database error kept as `cause` might not survive.
 */
export function memoryUnavailable(error: unknown): Error {
  return new Error(
    `${MEMORY_UNAVAILABLE}: ${error instanceof Error ? error.message : String(error)}`,
  );
}
