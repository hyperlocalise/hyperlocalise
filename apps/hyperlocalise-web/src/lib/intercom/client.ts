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
import { IntercomClient, IntercomError } from "intercom-client";

import { err, ok, type Result } from "@/lib/primitives/result/results";

import {
  INTERCOM_VALIDATE_TIMEOUT_MS,
  resolveIntercomRestBaseUrl,
  type IntercomRestEndpoint,
} from "./constants";
import type { IntercomConnectionError } from "./types";

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "TimeoutError")
  );
}

export function createIntercomClient(input: {
  accessToken: string;
  restEndpoint: IntercomRestEndpoint;
}): IntercomClient {
  return new IntercomClient({
    token: input.accessToken.trim(),
    environment: resolveIntercomRestBaseUrl(input.restEndpoint),
  });
}

/**
 * Confirms an access token by calling Intercom `/me` via the Node SDK.
 * Returns a workspace-safe label for validation messages (app name only).
 */
export async function validateIntercomAccessToken(input: {
  accessToken: string;
  restEndpoint: IntercomRestEndpoint;
  signal?: AbortSignal;
}): Promise<Result<{ appName: string | null }, IntercomConnectionError>> {
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    return err({
      code: "intercom_access_token_required",
      message: "An Intercom access token is required.",
    });
  }

  const signal = input.signal ?? AbortSignal.timeout(INTERCOM_VALIDATE_TIMEOUT_MS);
  const client = createIntercomClient({
    accessToken,
    restEndpoint: input.restEndpoint,
  });

  try {
    const identity = await client.admins.identify({ abortSignal: signal });
    const appName = identity?.app?.name?.trim() || null;
    return ok({ appName });
  } catch (error) {
    if (isAbortError(error) || (error instanceof Error && error.message.includes("Timed out"))) {
      return err({
        code: "intercom_validation_timeout",
        message: "Timed out connecting to the Intercom API.",
      });
    }

    if (error instanceof IntercomError) {
      const statusCode = error.statusCode;
      const message =
        statusCode === 401 || statusCode === 403
          ? "Intercom rejected this access token for the selected region."
          : error.message || "Unable to validate the Intercom access token.";
      return err({
        code: "intercom_connection_validation_failed",
        message,
      });
    }

    return err({
      code: "intercom_connection_validation_failed",
      message:
        error instanceof Error ? error.message : "Unable to validate the Intercom access token.",
    });
  }
}
