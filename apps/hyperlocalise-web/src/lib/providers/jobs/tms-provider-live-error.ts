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
export class TmsProviderLiveError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "TmsProviderLiveError";
  }
}

/**
 * Raised when some provider jobs were created before a later locale/task failed.
 * Callers should expose {@link createdCount} / {@link jobs} so clients can refresh
 * and avoid duplicate retries for the locales that already succeeded.
 */
export class TmsProviderLivePartialCreateError extends TmsProviderLiveError {
  constructor(
    message: string,
    readonly createdCount: number,
    readonly jobs: unknown[],
  ) {
    super("provider_task_create_partial", message);
    this.name = "TmsProviderLivePartialCreateError";
  }
}
