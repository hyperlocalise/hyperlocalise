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
  SAMPLE_EMAIL_TEMPLATE_UPDATE,
  SAMPLE_EMAIL_TEMPLATE_UPSERT,
  SAMPLE_GET_BY_CLIENT_TEMPLATE_ID,
  SAMPLE_INAPP_TEMPLATE_GET,
  SAMPLE_PUSH_TEMPLATE_GET,
  SAMPLE_PUSH_TEMPLATE_UPDATE,
  SAMPLE_SNIPPET_GET,
  SAMPLE_SNIPPET_PUT,
  SAMPLE_SNIPPET_PUT_RESPONSE,
  SAMPLE_SNIPPETS_LIST,
  SAMPLE_SMS_TEMPLATE_GET,
  SAMPLE_SMS_TEMPLATE_UPDATE,
  SAMPLE_TEMPLATES_LIST_EMAIL,
} from "./client.real-api.fixture";

function jsonResponse(body: object, status = 200): Response {
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

    expect(templates).toEqual(
      SAMPLE_TEMPLATES_LIST_EMAIL.templates.map((item) => ({
        ...item,
        messageMedium: "Email",
      })),
    );
    expect(templates.map((item) => item.name)).toEqual([
      "Regular editor",
      "Photography Welcome Message",
    ]);
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

  it("gets the documented email template, including a locale query", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const href = requestUrl(url);
      expect(href).toContain("/api/templates/email/get?templateId=86596");
      if (href.includes("locale=")) {
        expect(href).toContain("locale=fr-FR");
      }
      return jsonResponse(SAMPLE_EMAIL_TEMPLATE_GET);
    });
    vi.stubGlobal("fetch", fetchImpl);

    const client = createIterableClient({ apiKey: "key", region: "us" });
    const defaultCopy = await client.getEmailTemplate(86596);
    const localized = await client.getEmailTemplate(86596, "fr-FR");

    expect(defaultCopy).toMatchObject({
      templateId: 86596,
      name: "My name of template",
      fromName: "Customer Success",
      fromEmail: "user@example.com",
      replyToEmail: "replyTo@example.com",
      subject: "My Subject of message",
      preheaderText: "preheader message here",
      plainText: "Optional plain text message",
      messageTypeId: 3867,
    });
    expect(defaultCopy?.html).toContain("{{userPropertyParameter}}");
    expect(localized?.subject).toBe("My Subject of message");
    expect(localized?.templateId).toBe(86596);
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
    const inApp = await client.getInAppTemplate(SAMPLE_INAPP_TEMPLATE_GET.templateId);
    const push = await client.getPushTemplate(SAMPLE_PUSH_TEMPLATE_GET.templateId);
    const sms = await client.getSmsTemplate(SAMPLE_SMS_TEMPLATE_GET.templateId);
    const snippets = await client.listSnippets();
    const snippet = await client.getSnippet("Welcome_Banner");

    expect(inApp).toMatchObject({
      templateId: 0,
      name: "My In-App template",
      html: SAMPLE_INAPP_TEMPLATE_GET.html,
      isDefaultLocale: true,
    });
    expect(push).toMatchObject({
      templateId: 0,
      name: "string",
      title: "string",
      message: "string",
      isSilentPush: true,
      locale: "string",
    });
    expect(sms).toMatchObject({
      templateId: 100692,
      name: "SMS testing",
      message: "Here is example message",
      locale: "en",
      messageTypeId: 531,
    });
    expect(snippets.map((item) => item.name)).toEqual(["Copyright_year", "Welcome_Banner"]);
    expect(snippets[1]?.variables).toEqual(["bannerColor", "firstName"]);
    expect(snippet).toMatchObject({
      name: "Welcome_Banner",
      content: SAMPLE_SNIPPET_GET.snippet.content,
      variables: ["bannerColor", "firstName"],
    });
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
    const template = await client.getByClientTemplateId("112233");

    expect(template).toMatchObject({
      templateId: 86596,
      name: "My name of template",
      subject: "My Subject of message",
    });
  });

  it("sends documented email, push, sms, and snippet write bodies", async () => {
    const calls: { url: string; body: object | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        const rawBody = init?.body;
        calls.push({
          url: requestUrl(url),
          body: typeof rawBody === "string" ? (JSON.parse(rawBody) as object) : null,
        });
        if (requestUrl(url).includes("/api/snippets/")) {
          return jsonResponse(SAMPLE_SNIPPET_PUT_RESPONSE);
        }
        return jsonResponse({ msg: "", code: "Success", params: null });
      }),
    );

    const client = createIterableClient({ apiKey: "key", region: "us" });
    await client.updateEmailTemplate({ ...SAMPLE_EMAIL_TEMPLATE_UPDATE });
    await client.upsertEmailTemplate({ ...SAMPLE_EMAIL_TEMPLATE_UPSERT });
    await client.updatePushTemplate({ ...SAMPLE_PUSH_TEMPLATE_UPDATE });
    await client.updateSmsTemplate({ ...SAMPLE_SMS_TEMPLATE_UPDATE });
    await client.putSnippet("Welcome_Banner", { ...SAMPLE_SNIPPET_PUT });

    expect(calls.map((call) => call.url)).toEqual([
      "https://api.iterable.com/api/templates/email/update",
      "https://api.iterable.com/api/templates/email/upsert",
      "https://api.iterable.com/api/templates/push/update",
      "https://api.iterable.com/api/templates/sms/update",
      "https://api.iterable.com/api/snippets/Welcome_Banner",
    ]);
    expect(calls.map((call) => call.body)).toEqual([
      SAMPLE_EMAIL_TEMPLATE_UPDATE,
      SAMPLE_EMAIL_TEMPLATE_UPSERT,
      SAMPLE_PUSH_TEMPLATE_UPDATE,
      SAMPLE_SMS_TEMPLATE_UPDATE,
      SAMPLE_SNIPPET_PUT,
    ]);
  });
});
