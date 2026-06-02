import { describe, expect, it } from "vite-plus/test";

import { buildPinnedRequestInit } from "./provider-safe-fetch";

describe("providerSafeFetch", () => {
  it("adds the original host header when fetching a pinned IP URL", () => {
    const init = buildPinnedRequestInit(
      "https://api.example.test/v2/projects",
      {
        headers: {
          Authorization: "token test-token",
        },
      },
      {
        requestUrl: "https://93.184.216.34/v2/projects",
        hostHeader: "api.example.test",
        connect: {
          host: "93.184.216.34",
          port: 443,
          servername: "api.example.test",
        },
      },
    );

    const headers = new Headers(init.headers);

    expect(init.redirect).toBe("error");
    expect(headers.get("Authorization")).toBe("token test-token");
    expect(headers.get("Host")).toBe("api.example.test");
  });
});
