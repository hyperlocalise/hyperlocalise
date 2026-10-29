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
  SAMPLE_EMAIL_TEMPLATE_GET,
  SAMPLE_INAPP_TEMPLATE_GET,
  SAMPLE_PUSH_TEMPLATE_GET,
  SAMPLE_SMS_TEMPLATE_GET,
  SAMPLE_SNIPPET_GET,
} from "./client.real-api.fixture";
import {
  parseIterableEmailEnvelope,
  parseIterableInAppEnvelope,
  parseIterablePushEnvelope,
  parseIterableSmsEnvelope,
  parseIterableSnippetHtml,
  restoreIterableEmailEnvelope,
  restoreIterableSnippetContent,
  serializeIterableEmailEnvelope,
  serializeIterableInAppEnvelope,
  serializeIterablePushEnvelope,
  serializeIterableSmsEnvelope,
  serializeIterableSnippetHtml,
} from "./html-envelope";

describe("iterable html envelopes", () => {
  it("round-trips email fields from sample payload", () => {
    const template = SAMPLE_EMAIL_TEMPLATE_GET.template;
    const { html, tokensByField } = serializeIterableEmailEnvelope({
      subject: template.subject ?? "",
      preheaderText: template.preheaderText,
      html: template.html ?? "",
      plainText: template.plainText,
    });
    const parsed = restoreIterableEmailEnvelope(parseIterableEmailEnvelope(html), tokensByField);

    expect(parsed.subject).toBe(template.subject);
    expect(parsed.preheaderText).toBe(template.preheaderText);
    expect(parsed.html).toBe(template.html);
    expect(parsed.plainText).toBe(template.plainText);
  });

  it("round-trips in-app fields from sample payload", () => {
    const template = SAMPLE_INAPP_TEMPLATE_GET.template;
    const { html } = serializeIterableInAppEnvelope({
      html: template.html ?? "",
      title: template.title,
      subtitle: template.subtitle,
      icon: template.icon,
    });
    const parsed = parseIterableInAppEnvelope(html);

    expect(parsed.title).toBe(template.title);
    expect(parsed.subtitle).toBe(template.subtitle);
    expect(parsed.icon).toBe(template.icon);
    expect(parsed.html).toBe(template.html);
  });

  it("round-trips push and sms json envelopes", () => {
    const push = SAMPLE_PUSH_TEMPLATE_GET.template;
    const sms = SAMPLE_SMS_TEMPLATE_GET.template;

    expect(
      parseIterablePushEnvelope(
        serializeIterablePushEnvelope({
          title: push.title ?? "",
          message: push.message ?? "",
        }),
      ),
    ).toEqual({ title: push.title, message: push.message });

    expect(
      parseIterableSmsEnvelope(
        serializeIterableSmsEnvelope({
          message: sms.message ?? "",
        }),
      ),
    ).toEqual({ message: sms.message });
  });

  it("round-trips snippet html from sample payload", () => {
    const content = SAMPLE_SNIPPET_GET.content ?? "";
    const { html, tokensByField } = serializeIterableSnippetHtml(content);
    const parsed = parseIterableSnippetHtml(html);
    expect(restoreIterableSnippetContent(parsed, tokensByField.content)).toBe(content);
  });
});
