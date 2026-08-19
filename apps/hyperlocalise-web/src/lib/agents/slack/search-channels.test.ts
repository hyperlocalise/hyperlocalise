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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  fromCanonicalSlackChannelId,
  normalizeSlackChannelQuery,
  searchSlackChannels,
  SLACK_CHANNEL_BROWSE_LIMIT,
  toCanonicalSlackChannelId,
} from "./search-channels";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return {
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    headers: {
      get: (name: string) => init?.headers?.[name.toLowerCase()] ?? null,
    },
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function requestUrl(input: unknown) {
  return new URL(String(input));
}

function mockSlack(
  handler: (url: URL) => {
    body: unknown;
    init?: { status?: number; headers?: Record<string, string> };
  },
) {
  fetchMock.mockImplementation(async (input: unknown) => {
    const response = handler(requestUrl(input));
    return jsonResponse(response.body, response.init);
  });
}

describe("searchSlackChannels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("canonicalizes Slack channel ids", () => {
    expect(toCanonicalSlackChannelId("C123")).toBe("slack:C123");
    expect(toCanonicalSlackChannelId("slack:C123")).toBe("slack:C123");
    expect(fromCanonicalSlackChannelId("slack:C123")).toBe("C123");
    expect(fromCanonicalSlackChannelId("C123")).toBe("C123");
    expect(normalizeSlackChannelQuery("#L10N")).toBe("l10n");
  });

  it("browses a single page and ignores further cursors", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        channels: [
          { id: "C_PUBLIC", name: "localization", is_private: false },
          { id: "C_PRIVATE", name: "team-l10n", is_private: true },
          { id: "C_ARCHIVED", name: "old", is_archived: true },
        ],
        response_metadata: { next_cursor: "page-2" },
      }),
    );

    const result = await searchSlackChannels({ botToken: "xoxb-token" });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected channel browse to succeed");
    }
    expect(result.value).toEqual([
      { id: "slack:C_PUBLIC", name: "localization", private: false },
      { id: "slack:C_PRIVATE", name: "team-l10n", private: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = requestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(url.origin + url.pathname).toBe("https://slack.com/api/conversations.list");
    expect(url.searchParams.get("limit")).toBe(String(SLACK_CHANNEL_BROWSE_LIMIT));
    expect(url.searchParams.get("cursor")).toBeNull();
  });

  it("searches channel names without listing every page after an exact match", async () => {
    vi.stubGlobal("fetch", fetchMock);
    mockSlack((url) => {
      if (url.pathname.endsWith("/conversations.info")) {
        return {
          body: { ok: false, error: "channel_not_found" },
        };
      }

      return {
        body: {
          ok: true,
          channels: [
            { id: "C1", name: "alerts" },
            { id: "C2", name: "l10n" },
          ],
          response_metadata: { next_cursor: "page-2" },
        },
      };
    });

    const result = await searchSlackChannels({
      botToken: "xoxb-token",
      query: "#L10N",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected channel search to succeed");
    }
    expect(result.value).toEqual([{ id: "slack:C2", name: "l10n", private: false }]);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("https://slack.com/api/conversations.list"),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("https://slack.com/api/conversations.list"),
      ),
    ).toHaveLength(1);
  });

  it("resolves a typed channel name via conversations.info when list search would miss it", async () => {
    vi.stubGlobal("fetch", fetchMock);
    mockSlack((url) => {
      if (url.pathname.endsWith("/conversations.info")) {
        expect(url.searchParams.get("channel")).toBe("#release-notes");
        return {
          body: {
            ok: true,
            channel: { id: "C_RELEASE", name: "release-notes", is_private: false },
          },
        };
      }

      return {
        body: {
          ok: true,
          channels: [{ id: "C_PUBLIC", name: "localization" }],
          response_metadata: { next_cursor: "page-2" },
        },
      };
    });

    const result = await searchSlackChannels({
      botToken: "xoxb-token",
      query: "release-notes",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected named channel lookup to succeed");
    }
    expect(result.value[0]).toEqual({
      id: "slack:C_RELEASE",
      name: "release-notes",
      private: false,
    });
    expect(result.value.map((channel) => channel.id)).toContain("slack:C_RELEASE");
  });

  it("treats conversations.info channel_not_found as a miss and keeps scanning list pages", async () => {
    vi.stubGlobal("fetch", fetchMock);
    let listPages = 0;
    mockSlack((url) => {
      if (url.pathname.endsWith("/conversations.info")) {
        return {
          body: { ok: false, error: "channel_not_found" },
        };
      }

      listPages += 1;
      if (url.searchParams.get("cursor") === "page-2") {
        return {
          body: {
            ok: true,
            channels: [{ id: "C_TARGET", name: "release-notes" }],
          },
        };
      }

      return {
        body: {
          ok: true,
          channels: [{ id: "C_PUBLIC", name: "localization" }],
          response_metadata: { next_cursor: "page-2" },
        },
      };
    });

    const result = await searchSlackChannels({
      botToken: "xoxb-token",
      query: "release-notes",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected list scan after lookup miss to succeed");
    }
    expect(result.value).toEqual([{ id: "slack:C_TARGET", name: "release-notes", private: false }]);
    expect(listPages).toBe(2);
  });

  it("looks up a typed Slack channel id without treating channel_not_found as a hard error", async () => {
    vi.stubGlobal("fetch", fetchMock);
    mockSlack((url) => {
      if (url.pathname.endsWith("/conversations.info")) {
        expect(url.searchParams.get("channel")).toBe("C01234567");
        return {
          body: { ok: false, error: "channel_not_found" },
        };
      }

      return {
        body: {
          ok: true,
          channels: [{ id: "C01234567", name: "eng-l10n" }],
        },
      };
    });

    const result = await searchSlackChannels({
      botToken: "xoxb-token",
      query: "C01234567",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected id search to succeed after lookup miss");
    }
    expect(result.value).toEqual([{ id: "slack:C01234567", name: "eng-l10n", private: false }]);
  });

  it("includes the selected channel even when it is outside the browse page", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          channel: { id: "C_SELECTED", name: "release-updates", is_private: true },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          channels: [{ id: "C_PUBLIC", name: "localization" }],
        }),
      );

    const result = await searchSlackChannels({
      botToken: "xoxb-token",
      selectedChannelId: "slack:C_SELECTED",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected selected channel merge to succeed");
    }
    expect(result.value).toEqual([
      { id: "slack:C_PUBLIC", name: "localization", private: false },
      { id: "slack:C_SELECTED", name: "release-updates", private: true },
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://slack.com/api/conversations.info",
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("channel=C_SELECTED");
  });

  it("retries Slack 429 responses and then succeeds", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { ok: false, error: "ratelimited" },
          { status: 429, headers: { "retry-after": "1" } },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          channels: [{ id: "C1", name: "general" }],
        }),
      );

    const result = await searchSlackChannels({
      botToken: "xoxb-token",
      sleep,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected rate-limit retry to succeed");
    }
    expect(result.value).toEqual([{ id: "slack:C1", name: "general", private: false }]);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns slack_rate_limited after retries are exhausted", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: "ratelimited" }, { status: 429 }));

    const result = await searchSlackChannels({
      botToken: "xoxb-token",
      sleep: async () => undefined,
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected rate-limit exhaustion");
    }
    expect(result.error).toEqual({ code: "slack_rate_limited" });
  });
});
