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

import { DEFAULT_GO_SVC_BASE_URL, GoSvcClientError, GoSvcRequest } from "./go-svc-request";
import { GoSvcTranslationFileApi } from "./go-svc-translation-file-api";

function translationFileApi(fetchMock: ReturnType<typeof vi.fn>) {
  return new GoSvcTranslationFileApi(
    new GoSvcRequest({
      getServiceToken: () => "svc-token",
      fetch: fetchMock as unknown as typeof fetch,
    }),
  );
}

const request = {
  sourcePath: "messages.csv",
  sourceLocale: "en-US",
  targetLocale: "fr-FR",
  values: { greeting: "Bonjour" },
  sourceSpans: {},
};

describe("GoSvcTranslationFileApi", () => {
  it("posts the source file and the request as separate form parts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("key,value\ngreeting,Bonjour\n", { status: 200 }));
    const api = translationFileApi(fetchMock);

    const rendered = await api.render({
      source: new TextEncoder().encode("key,value\ngreeting,Hello\n"),
      request,
    });

    expect(await rendered.blob.text()).toBe("key,value\ngreeting,Bonjour\n");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GO_SVC_BASE_URL}/internal/translation-files/render`);
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(JSON.parse(form.get("request") as string)).toEqual(request);
    await expect((form.get("source") as Blob).text()).resolves.toBe("key,value\ngreeting,Hello\n");
  });

  it("reports the status of a failed render", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "render_failed", message: "could not write" }, { status: 422 }),
      );
    const api = translationFileApi(fetchMock);

    const error = await api
      .render({ source: new Uint8Array([1]), request })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GoSvcClientError);
    expect((error as GoSvcClientError).status).toBe(422);
  });
});
