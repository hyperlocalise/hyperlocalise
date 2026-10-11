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

import { err, ok, type Result } from "@/lib/primitives/result/results";

import { resolveBrazeRestBaseUrl, type BrazeRestEndpoint } from "./constants";

export const BRAZE_CREDENTIALS_INVALID = {
  code: "braze_credentials_invalid" as const,
  message: "Braze rejected this API key for that REST cluster. Check both and try again.",
};

export const BRAZE_CLUSTER_UNREACHABLE = {
  code: "braze_cluster_unreachable" as const,
  message:
    "Could not reach that Braze REST cluster. Confirm the cluster matches the instance that issued the key.",
};

export const BRAZE_REQUIRED_PERMISSION_PINGS = [
  {
    permission: "templates.email.list",
    path: "/templates/email/list?limit=1&offset=0",
  },
  {
    permission: "content_blocks.list",
    path: "/content_blocks/list?limit=1&offset=0",
  },
  {
    permission: "campaigns.list",
    path: "/campaigns/list?page=0",
  },
  {
    permission: "canvas.list",
    path: "/canvas/list?page=0",
  },
] as const;

export type BrazeRequiredPermission =
  (typeof BRAZE_REQUIRED_PERMISSION_PINGS)[number]["permission"];

export function brazePermissionMissingError(permissions: readonly BrazeRequiredPermission[]): {
  code: "braze_permission_missing";
  message: string;
} {
  return {
    code: "braze_permission_missing",
    message: `This API key is missing Braze permissions: ${permissions.join(", ")}. Add them in Settings → APIs and Identifiers, then save again.`,
  };
}

export type BrazePingError =
  | typeof BRAZE_CREDENTIALS_INVALID
  | typeof BRAZE_CLUSTER_UNREACHABLE
  | ReturnType<typeof brazePermissionMissingError>;

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

async function pingBrazePath(input: {
  apiKey: string;
  restEndpoint: BrazeRestEndpoint;
  path: string;
  fetchImpl: typeof fetch;
}): Promise<{ status: number } | { unreachable: true }> {
  try {
    const response = await input.fetchImpl(
      `${resolveBrazeRestBaseUrl(input.restEndpoint)}${input.path}`,
      {
        headers: {
          Authorization: `Bearer ${input.apiKey.trim()}`,
          Accept: "application/json",
        },
      },
    );
    return { status: response.status };
  } catch {
    return { unreachable: true };
  }
}

export async function pingBrazeRestCredentials(input: {
  apiKey: string;
  restEndpoint: BrazeRestEndpoint;
  fetchImpl?: typeof fetch;
}): Promise<Result<true, BrazePingError>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const outcomes = await Promise.all(
    BRAZE_REQUIRED_PERMISSION_PINGS.map(async (check) => ({
      permission: check.permission,
      result: await pingBrazePath({
        apiKey: input.apiKey,
        restEndpoint: input.restEndpoint,
        path: check.path,
        fetchImpl,
      }),
    })),
  );

  const succeeded = outcomes.filter(
    (outcome) =>
      "status" in outcome.result && outcome.result.status >= 200 && outcome.result.status < 300,
  );
  const authFailures = outcomes.filter(
    (outcome) => "status" in outcome.result && isAuthFailure(outcome.result.status),
  );
  const unreachable = outcomes.filter((outcome) => "unreachable" in outcome.result);

  if (succeeded.length === BRAZE_REQUIRED_PERMISSION_PINGS.length) {
    return ok(true);
  }
  if (succeeded.length > 0 && authFailures.length > 0) {
    return err(brazePermissionMissingError(authFailures.map((outcome) => outcome.permission)));
  }
  if (authFailures.length > 0 && unreachable.length === 0) {
    return err(BRAZE_CREDENTIALS_INVALID);
  }
  return err(BRAZE_CLUSTER_UNREACHABLE);
}
