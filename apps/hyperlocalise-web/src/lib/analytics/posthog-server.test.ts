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
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/workos/server-auth", () => ({
  withAuth: vi.fn(async () => {
    throw new Error("withAuth should not run when a session resolver is injected");
  }),
}));

import { trackPostHogServerEvent } from "./posthog-server";

describe("trackPostHogServerEvent", () => {
  it("no-ops when the project token is missing", async () => {
    const captureFn = vi.fn();

    await trackPostHogServerEvent("project_created", { status: "created" }, { captureFn });

    expect(captureFn).not.toHaveBeenCalled();
  });

  it("captures with the WorkOS user id when a session exists", async () => {
    const captureFn = vi.fn();

    await trackPostHogServerEvent(
      "workspace_created",
      { status: "created", source: "onboarding" },
      {
        projectToken: "phc_test",
        captureFn,
        resolveSession: async () => ({ user: { id: "user_workos_1" } }),
      },
    );

    expect(captureFn).toHaveBeenCalledOnce();
    expect(captureFn).toHaveBeenCalledWith({
      distinctId: "user_workos_1",
      event: "workspace_created",
      properties: { status: "created", source: "onboarding" },
    });
  });

  it("does not create a person profile for anonymous server events", async () => {
    const captureFn = vi.fn();

    await trackPostHogServerEvent(
      "localisation_audit_completed",
      { outcome: "succeeded" },
      {
        projectToken: "phc_test",
        captureFn,
        resolveSession: async () => null,
      },
    );

    expect(captureFn).toHaveBeenCalledOnce();
    const event = captureFn.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      event: "localisation_audit_completed",
      properties: { outcome: "succeeded", $process_person_profile: false },
    });
    expect(typeof event?.distinctId).toBe("string");
    expect(event?.distinctId).not.toBe("server");
    expect(event?.distinctId).not.toBe("anonymous");
  });

  it("swallows capture failures", async () => {
    await expect(
      trackPostHogServerEvent(
        "seat_added",
        { status: "created" },
        {
          projectToken: "phc_test",
          distinctId: "user_1",
          captureFn: () => {
            throw new Error("posthog down");
          },
        },
      ),
    ).resolves.toBeUndefined();
  });
});
