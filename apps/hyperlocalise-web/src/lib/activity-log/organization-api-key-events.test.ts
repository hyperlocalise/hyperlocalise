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
import { describe, expect, it } from "vite-plus/test";

import {
  organizationApiKeyCreatedActivity,
  organizationApiKeyRevokedActivity,
} from "./organization-api-key-events";

const userActor = {
  actorCredentialId: null,
  actorKind: "user" as const,
  actorUserId: "user_1",
};

describe("organization API key activity events", () => {
  it("records create and revoke payloads without secrets", () => {
    expect(
      organizationApiKeyCreatedActivity({
        ...userActor,
        apiKeyId: "key_1",
        keyPrefix: "hl_AbCd",
        name: "CI deploy",
        organizationId: "org_1",
        permissions: ["jobs:read", "jobs:write"],
      }),
    ).toMatchObject({
      eventType: "organization_api_key_created",
      payload: {
        apiKeyId: "key_1",
        keyPrefix: "hl_AbCd",
        name: "CI deploy",
        permissions: ["jobs:read", "jobs:write"],
      },
      targetId: "key_1",
      targetKind: "organization_api_key",
    });

    expect(
      organizationApiKeyRevokedActivity({
        actorCredentialId: null,
        actorKind: "system",
        actorUserId: null,
        apiKeyId: "key_1",
        keyPrefix: "hl_AbCd",
        name: "CI deploy",
        organizationId: "org_1",
        reason: "membership_removed",
      }),
    ).toMatchObject({
      eventType: "organization_api_key_revoked",
      payload: {
        apiKeyId: "key_1",
        keyPrefix: "hl_AbCd",
        name: "CI deploy",
        reason: "membership_removed",
      },
      targetKind: "organization_api_key",
    });
  });
});
