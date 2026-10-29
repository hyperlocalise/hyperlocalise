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
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";
import { setupServer } from "msw/node";

import {
  reportsActivityErrorMswHandlers,
  reportsMemberMswHandlers,
  reportsMswHandlers,
} from "./reports-msw-handlers";

const server = setupServer(...reportsMswHandlers);
const base = "http://localhost/v1/orgs/acme/reports";

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe("Reports Storybook handlers", () => {
  it("answers each section with the fixture data", async () => {
    const settings = await (await fetch(`${base}/settings`)).json();
    expect(settings.settings).toMatchObject({ financial: true, today: "2026-10-21" });
    const activity = await (await fetch(`${base}/activity?from=2026-09-24`)).json();
    expect(activity.activity.current.source).toBe(48_210);
    const saved = await fetch(`${base}/rate-cards`, {
      method: "PUT",
      body: JSON.stringify({ name: "New", defaultBasis: "word", lines: [] }),
    });
    expect(await saved.json()).toEqual({
      rateCard: { name: "New", defaultBasis: "word", lines: [] },
    });
  });

  it("answers word counts grouped by task with task rows", async () => {
    const words = await (await fetch(`${base}/words?groupBy=task&unit=characters`)).json();
    expect(words.wordCounts).toMatchObject({ groupBy: "task", unit: "characters" });
    expect(words.wordCounts.rows[0].jobTitle).toBe("Help centre: billing articles");
  });

  it("can play a member, and a failing section", async () => {
    server.use(...reportsMemberMswHandlers);
    expect((await (await fetch(`${base}/settings`)).json()).settings.financial).toBe(false);
    server.use(...reportsActivityErrorMswHandlers);
    expect((await fetch(`${base}/activity`)).status).toBe(500);
  });
});
