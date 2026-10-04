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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { enqueueActivityLogEvent } from "./activity-log-writer";
import {
  enqueueIntegrationConnectedActivity,
  enqueueIntegrationDisconnectedActivity,
} from "./integration-events";

vi.mock("./activity-log-writer", () => ({
  enqueueActivityLogEvent: vi.fn(),
}));

const enqueueMock = vi.mocked(enqueueActivityLogEvent);

const actor = {
  actorCredentialId: null,
  actorKind: "user" as const,
  actorUserId: "user-1",
};

describe("integration activity helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records a connection without secrets", async () => {
    await enqueueIntegrationConnectedActivity({
      ...actor,
      connectionId: "conn-1",
      integrationKind: "github",
      organizationId: "org-1",
    });

    expect(enqueueMock).toHaveBeenCalledWith({
      ...actor,
      eventType: "integration_connected",
      organizationId: "org-1",
      payload: { connectionId: "conn-1", integrationKind: "github" },
      targetId: "conn-1",
      targetKind: "integration",
    });
    expect(JSON.stringify(enqueueMock.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(enqueueMock.mock.calls)).not.toContain("token");
  });

  it("records a disconnection with the same safe identifiers", async () => {
    await enqueueIntegrationDisconnectedActivity({
      ...actor,
      connectionId: "conn-1",
      integrationKind: "openai",
      organizationId: "org-1",
    });

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "integration_disconnected",
        payload: { connectionId: "conn-1", integrationKind: "openai" },
      }),
    );
  });
});
