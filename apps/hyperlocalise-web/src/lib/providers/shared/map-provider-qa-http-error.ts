/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
const clientErrorCodes = new Set([
  "external_tms_project_not_found",
  "provider_credential_not_found",
  "unsupported_provider_model",
  "forbidden",
  "crowdin_auth_invalid",
  "phrase_auth_invalid",
  "smartling_auth_invalid",
  "smartling_credentials_invalid",
  "smartling_account_uid_required",
]);

function readProviderQaErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isClientProviderQaError(message: string): boolean {
  if (clientErrorCodes.has(message)) {
    return true;
  }

  if (
    message.startsWith("invalid_") ||
    message.endsWith("_auth_invalid") ||
    message.endsWith("_credentials_invalid")
  ) {
    return true;
  }

  if (message.startsWith("Provider ") && message.includes("does not support content pull")) {
    return true;
  }

  return false;
}

function isServiceUnavailableProviderQaError(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("queue unavailable") ||
    normalized.includes("api_unavailable") ||
    normalized.includes("http 429") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("econnreset") ||
    normalized.includes("enotfound") ||
    normalized.includes("network")
  );
}

export type ProviderQaHttpStatus = 400 | 500 | 503;

export function mapProviderQaErrorToHttpStatus(error: unknown): ProviderQaHttpStatus {
  const message = readProviderQaErrorMessage(error);

  if (isClientProviderQaError(message)) {
    return 400;
  }

  if (isServiceUnavailableProviderQaError(message)) {
    return 503;
  }

  return 500;
}
