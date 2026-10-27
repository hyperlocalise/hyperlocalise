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
import { z } from "zod";

import { CUSTOMER_IO_REGIONS } from "@/lib/customer-io/constants";

export const upsertCustomerIoConnectionBodySchema = z.object({
  region: z.enum(CUSTOMER_IO_REGIONS),
  apiKey: z.string().optional(),
});

export const customerIoLibraryQuerySchema = z.object({
  projectId: z.string().trim().min(1).max(128).optional(),
});
