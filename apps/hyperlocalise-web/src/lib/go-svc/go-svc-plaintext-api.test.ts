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

import { GoSvcPlaintextApi } from "./go-svc-plaintext-api";
import { DEFAULT_GO_SVC_BASE_URL, GoSvcRequest } from "./go-svc-request";

function plaintextApi(fetchMock: ReturnType<typeof vi.fn>) {
  return new GoSvcPlaintextApi(
    new GoSvcRequest({
      getServiceToken: () => "svc-token",
      fetch: fetchMock as unknown as typeof fetch,
    }),
  );
}

describe("GoSvcPlaintextApi", () => {
  it("posts multipart plaintext apply and returns rendered bytes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([72, 105]), {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    );
    const api = plaintextApi(fetchMock);

    await expect(
      api.apply({
        template: new Uint8Array([1, 2, 3]),
        values: { "txt.0001": "Bonjour" },
        targetLocale: "  fr-FR  ",
      }),
    ).resolves.toEqual({
      content: new Uint8Array([72, 105]),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GO_SVC_BASE_URL}/internal/plaintext/apply`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("values")).toBe(JSON.stringify({ "txt.0001": "Bonjour" }));
    expect(form.get("targetLocale")).toBe("fr-FR");
    expect(form.get("template")).toBeInstanceOf(Blob);
  });

  it("omits a blank target locale", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    const api = plaintextApi(fetchMock);

    await api.apply({
      template: new Uint8Array([1]),
      values: { "txt.0001": "Hi" },
      targetLocale: "   ",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("targetLocale")).toBeNull();
  });

  it("maps JSON apply failures to GoSvcClientError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: "plaintext_export_failed",
          message: "Could not write translations into the text file.",
        },
        { status: 500 },
      ),
    );

    await expect(
      plaintextApi(fetchMock).apply({
        template: new Uint8Array([1]),
        values: { "txt.0001": "Hi" },
      }),
    ).rejects.toMatchObject({
      name: "GoSvcClientError",
      code: "plaintext_export_failed",
      status: 500,
      message: "Could not write translations into the text file.",
    });
  });

  it("falls back to http_error when the failure body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("gateway timeout", { status: 504 }));

    try {
      await plaintextApi(fetchMock).apply({
        template: new Uint8Array([1]),
        values: { "txt.0001": "Hi" },
      });
      throw new Error("expected apply to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ code: "http_error", status: 504 });
    }
  });
});
