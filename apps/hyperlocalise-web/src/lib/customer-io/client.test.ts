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
  getCustomerIoNewsletterActionTranslation,
  getCustomerIoTransactionalActionTranslation,
  listCustomerIoBroadcastActions,
  listCustomerIoCampaigns,
  listCustomerIoNewsletterActions,
  listCustomerIoNewsletters,
  listCustomerIoTransactionalActions,
  listCustomerIoTransactionalMessages,
  updateCustomerIoBroadcastActionTranslation,
  updateCustomerIoNewsletterActionTranslation,
  updateCustomerIoTransactionalActionTranslation,
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

describe("listCustomerIoNewsletters", () => {
  it("lists newsletters with the updated timestamp variant", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ newsletters: [{ id: 10, name: "Weekly", updated: 1552341937 }] }),
    );

    const newsletters = await listCustomerIoNewsletters({ apiKey: "key", region: "us", fetchImpl });

    expect(newsletters).toEqual([{ id: "10", name: "Weekly", updatedAt: expect.any(String) }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/newsletters?limit=100",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer key" }),
      }),
    );
  });
});

describe("listCustomerIoTransactionalMessages", () => {
  it("lists transactional templates", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ messages: [{ id: 5, name: "Receipt", updated_at: 1552341937 }] }),
    );

    const messages = await listCustomerIoTransactionalMessages({
      apiKey: "key",
      region: "eu",
      fetchImpl,
    });

    expect(messages).toEqual([{ id: "5", name: "Receipt", updatedAt: expect.any(String) }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api-eu.customer.io/v1/transactional?limit=100",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer key" }),
      }),
    );
  });
});

describe("newsletter and transactional variants", () => {
  it("reads newsletter contents as actions", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        contents: [
          { id: 101, name: "Default", type: "email", language: "", subject: "Hi", body: "Hello" },
        ],
      }),
    );

    const actions = await listCustomerIoNewsletterActions({
      apiKey: "key",
      region: "us",
      newsletterId: "10",
      fetchImpl,
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ id: "101", type: "email", subject: "Hi" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/newsletters/10/contents",
      expect.anything(),
    );
  });

  it("reads transactional contents as actions", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        contents: [{ id: 201, name: "Default", type: "email", language: "", subject: "Receipt" }],
      }),
    );

    const actions = await listCustomerIoTransactionalActions({
      apiKey: "key",
      region: "us",
      transactionalMessageId: "5",
      fetchImpl,
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ id: "201", type: "email" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/transactional/5/contents",
      expect.anything(),
    );
  });

  it("gets and updates newsletter and transactional translations by language", async () => {
    const getImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ subject: "Sujet", body: "Corps" }),
    );

    const newsletterTranslation = await getCustomerIoNewsletterActionTranslation({
      apiKey: "key",
      region: "us",
      newsletterId: "10",
      actionId: "101",
      language: "fr",
      fetchImpl: getImpl,
    });
    expect(newsletterTranslation).toMatchObject({ language: "fr", subject: "Sujet" });
    expect(getImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/newsletters/10/language/fr",
      expect.anything(),
    );

    const putImpl = vi.fn<typeof fetch>(async () => jsonResponse({}));

    await updateCustomerIoNewsletterActionTranslation({
      apiKey: "key",
      region: "us",
      newsletterId: "10",
      actionId: "101",
      language: "fr",
      payload: { type: "email", subject: "Sujet", body: "Corps" },
      fetchImpl: putImpl,
    });
    expect(putImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/newsletters/10/language/fr",
      expect.objectContaining({ method: "PUT" }),
    );

    const transactionalTranslation = await getCustomerIoTransactionalActionTranslation({
      apiKey: "key",
      region: "us",
      transactionalMessageId: "5",
      actionId: "201",
      language: "fr",
      fetchImpl: getImpl,
    });
    expect(transactionalTranslation).toMatchObject({ language: "fr" });

    await updateCustomerIoTransactionalActionTranslation({
      apiKey: "key",
      region: "us",
      transactionalMessageId: "5",
      actionId: "201",
      language: "fr",
      payload: { type: "email", subject: "Sujet", body: "Corps" },
      fetchImpl: putImpl,
    });
    expect(putImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/transactional/5/language/fr",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
