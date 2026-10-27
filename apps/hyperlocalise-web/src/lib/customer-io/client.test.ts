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

import {
  CustomerIoApiError,
  getCustomerIoBroadcastActionTranslation,
  listCustomerIoBroadcastActions,
  listCustomerIoCampaigns,
  updateCustomerIoBroadcastActionTranslation,
} from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("listCustomerIoCampaigns", () => {
  it("lists automations with ids and names", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ campaigns: [{ id: 7, name: "Onboarding", updated_at: 1552341937 }] }),
    );

    const campaigns = await listCustomerIoCampaigns({ apiKey: "key", region: "us", fetchImpl });

    expect(campaigns).toEqual([{ id: "7", name: "Onboarding", updatedAt: expect.any(String) }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/campaigns?limit=100",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer key" }),
      }),
    );
  });

  it("maps failures to CustomerIoApiError", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}, 401));

    const error = await listCustomerIoCampaigns({ apiKey: "bad", region: "us", fetchImpl }).catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(CustomerIoApiError);
    expect((error as CustomerIoApiError).code).toBe("customer_io_unauthorized");
  });
});

describe("listCustomerIoBroadcastActions", () => {
  it("reads action content fields", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        actions: [
          {
            id: 96,
            name: "Opening Message",
            type: "email",
            language: "",
            subject: "Hello",
            body: "World",
            updated: 1552341937,
          },
          { id: 97, type: "webhook", language: "" },
        ],
      }),
    );

    const actions = await listCustomerIoBroadcastActions({
      apiKey: "key",
      region: "eu",
      broadcastId: "2",
      fetchImpl,
    });

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      id: "96",
      name: "Opening Message",
      type: "email",
      subject: "Hello",
      body: "World",
      updatedAt: expect.any(String),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api-eu.customer.io/v1/broadcasts/2/actions",
      expect.anything(),
    );
  });
});

describe("broadcast action translations", () => {
  it("returns null when the language variant does not exist", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 404 }));

    const translation = await getCustomerIoBroadcastActionTranslation({
      apiKey: "key",
      region: "us",
      broadcastId: "2",
      actionId: "96",
      language: "fr",
      fetchImpl,
    });

    expect(translation).toBeNull();
  });

  it("updates a translation with a PUT", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}));

    await updateCustomerIoBroadcastActionTranslation({
      apiKey: "key",
      region: "us",
      broadcastId: "2",
      actionId: "96",
      language: "fr",
      payload: { type: "email", subject: "Sujet", body: "Corps" },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/broadcasts/2/actions/96/language/fr",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
