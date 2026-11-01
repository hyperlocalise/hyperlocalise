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

import { GoSvcEditorExportApi } from "./go-svc-editor-export-api";
import { DEFAULT_GO_SVC_BASE_URL, GoSvcClientError, GoSvcRequest } from "./go-svc-request";

function editorExportApi(fetchMock: ReturnType<typeof vi.fn>) {
  return new GoSvcEditorExportApi(
    new GoSvcRequest({
      getServiceToken: () => "svc-token",
      fetch: fetchMock as unknown as typeof fetch,
    }),
  );
}

describe("GoSvcEditorExportApi", () => {
  it("posts a bilingual file to the internal parse route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        rows: [
          {
            key: "hello",
            sourceText: "Hello",
            targetText: "Bonjour",
            sourceLocale: "en",
            targetLocale: "fr",
            sourcePath: "a.json",
          },
        ],
      }),
    );
    const api = editorExportApi(fetchMock);
    const body = new Uint8Array([1, 2, 3]);

    await expect(
      api.parseFiltered({
        format: "xliff",
        filename: "queue-fr.xliff",
        body,
      }),
    ).resolves.toEqual({
      rows: [
        {
          key: "hello",
          sourceText: "Hello",
          targetText: "Bonjour",
          sourceLocale: "en",
          targetLocale: "fr",
          sourcePath: "a.json",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GO_SVC_BASE_URL}/internal/editor-export/filtered/parse`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("format")).toBe("xliff");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("maps a 400 parse failure to GoSvcClientError", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "invalid_bilingual_file", message: "bad xliff" }, { status: 400 }),
      );
    const api = editorExportApi(fetchMock);

    await expect(
      api.parseFiltered({
        filename: "queue-fr.xliff",
        body: new Uint8Array([1]),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: GoSvcClientError.name,
        message: "bad xliff",
        status: 400,
      }),
    );
  });
});
