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

import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import type { CustomerIoRegion } from "./constants";
import { loadCustomerIoPipesApiKey, resolveCustomerIoPipesWorkosUserId } from "./pipes";
import { loadCustomerIoRegion } from "./settings";
import type { CustomerIoSettingsError } from "./types";

export type CustomerIoAutomationClient = {
  apiKey: string;
  region: CustomerIoRegion;
};

export async function loadCustomerIoAutomationClient(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  localUserId?: string | null;
}): Promise<Result<CustomerIoAutomationClient, CustomerIoSettingsError>> {
  const workosUserId = await resolveCustomerIoPipesWorkosUserId({
    workosUserId: input.workosUserId,
    localUserId: input.localUserId,
  });
  if (!workosUserId) {
    return err({
      code: "customer_io_not_connected",
      message: "Connect Customer.io in Integrations before using it.",
    });
  }

  const apiKey = await loadCustomerIoPipesApiKey({
    localOrganizationId: input.localOrganizationId,
    workosUserId,
  });
  if (isErr(apiKey)) {
    return apiKey;
  }

  const region = await loadCustomerIoRegion({
    localOrganizationId: input.localOrganizationId,
    workosUserId,
  });
  if (isErr(region)) {
    return region;
  }

  return ok({ apiKey: apiKey.value, region: region.value });
}
