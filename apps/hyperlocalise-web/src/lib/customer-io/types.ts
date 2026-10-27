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
import type { PipesConnectionStatus } from "@/lib/pipes/types";

import type { CustomerIoRegion } from "./constants";

export type CustomerIoPipesConnectionStatus = PipesConnectionStatus;

export type CustomerIoConnectionSettings = {
  region: CustomerIoRegion;
};

export type CustomerIoPipesError =
  | { code: "customer_io_pipes_unavailable"; message: string }
  | { code: "customer_io_not_connected"; message: string }
  | { code: "customer_io_pipes_needs_reauthorization"; message: string }
  | { code: "customer_io_api_key_required"; message: string };

export type CustomerIoSettingsError =
  | CustomerIoPipesError
  | { code: "customer_io_region_missing"; message: string }
  | { code: "customer_io_region_invalid"; message: string }
  | { code: "customer_io_credentials_invalid"; message: string }
  | { code: "customer_io_region_unreachable"; message: string }
  | { code: "customer_io_temporarily_unavailable"; message: string }
  | { code: "customer_io_permission_missing"; message: string };
