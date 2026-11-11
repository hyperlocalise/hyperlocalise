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

import { GoSvcPdfApi } from "./go-svc-pdf-api";
import { DEFAULT_GO_SVC_BASE_URL, GoSvcClientError, GoSvcRequest } from "./go-svc-request";

function pdfApi(fetchMock: ReturnType<typeof vi.fn>) {
  return new GoSvcPdfApi(
    new GoSvcRequest({
      getServiceToken: () => "svc-token",
      fetch: fetchMock as unknown as typeof fetch,
    }),
  );
}

describe("GoSvcPdfApi", () => {
  it("posts multipart PDF apply and parses overflow keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([37, 80, 68, 70]), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "x-hyperlocalise-overflow-keys": " page-1#2 , page-1#3, ",
        },
      }),
    );
    const api = pdfApi(fetchMock);

    await expect(
      api.apply({
        template: new Uint8Array([1, 2, 3]),
        values: { "page-1#1": "Bonjour" },
        targetLocale: "  fr-FR  ",
      }),
    ).resolves.toEqual({
      content: new Uint8Array([37, 80, 68, 70]),
      overflowKeys: ["page-1#2", "page-1#3"],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GO_SVC_BASE_URL}/internal/pdf/apply`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("values")).toBe(JSON.stringify({ "page-1#1": "Bonjour" }));
    expect(form.get("targetLocale")).toBe("fr-FR");
    expect(form.get("template")).toBeInstanceOf(Blob);
  });

  it("omits a blank target locale and treats a missing overflow header as empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }),
    );
    const api = pdfApi(fetchMock);

    await expect(
      api.apply({
        template: new Uint8Array([1]),
        values: { "page-1#1": "Hi" },
        targetLocale: "   ",
      }),
    ).resolves.toEqual({
      content: new Uint8Array([1]),
      overflowKeys: [],
    });

    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.get("targetLocale")).toBeNull();
  });

  it("maps JSON apply failures to GoSvcClientError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: "pdf_script_unsupported",
          message: "The target text uses a script this PDF export does not support.",
        },
        { status: 422 },
      ),
    );

    await expect(
      pdfApi(fetchMock).apply({
        template: new Uint8Array([1]),
        values: { "page-1#1": "مرحبا" },
      }),
    ).rejects.toMatchObject({
      name: "GoSvcClientError",
      code: "pdf_script_unsupported",
      status: 422,
      message: "The target text uses a script this PDF export does not support.",
    });
  });

  it("falls back to http_error when the failure body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("gateway timeout", { status: 504 }));

    try {
      await pdfApi(fetchMock).apply({
        template: new Uint8Array([1]),
        values: { "page-1#1": "Hi" },
      });
      throw new Error("expected apply to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(GoSvcClientError);
      expect(error).toMatchObject({
        code: "http_error",
        status: 504,
        message: "go-svc request failed with status 504",
      });
    }
  });
});
