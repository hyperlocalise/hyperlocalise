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

import { isErr, isOk } from "@/lib/primitives/result/results";

vi.mock("@/lib/database/client", () => ({
  db: {},
  schema: {},
}));

vi.mock("@/lib/security/provider-credential-crypto", () => ({
  encryptProviderCredential: vi.fn(),
}));

vi.mock("./webhook-deliveries", () => ({
  attemptWebhookDelivery: vi.fn(),
}));

import { validateWebhookEndpointUrl } from "./webhook-endpoints";

describe("validateWebhookEndpointUrl", () => {
  it("accepts https on a public host and trims surrounding space", () => {
    const result = validateWebhookEndpointUrl("  https://hooks.example.com/in  ");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe("https://hooks.example.com/in");
    }
  });

  it("rejects http even on a public host", () => {
    const result = validateWebhookEndpointUrl("http://hooks.example.com/in");
    expect(isErr(result) && result.error).toEqual({ code: "webhook_url_invalid" });
  });

  it("rejects loopback and private addresses", () => {
    expect(isErr(validateWebhookEndpointUrl("https://127.0.0.1/hook"))).toBe(true);
    expect(isErr(validateWebhookEndpointUrl("https://localhost/hook"))).toBe(true);
    expect(isErr(validateWebhookEndpointUrl("https://10.0.0.8/hook"))).toBe(true);
  });

  it("rejects a URL that is not http(s)", () => {
    expect(isErr(validateWebhookEndpointUrl("not-a-url"))).toBe(true);
    expect(isErr(validateWebhookEndpointUrl("ftp://hooks.example.com/in"))).toBe(true);
  });
});
