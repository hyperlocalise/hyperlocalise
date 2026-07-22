/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { crowdinTmsProvider } from "./crowdin-provider";

describe("fetchCrowdinProjectDetailMetadata", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("includes branch metadata for project detail", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.endsWith("/projects/42")) {
        return new Response(
          JSON.stringify({
            data: {
              id: 42,
              name: "Marketing",
              identifier: "marketing",
              sourceLanguageId: "en",
              targetLanguageIds: ["fr"],
              webUrl: "https://crowdin.com/project/marketing",
              isSuspended: false,
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/branches?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 10,
                  name: "main",
                  title: "Main Branch",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await crowdinTmsProvider.fetchProjectDetailMetadata({
      projectId: 42,
      token: "test-token",
      baseUrl: "https://api.crowdin.test/api/v2",
    });

    expect(result).toMatchObject({
      externalProjectId: "42",
      name: "Marketing",
      metadata: {
        identifier: "marketing",
        branches: [{ id: 10, name: "main", title: "Main Branch" }],
      },
    });
  });
});
