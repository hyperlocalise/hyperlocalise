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
import type { UserNotificationPreferences } from "@/lib/notifications/user-notification-preferences";
import type { UserPreferences } from "@/lib/user-preferences/user-preferences";

import type { GoSvcRequestOptions } from "./go-svc-client.types";
import type { GoSvcRequest } from "./go-svc-request";

export type SessionAccount = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  notificationPreferences: UserNotificationPreferences;
  preferences: UserPreferences | null;
};

export type UpdateSessionProfileBody = {
  firstName: string;
  lastName: string;
};

export class GoSvcAccountApi {
  constructor(private readonly request: GoSvcRequest) {}

  get(options: GoSvcRequestOptions = {}) {
    return this.request.json<SessionAccount>("/v1/me", options);
  }

  updateProfile(body: UpdateSessionProfileBody, options: GoSvcRequestOptions = {}) {
    return this.request.json<SessionAccount>("/v1/me", {
      method: "PATCH",
      body,
      ...options,
    });
  }

  updatePreferences(body: UserPreferences, options: GoSvcRequestOptions = {}) {
    return this.request.json<SessionAccount>("/v1/me/preferences", {
      method: "PATCH",
      body,
      ...options,
    });
  }
}
