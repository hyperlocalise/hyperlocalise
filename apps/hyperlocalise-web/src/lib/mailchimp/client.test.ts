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

import { formatMailchimpApiErrorBody, mailchimpCampaignCreateSettings } from "./client";

describe("formatMailchimpApiErrorBody", () => {
  it("reads Mailchimp detail and field errors", () => {
    expect(
      formatMailchimpApiErrorBody(
        JSON.stringify({
          title: "Invalid Resource",
          detail: "The resource submitted could not be validated.",
          errors: [
            { field: "settings.reply_to", message: "Please provide a valid email address." },
          ],
        }),
        400,
      ),
    ).toBe(
      "The resource submitted could not be validated. (settings.reply_to: Please provide a valid email address.)",
    );
  });

  it("falls back to status when the body is empty", () => {
    expect(formatMailchimpApiErrorBody("", 403)).toBe("Mailchimp API 403");
  });
});

describe("mailchimpCampaignCreateSettings", () => {
  it("fills empty subject and from name so Mailchimp does not reject the create", () => {
    expect(
      mailchimpCampaignCreateSettings({
        listId: " list-1 ",
        title: "Bright Up Your Space [th]",
        subjectLine: "",
        fromName: "",
        replyTo: "hello@example.com",
      }),
    ).toEqual({
      listId: "list-1",
      title: "Bright Up Your Space [th]",
      subjectLine: "Bright Up Your Space [th]",
      previewText: "",
      fromName: "Bright Up Your Space [th]",
      replyTo: "hello@example.com",
    });
  });
});
