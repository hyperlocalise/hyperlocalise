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
  getCustomerIoResourceAction,
  getCustomerIoTransactionalActionTranslation,
  listCustomerIoBroadcastActions,
  listCustomerIoBroadcasts,
  listCustomerIoCampaigns,
  listCustomerIoNewsletterActions,
  listCustomerIoNewsletters,
  listCustomerIoTransactionalActions,
  listCustomerIoTransactionalMessages,
  readCustomerIoErrorDetail,
  updateCustomerIoBroadcastActionTranslation,
  updateCustomerIoNewsletterActionTranslation,
  updateCustomerIoTransactionalActionTranslation,
} from "./client";
import {
  REAL_BROADCAST_ACTION_DETAIL,
  REAL_BROADCAST_ACTIONS_LIST,
  REAL_BROADCASTS_LIST,
  REAL_NEWSLETTER_CONTENT_DETAIL,
  REAL_NEWSLETTER_CONTENTS_LIST,
  REAL_NEWSLETTERS_LIST,
  REAL_TRANSACTIONAL_LIST,
} from "./client.real-api.fixture";

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

  it("returns null when Customer.io rejects the language tag", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ errors: [] }, 400));

    const translation = await getCustomerIoBroadcastActionTranslation({
      apiKey: "key",
      region: "us",
      broadcastId: "2",
      actionId: "96",
      language: "zh-CN",
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

  it("includes Customer.io's error detail in failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          errors: [
            { detail: "content from the drag-and-drop editor cannot be modified", status: "400" },
          ],
        },
        400,
      ),
    );

    const error = await updateCustomerIoBroadcastActionTranslation({
      apiKey: "key",
      region: "us",
      broadcastId: "2",
      actionId: "96",
      language: "zh-CN",
      payload: { type: "email", subject: "Sujet", body: "Corps" },
      fetchImpl,
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CustomerIoApiError);
    expect((error as CustomerIoApiError).message).toContain(
      "content from the drag-and-drop editor cannot be modified",
    );
  });
});

describe("readCustomerIoErrorDetail", () => {
  it("reads errors array details", () => {
    expect(readCustomerIoErrorDetail({ errors: [{ detail: "bad tag", status: "400" }] })).toBe(
      "bad tag",
    );
  });

  it("reads error and message shapes", () => {
    expect(readCustomerIoErrorDetail({ error: "nope" })).toBe("nope");
    expect(readCustomerIoErrorDetail({ message: "broke" })).toBe("broke");
  });

  it("returns null for empty or invalid bodies", () => {
    expect(readCustomerIoErrorDetail(null)).toBeNull();
    expect(readCustomerIoErrorDetail({})).toBeNull();
    expect(readCustomerIoErrorDetail({ errors: [] })).toBeNull();
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

  it("follows the list next token as start", async () => {
    const seenPaths: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      const path = href.replace("https://api.customer.io/v1", "");
      seenPaths.push(path);
      if (path.includes("start=")) {
        return jsonResponse({ newsletters: [{ id: 11, name: "Monthly", updated: 1552341937 }] });
      }
      return jsonResponse({
        newsletters: [{ id: 10, name: "Weekly", updated: 1552341937 }],
        next: "page-two",
      });
    });

    const newsletters = await listCustomerIoNewsletters({ apiKey: "key", region: "us", fetchImpl });

    expect(newsletters).toEqual([
      { id: "10", name: "Weekly", updatedAt: expect.any(String) },
      { id: "11", name: "Monthly", updatedAt: expect.any(String) },
    ]);
    expect(seenPaths).toEqual(["/newsletters?limit=100", "/newsletters?limit=100&start=page-two"]);
  });

  it("stops when the api repeats the next token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        newsletters: [{ id: 10, name: "Weekly", updated: 1552341937 }],
        next: "stuck",
      }),
    );

    const newsletters = await listCustomerIoNewsletters({ apiKey: "key", region: "us", fetchImpl });

    // Both fetched pages accumulate, but the repeated token terminates paging.
    expect(newsletters).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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

describe("listCustomerIoBroadcasts", () => {
  it("falls back to the id when a broadcast has no name", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        broadcasts: [
          { id: 3, name: "Launch", updated_at: 1552341937 },
          { id: 4, name: "", updated: 1552341937 },
          { id: 5, updated: 1552341937 },
        ],
      }),
    );

    const broadcasts = await listCustomerIoBroadcasts({ apiKey: "key", region: "us", fetchImpl });

    expect(broadcasts).toEqual([
      { id: "3", name: "Launch", updatedAt: expect.any(String) },
      { id: "4", name: "4", updatedAt: expect.any(String) },
      { id: "5", name: "5", updatedAt: expect.any(String) },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/broadcasts?limit=100",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer key" }),
      }),
    );
  });
});

