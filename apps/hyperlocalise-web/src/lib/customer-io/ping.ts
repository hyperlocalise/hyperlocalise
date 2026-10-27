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

import { resolveCustomerIoBaseUrl, type CustomerIoRegion } from "./constants";

export const CUSTOMER_IO_CREDENTIALS_INVALID = {
  code: "customer_io_credentials_invalid" as const,
  message: "Customer.io rejected this API key for that region. Check both and try again.",
};

export const CUSTOMER_IO_REGION_UNREACHABLE = {
  code: "customer_io_region_unreachable" as const,
  message:
    "Could not reach that Customer.io region. Confirm the region matches the workspace that issued the key.",
};

export const CUSTOMER_IO_TEMPORARILY_UNAVAILABLE = {
  code: "customer_io_temporarily_unavailable" as const,
  message: "Customer.io did not accept the request. Wait a moment and try saving again.",
};

export function customerIoPermissionMissingError(): {
  code: "customer_io_permission_missing";
  message: string;
} {
  return {
    code: "customer_io_permission_missing",
    message:
      "This API key is missing Customer.io permissions. Use an App API key with read/write access to campaigns, newsletters, broadcasts, and transactional messages.",
  };
}

export type CustomerIoPingError =
  | typeof CUSTOMER_IO_CREDENTIALS_INVALID
  | typeof CUSTOMER_IO_REGION_UNREACHABLE
  | typeof CUSTOMER_IO_TEMPORARILY_UNAVAILABLE
  | ReturnType<typeof customerIoPermissionMissingError>;

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

export async function pingCustomerIoCredentials(input: {
  apiKey: string;
  region: CustomerIoRegion;
  fetchImpl?: typeof fetch;
}): Promise<Result<true, CustomerIoPingError>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${resolveCustomerIoBaseUrl(input.region)}/broadcasts?limit=1`, {
      headers: {
        Authorization: `Bearer ${input.apiKey.trim()}`,
        Accept: "application/json",
      },
    });
  } catch {
    return err(CUSTOMER_IO_REGION_UNREACHABLE);
  }

  if (response.status >= 200 && response.status < 300) {
    return ok(true);
  }
  if (isAuthFailure(response.status)) {
    return err(CUSTOMER_IO_CREDENTIALS_INVALID);
  }
  if (response.status === 429 || response.status >= 500) {
    return err(CUSTOMER_IO_TEMPORARILY_UNAVAILABLE);
  }
  return err(CUSTOMER_IO_REGION_UNREACHABLE);
}
