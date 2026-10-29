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

import { createIterableClient, IterableApiError } from "./client";
import {
  SAMPLE_EMAIL_TEMPLATE_GET,
  SAMPLE_EMAIL_TEMPLATE_GET_FR,
  SAMPLE_GET_BY_CLIENT_TEMPLATE_ID,
  SAMPLE_INAPP_TEMPLATE_GET,
  SAMPLE_PUSH_TEMPLATE_GET,
  SAMPLE_SNIPPET_GET,
  SAMPLE_SNIPPETS_LIST,
  SAMPLE_SMS_TEMPLATE_GET,
  SAMPLE_TEMPLATES_LIST_EMAIL,
} from "./client.real-api.fixture";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(url: RequestInfo | URL): string {
  return typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
}

describe("createIterableClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists email templates with Api-Key on the US host", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      expect(requestUrl(url)).toBe(
        "https://api.iterable.com/api/templates?messageMedium=Email&page=1&pageSize=1000",
      );
      expect(init?.headers).toMatchObject({ "Api-Key": "server-key" });
      return jsonResponse(SAMPLE_TEMPLATES_LIST_EMAIL);
    });
    vi.stubGlobal("fetch", fetchImpl);

    const client = createIterableClient({ apiKey: "server-key", region: "us" });
    const templates = await client.listAllTemplates("Email");

    expect(templates).toEqual(SAMPLE_TEMPLATES_LIST_EMAIL.templates);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("uses the EU host when region is eu", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      expect(requestUrl(url)).toContain("https://api.eu.iterable.com");
      return jsonResponse(SAMPLE_TEMPLATES_LIST_EMAIL);
    });
    vi.stubGlobal("fetch", fetchImpl);

    await createIterableClient({ apiKey: "key", region: "eu" }).listAllTemplates("Email");
  });

  it("gets email template default and locale copies from sample payloads", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const href = requestUrl(url);
      if (href.includes("locale=fr-FR")) {
        return jsonResponse(SAMPLE_EMAIL_TEMPLATE_GET_FR);
      }
      return jsonResponse(SAMPLE_EMAIL_TEMPLATE_GET);
    });
    vi.stubGlobal("fetch", fetchImpl);

    const client = createIterableClient({ apiKey: "key", region: "us" });
    const defaultCopy = await client.getEmailTemplate(938631);
    const french = await client.getEmailTemplate(938631, "fr-FR");

    expect(defaultCopy?.subject).toBe("Welcome, {{firstName}}!");
    expect(defaultCopy?.editorType).toBe("Visual");
    expect(french?.locale).toBe("fr-FR");
    expect(french?.subject).toContain("Bienvenue");
  });

  it("gets in-app, push, sms templates and snippets", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const href = requestUrl(url);
      if (href.includes("/api/templates/inapp/get")) {
        return jsonResponse(SAMPLE_INAPP_TEMPLATE_GET);
      }
      if (href.includes("/api/templates/push/get")) {
        return jsonResponse(SAMPLE_PUSH_TEMPLATE_GET);
      }
      if (href.includes("/api/templates/sms/get")) {
        return jsonResponse(SAMPLE_SMS_TEMPLATE_GET);
      }
      if (href.endsWith("/api/snippets")) {
        return jsonResponse(SAMPLE_SNIPPETS_LIST);
      }
      if (href.includes("/api/snippets/Welcome_Banner")) {
        return jsonResponse(SAMPLE_SNIPPET_GET);
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchImpl);

    const client = createIterableClient({ apiKey: "key", region: "us" });
    const inApp = await client.getInAppTemplate(441022);
    const push = await client.getPushTemplate(552001);
    const sms = await client.getSmsTemplate(663002);
    const snippets = await client.listSnippets();
    const snippet = await client.getSnippet("Welcome_Banner");

    expect(inApp?.inboxMetadata?.saveToInbox).toBe(true);
    expect(push?.message).toContain("{{orderId}}");
    expect(sms?.message).toContain("{{code}}");
    expect(snippets[0]?.name).toBe("Welcome_Banner");
    expect(snippet.variables).toEqual(["Footer"]);
  });

  it("maps 403 to IterableApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ msg: "Forbidden" }, 403)),
    );

    const client = createIterableClient({ apiKey: "key", region: "eu" });
    const error = await client.getEmailTemplate(1).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(IterableApiError);
    expect((error as IterableApiError).code).toBe("iterable_forbidden");
  });

  it("recovers clone id via getByClientTemplateId sample", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse(SAMPLE_GET_BY_CLIENT_TEMPLATE_ID)),
    );

    const client = createIterableClient({ apiKey: "key", region: "us" });
    const template = await client.getByClientTemplateId("hl-iterable-938631");

    expect(template?.templateId).toBe(938999);
    expect(template?.name).toContain("HL localized");
  });
});
