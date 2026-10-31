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

import type { IterableRegion } from "./constants";

export type IterablePipesConnectionStatus = PipesConnectionStatus;

export type IterableConnectionSettings = {
  region: IterableRegion;
};

export type IterablePipesError =
  | { code: "iterable_pipes_unavailable"; message: string }
  | { code: "iterable_not_connected"; message: string }
  | { code: "iterable_pipes_needs_reauthorization"; message: string }
  | { code: "iterable_pipes_provider_missing"; message: string }
  | { code: "iterable_api_key_required"; message: string };

export type IterableSettingsError =
  | IterablePipesError
  | { code: "iterable_region_missing"; message: string }
  | { code: "iterable_region_invalid"; message: string }
  | { code: "iterable_credentials_invalid"; message: string }
  | { code: "iterable_region_unreachable"; message: string }
  | { code: "iterable_temporarily_unavailable"; message: string }
  | { code: "iterable_permission_missing"; message: string };

export type IterableEditorKind = "wysiwyg" | "side_by_side" | "drag_and_drop";

export type IterableResourceKind = "email" | "in_app" | "push" | "sms" | "snippet";
