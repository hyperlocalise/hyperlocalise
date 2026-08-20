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
  parseSlackConversationId,
  toCanonicalSlackChannelId,
  verifySlackChannel,
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

describe("verifySlackChannel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    fetchMock.mockReset();
  });

  it("canonicalizes Slack channel ids", () => {
    expect(toCanonicalSlackChannelId("C123")).toBe("slack:C123");
    expect(toCanonicalSlackChannelId("slack:C123")).toBe("slack:C123");
    expect(fromCanonicalSlackChannelId("slack:C123")).toBe("C123");
    expect(fromCanonicalSlackChannelId("C123")).toBe("C123");
    expect(normalizeSlackChannelQuery("#L10N")).toBe("l10n");
    expect(parseSlackConversationId("slack:C01234567")).toBe("C01234567");
    expect(parseSlackConversationId("https://acme.slack.com/archives/C01234567/p1")).toBe(
      "C01234567",
    );
    expect(parseSlackConversationId("<#C01234567|release-notes>")).toBe("C01234567");
    expect(parseSlackConversationId("release-notes")).toBeNull();
  });

  it("verifies a channel through conversations.info", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        channel: { id: "C01234567", name: "localization", is_private: false },
      }),
    );

    const result = await verifySlackChannel({
      botToken: "xoxb-token",
      channelId: "C01234567",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected channel verify to succeed");
    }
    expect(result.value).toEqual({
      id: "slack:C01234567",
      name: "localization",
      private: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = requestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(url.origin + url.pathname).toBe("https://slack.com/api/conversations.info");
    expect(url.searchParams.get("channel")).toBe("C01234567");
  });

  it("returns null for archived channels", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        channel: { id: "C01234568", name: "old", is_archived: true },
      }),
    );

    const result = await verifySlackChannel({
      botToken: "xoxb-token",
      channelId: "C01234568",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected archived channel verify to succeed with null");
    }
    expect(result.value).toBeNull();
  });

  it("returns null when Slack cannot find the channel", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: false,
        error: "channel_not_found",
      }),
    );

    const result = await verifySlackChannel({
      botToken: "xoxb-token",
      channelId: "C01234569",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected missing channel verify to succeed with null");
    }
    expect(result.value).toBeNull();
  });

  it("returns null for invalid channel id input without calling Slack", async () => {
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifySlackChannel({
      botToken: "xoxb-token",
      channelId: "not-a-channel",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected invalid channel id to return null");
    }
    expect(result.value).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries Slack rate limits before succeeding", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: "ratelimited" }, { status: 429 }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          channel: { id: "C01234570", name: "general", is_private: false },
        }),
      );

    const sleep = vi.fn(async () => undefined);
    const result = await verifySlackChannel({
      botToken: "xoxb-token",
      channelId: "C01234570",
      sleep,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected rate-limit retry to succeed");
    }
    expect(result.value).toEqual({ id: "slack:C01234570", name: "general", private: false });
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns slack_rate_limited after retries are exhausted", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: "ratelimited" }, { status: 429 }));

    const result = await verifySlackChannel({
      botToken: "xoxb-token",
      channelId: "C01234571",
      sleep: async () => undefined,
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected rate-limit exhaustion");
    }
    expect(result.error).toEqual({ code: "slack_rate_limited" });
  });

  it("surfaces permission errors instead of treating them as lookup misses", async () => {
    vi.stubGlobal("fetch", fetchMock);

    for (const slackError of ["missing_scope", "not_in_channel"] as const) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          ok: false,
          error: slackError,
        }),
      );

      const result = await verifySlackChannel({
        botToken: "xoxb-token",
        channelId: "C01234572",
      });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) {
        throw new Error(`expected ${slackError} to remain an API error`);
      }
      expect(result.error).toEqual({ code: "slack_api_error", slackError });
    }
  });

  it("falls back to name_normalized when name is absent", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        channel: { id: "C01234573", name_normalized: "release-notes", is_private: true },
      }),
    );

    const result = await verifySlackChannel({
      botToken: "xoxb-token",
      channelId: "C01234573",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected name_normalized channel verify to succeed");
    }
    expect(result.value).toEqual({
      id: "slack:C01234573",
      name: "release-notes",
      private: true,
    });
  });

  it("returns null when the channel payload is missing id or name", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        channel: { id: "C01234574" },
      }),
    );

    const result = await verifySlackChannel({
      botToken: "xoxb-token",
      channelId: "C01234574",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected incomplete channel payload to succeed with null");
    }
    expect(result.value).toBeNull();
  });
});
