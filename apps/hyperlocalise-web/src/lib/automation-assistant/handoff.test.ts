// @vitest-environment happy-dom

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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { stashAutomationAssistantHandoff, takeAutomationAssistantHandoff } from "./handoff";

const STORAGE_KEY = "hyperlocalise.automation-assistant.handoff";

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

describe("automation assistant handoff", () => {
  it("returns the stashed request once and then forgets it", () => {
    stashAutomationAssistantHandoff("Post a weekly summary to Slack");

    expect(takeAutomationAssistantHandoff()).toBe("Post a weekly summary to Slack");
    expect(takeAutomationAssistantHandoff()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("drops a request after five minutes so a stale page does not reopen it", () => {
    stashAutomationAssistantHandoff("Translate the help center");
    vi.setSystemTime(new Date("2026-10-10T12:05:00.001Z"));

    expect(takeAutomationAssistantHandoff()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps a request that is still inside the five-minute window", () => {
    stashAutomationAssistantHandoff("Translate the help center");
    vi.setSystemTime(new Date("2026-10-10T12:04:59.000Z"));

    expect(takeAutomationAssistantHandoff()).toBe("Translate the help center");
  });

  it("ignores whitespace-only text, malformed JSON, and incomplete payloads", () => {
    stashAutomationAssistantHandoff("   ");
    expect(takeAutomationAssistantHandoff()).toBeNull();

    sessionStorage.setItem(STORAGE_KEY, "{not-json");
    expect(takeAutomationAssistantHandoff()).toBeNull();

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ text: "ok" }));
    expect(takeAutomationAssistantHandoff()).toBeNull();

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now() }));
    expect(takeAutomationAssistantHandoff()).toBeNull();
  });
});