describe("live Customer.io fixtures (2026-10-28, US region)", () => {
  it("parses the real broadcasts list", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(REAL_BROADCASTS_LIST));

    const broadcasts = await listCustomerIoBroadcasts({ apiKey: "key", region: "us", fetchImpl });

    expect(broadcasts).toEqual([
      { id: "2", name: "Test Broadcase", updatedAt: expect.any(String) },
    ]);
  });

  it("reads the real broadcast actions including in_app variants", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(REAL_BROADCAST_ACTIONS_LIST));

    const actions = await listCustomerIoBroadcastActions({
      apiKey: "key",
      region: "us",
      broadcastId: "2",
      fetchImpl,
    });

    expect(actions.map((action) => [action.id, action.type, action.language])).toEqual([
      ["14", "push", ""],
      ["15", "in_app", ""],
      ["16", "in_app", "zh-CN"],
    ]);
  });

  it("parses every known action type", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        actions: [
          { id: 1, name: "E", type: "email", language: "", subject: "S", body: "<p>B</p>" },
          { id: 2, name: "I", type: "in_app", language: "", body: "<div>B</div>" },
          { id: 3, name: "P", type: "push", language: "", title: "T", body: "B" },
          { id: 4, name: "S", type: "sms", language: "", body: "B" },
          { id: 5, name: "T", type: "twilio", language: "", body: "B" },
          { id: 6, name: "S", type: "slack", language: "", body: "B" },
          { id: 7, name: "W", type: "whatsapp", language: "", body: "B" },
          { id: 8, name: "H", type: "webhook", language: "" },
        ],
      }),
    );

    const actions = await listCustomerIoBroadcastActions({
      apiKey: "key",
      region: "us",
      broadcastId: "2",
      fetchImpl,
    });

    expect(actions.map((action) => [action.id, action.type])).toEqual([
      ["1", "email"],
      ["2", "in_app"],
      ["3", "push"],
      ["4", "sms"],
      ["5", "twilio"],
      ["6", "slack"],
      ["7", "whatsapp"],
      ["8", "webhook"],
    ]);
  });

  it("parses the real newsletters list and contents", async () => {
    const listImpl = vi.fn<typeof fetch>(async () => jsonResponse(REAL_NEWSLETTERS_LIST));
    const newsletters = await listCustomerIoNewsletters({
      apiKey: "key",
      region: "us",
      fetchImpl: listImpl,
    });
    expect(newsletters).toEqual([
      { id: "1", name: "Weekly Update", updatedAt: expect.any(String) },
    ]);

    const contentsImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(REAL_NEWSLETTER_CONTENTS_LIST),
    );
    const contents = await listCustomerIoNewsletterActions({
      apiKey: "key",
      region: "us",
      newsletterId: "1",
      fetchImpl: contentsImpl,
    });
    expect(contents).toHaveLength(1);
    expect(contents[0]).toMatchObject({
      id: "2",
      type: "email",
      language: "",
      subject: "Weekly Update",
    });
  });

  it("parses the real transactional list", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(REAL_TRANSACTIONAL_LIST));

    const messages = await listCustomerIoTransactionalMessages({
      apiKey: "key",
      region: "us",
      fetchImpl,
    });

    expect(messages.map((message) => [message.id, message.name])).toEqual([
      ["1", "All uncategorized email messages"],
      ["2", "Test"],
    ]);
  });

  it("unwraps real detail envelopes", async () => {
    const broadcastImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(REAL_BROADCAST_ACTION_DETAIL),
    );
    const broadcastAction = await getCustomerIoResourceAction({
      apiKey: "key",
      region: "us",
      resourcePath: "/broadcasts/2",
      actionId: "14",
      fetchImpl: broadcastImpl,
    });
    expect(broadcastAction).toMatchObject({ id: "14", type: "push", language: "" });

    const newsletterImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(REAL_NEWSLETTER_CONTENT_DETAIL),
    );
    const newsletterContent = await getCustomerIoResourceAction({
      apiKey: "key",
      region: "us",
      resourcePath: "/newsletters/1",
      actionId: "2",
      collectionKey: "contents",
      fetchImpl: newsletterImpl,
    });
    expect(newsletterContent).toMatchObject({ id: "2", type: "email", subject: "Weekly Update" });
  });
});
