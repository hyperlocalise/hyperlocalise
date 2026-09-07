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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  resendSend: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: (...args: unknown[]) => mocks.resendSend(...args),
    };
  },
}));

import { sendTransactionalEmail } from "./send";

describe("sendTransactionalEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resendSend.mockResolvedValue({ data: { id: "email_1" }, error: null });
    mocks.fetch.mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("sends via Resend", async () => {
    const result = await sendTransactionalEmail({
      provider: "resend",
      apiKey: "re_test",
      from: "notifications@example.com",
      recipients: ["ops@example.com"],
      subject: "Hello",
      message: "Body",
    });

    expect(isOk(result)).toBe(true);
    expect(mocks.resendSend).toHaveBeenCalledWith({
      from: "notifications@example.com",
      to: ["ops@example.com"],
      subject: "Hello",
      text: "Body",
    });
  });

  it("sends via SendGrid", async () => {
    const result = await sendTransactionalEmail({
      provider: "sendgrid",
      apiKey: "sg_test",
      from: "notifications@example.com",
      recipients: ["ops@example.com", "qa@example.com"],
      subject: "Hello",
      message: "Body",
    });

    expect(isOk(result)).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.sendgrid.com/v3/mail/send",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer sg_test",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("maps SendGrid failures to email_send_failed", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const result = await sendTransactionalEmail({
      provider: "sendgrid",
      apiKey: "sg_test",
      from: "notifications@example.com",
      recipients: ["ops@example.com"],
      subject: "Hello",
      message: "Body",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("email_send_failed");
    }
  });
});
