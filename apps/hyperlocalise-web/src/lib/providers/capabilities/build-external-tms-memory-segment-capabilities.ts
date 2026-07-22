/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { schema } from "@/lib/database";

export type ExternalTmsMemoryCapabilityMode =
  (typeof schema.externalTmsMemoryCapabilityModeEnum.enumValues)[number];

export function buildExternalTmsMemorySegmentCapabilities(mode: ExternalTmsMemoryCapabilityMode) {
  switch (mode) {
    case "live_search":
      return {
        mode,
        search: true,
        import: false,
        export: false,
        referenceOnly: false,
      };
    case "synced_import":
      return {
        mode,
        search: true,
        import: true,
        export: true,
        referenceOnly: false,
      };
    case "reference_only":
      return {
        mode,
        search: false,
        import: false,
        export: false,
        referenceOnly: true,
      };
  }
}
