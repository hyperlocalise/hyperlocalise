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

import type { CustomerIoAction } from "./client";
import { isCustomerIoHtmlActionType } from "./html-envelope";
import {
  buildCustomerIoActionTranslationPayload,
  buildCustomerIoBroadcastSourcePath,
  buildCustomerIoCampaignSourcePath,
  buildCustomerIoNewsletterSourcePath,
  buildCustomerIoTransactionalSourcePath,
  customerIoTranslationMapFromRemote,
  extractCustomerIoActionStrings,
  hashCustomerIoTranslationMap,
  isCustomerIoLocalizableActionType,
  isCustomerIoSourcePath,
  mergeCustomerIoTranslationMap,
  parseCustomerIoTranslationMapJson,
  serializeCustomerIoTranslationMap,
} from "./translation-map";

function emailAction(overrides: Partial<CustomerIoAction> = {}): CustomerIoAction {
  return {
    id: "96",
    name: "Opening Message",
    type: "email",
    language: "",
    subject: "Did you get that thing?",
    preheaderText: "Preview text",
    body: "Hello {{customer.email}}",
    updatedAt: null,
    ...overrides,
  };
}

describe("isCustomerIoLocalizableActionType", () => {
  it("accepts email, push, sms, slack, twilio, in_app, and whatsapp actions", () => {
    expect(isCustomerIoLocalizableActionType("email")).toBe(true);
    expect(isCustomerIoLocalizableActionType("push")).toBe(true);
    expect(isCustomerIoLocalizableActionType("twilio")).toBe(true);
    expect(isCustomerIoLocalizableActionType("slack")).toBe(true);
    expect(isCustomerIoLocalizableActionType("in_app")).toBe(true);
    expect(isCustomerIoLocalizableActionType("whatsapp")).toBe(true);
  });

  it("rejects webhook actions", () => {
    expect(isCustomerIoLocalizableActionType("webhook")).toBe(false);
  });
});

describe("extractCustomerIoActionStrings", () => {
  it("extracts email subject, preheader, and body", () => {
    expect(extractCustomerIoActionStrings(emailAction())).toEqual({
      subject: "Did you get that thing?",
      preheader_text: "Preview text",
      body: "Hello {{customer.email}}",
    });
  });

  it("extracts push title and body", () => {
    expect(
      extractCustomerIoActionStrings(
        emailAction({ type: "push", subject: undefined, preheaderText: undefined, title: "Hi" }),
      ),
    ).toEqual({ title: "Hi", body: "Hello {{customer.email}}" });
  });

  it("extracts only the body for sms and slack actions", () => {
    expect(
      extractCustomerIoActionStrings(
        emailAction({ type: "twilio", subject: undefined, preheaderText: undefined }),
      ),
    ).toEqual({ body: "Hello {{customer.email}}" });
  });

  it("extracts only the body for in_app actions", () => {
    expect(
      extractCustomerIoActionStrings(
        emailAction({
          type: "in_app",
          subject: undefined,
          preheaderText: undefined,
          title: undefined,
          body: "<div>In-app body</div>",
        }),
      ),
    ).toEqual({ body: "<div>In-app body</div>" });
  });
});

describe("customer-io translation map round trip", () => {
  it("serializes sorted JSON and parses it back", () => {
    const map = { body: "b", subject: "s" };
    const parsed = parseCustomerIoTranslationMapJson(serializeCustomerIoTranslationMap(map));
    expect(parsed).toEqual(map);
    expect(serializeCustomerIoTranslationMap(map).indexOf('"body"')).toBeLessThan(
      serializeCustomerIoTranslationMap(map).indexOf('"subject"'),
    );
  });

  it("returns an empty map for invalid JSON", () => {
    expect(parseCustomerIoTranslationMapJson("not json")).toEqual({});
  });

  it("hashes deterministically regardless of key order", () => {
    expect(hashCustomerIoTranslationMap({ a: "1", b: "2" })).toBe(
      hashCustomerIoTranslationMap({ b: "2", a: "1" }),
    );
  });

  it("merges with approved translations winning", () => {
    expect(
      mergeCustomerIoTranslationMap({
        source: { subject: "en", body: "en body" },
        remote: { subject: "old fr" },
        approved: { subject: "new fr" },
      }),
    ).toEqual({ subject: "new fr", body: "en body" });
  });

  it("reads remote translations into field maps", () => {
    expect(
      customerIoTranslationMapFromRemote({
        type: "email",
        subject: "Sujet",
        body: "Corps",
      }),
    ).toEqual({ subject: "Sujet", body: "Corps" });
  });
});

describe("buildCustomerIoActionTranslationPayload", () => {
  it("sends only translatable content fields", () => {
    expect(
      buildCustomerIoActionTranslationPayload("email", {
        subject: "Sujet",
        preheader_text: "Aperçu",
        body: "Corps",
      }),
    ).toEqual({
      type: "email",
      subject: "Sujet",
      preheader_text: "Aperçu",
      body: "Corps",
    });
  });

  it("maps twilio actions to the twilio payload type", () => {
    expect(buildCustomerIoActionTranslationPayload("twilio", { body: "SMS" })).toEqual({
      type: "twilio",
      body: "SMS",
    });
  });

  it("sends only the body for in_app and whatsapp actions", () => {
    expect(
      buildCustomerIoActionTranslationPayload("in_app", {
        subject: "Ignored",
        body: "<div>Hi</div>",
      }),
    ).toEqual({ type: "in_app", body: "<div>Hi</div>" });
    expect(
      buildCustomerIoActionTranslationPayload("whatsapp", { body: "Hi", title: "Ignored" }),
    ).toEqual({ type: "whatsapp", body: "Hi" });
  });
});

describe("all Customer.io action types", () => {
  const cases = [
    {
      type: "email",
      action: { subject: "S", preheaderText: "P", body: "<p>B</p>" },
      map: { subject: "S", preheader_text: "P", body: "<p>B</p>" },
      html: true,
    },
    {
      type: "in_app",
      action: { body: "<div>B</div>" },
      map: { body: "<div>B</div>" },
      html: true,
    },
    {
      type: "push",
      action: { title: "T", body: "B" },
      map: { title: "T", body: "B" },
      html: false,
    },
    { type: "sms", action: { body: "B" }, map: { body: "B" }, html: false },
    { type: "twilio", action: { body: "B" }, map: { body: "B" }, html: false },
    { type: "slack", action: { body: "B" }, map: { body: "B" }, html: false },
    { type: "whatsapp", action: { body: "B" }, map: { body: "B" }, html: false },
  ] as const;

  it.each(cases)(
    "classifies, extracts, and envelopes $type correctly",
    ({ type, action, map, html }) => {
      expect(isCustomerIoLocalizableActionType(type)).toBe(true);
      expect(isCustomerIoHtmlActionType(type)).toBe(html);
      expect(
        extractCustomerIoActionStrings(
          emailAction({
            type,
            subject: undefined,
            preheaderText: undefined,
            title: undefined,
            ...action,
          }),
        ),
      ).toEqual(map);
    },
  );

  it("excludes webhook actions", () => {
    expect(isCustomerIoLocalizableActionType("webhook")).toBe(false);
    expect(isCustomerIoHtmlActionType("webhook")).toBe(false);
  });
});

describe("customer-io source paths", () => {
  it("builds deterministic broadcast and campaign paths", () => {
    expect(buildCustomerIoBroadcastSourcePath({ broadcastId: "2", actionId: "96" })).toBe(
      "customer-io/broadcasts/2/actions/96.json",
    );
    expect(buildCustomerIoCampaignSourcePath({ campaignId: "7", actionId: "42" })).toBe(
      "customer-io/campaigns/7/actions/42.json",
    );
  });

  it("builds newsletter and transactional content paths", () => {
    expect(buildCustomerIoNewsletterSourcePath({ newsletterId: "10", actionId: "101" })).toBe(
      "customer-io/newsletters/10/contents/101.json",
    );
    expect(
      buildCustomerIoTransactionalSourcePath({ transactionalMessageId: "5", actionId: "201" }),
    ).toBe("customer-io/transactional/5/contents/201.json");
  });

  it("detects customer-io source paths", () => {
    expect(isCustomerIoSourcePath("customer-io/broadcasts/2/actions/96.json")).toBe(true);
    expect(isCustomerIoSourcePath("braze/campaigns/x.json")).toBe(false);
  });
});
