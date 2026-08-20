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
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { E2E_BASE_URL, E2E_DEFAULT_LOCALE } from "../constants";
import { getE2ePage, loginAsAdmin, useE2eBrowser } from "../fixtures/browser";
import { provisionIssueCommentMentionFixture } from "../helpers/issue-sheet-fixture";

function issueDetailUrl(input: { organizationSlug: string; projectId: string; issueId: string }) {
  return new URL(
    `/${E2E_DEFAULT_LOCALE}/org/${input.organizationSlug}/projects/${input.projectId}/issue-sheet/${input.issueId}`,
    E2E_BASE_URL,
  ).toString();
}

describe("issue comment mentions", () => {
  useE2eBrowser();

  it("shows member email in the mention picker", async () => {
    const page = getE2ePage();
    const identity = await loginAsAdmin(page);
    const fixture = await provisionIssueCommentMentionFixture(identity);

    await page.goto(
      issueDetailUrl({
        organizationSlug: fixture.organizationSlug,
        projectId: fixture.projectId,
        issueId: fixture.issueId,
      }),
      { waitUntil: "domcontentloaded" },
    );

    await page
      .getByRole("textbox", { name: "Title" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByText("Comments", { exact: true }).waitFor({ state: "visible" });
    await page.locator(".ProseMirror").last().click();
    await page.keyboard.type("@Ment");

    const mentionMenu = page.getByRole("listbox");
    await mentionMenu.waitFor({ state: "visible", timeout: 15_000 });
    await mentionMenu.getByText(fixture.member.displayName).waitFor({ state: "visible" });
    await mentionMenu.getByText(fixture.member.email).waitFor({ state: "visible" });
  }, 120_000);

  it("notifies a newly mentioned member when a comment is edited", async () => {
    const page = getE2ePage();
    const identity = await loginAsAdmin(page);
    const fixture = await provisionIssueCommentMentionFixture(identity);

    await page.goto(
      issueDetailUrl({
        organizationSlug: fixture.organizationSlug,
        projectId: fixture.projectId,
        issueId: fixture.issueId,
      }),
      { waitUntil: "domcontentloaded" },
    );

    await page
      .getByRole("textbox", { name: "Title" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page
      .getByText(fixture.initialCommentBody, { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });

    await page.getByRole("button", { name: "Edit" }).click();
    const editEditor = page.locator(".ProseMirror").filter({ hasText: fixture.initialCommentBody });
    await editEditor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" @Target");

    const mentionMenu = page.getByRole("listbox");
    await mentionMenu.waitFor({ state: "visible", timeout: 15_000 });
    await mentionMenu.getByRole("option", { name: /Mention Target/i }).click();

    const updateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/comments/") &&
        response.request().method() === "PATCH" &&
        response.ok(),
    );

    await page.getByRole("button", { name: "Save" }).click();
    await updateResponsePromise;

    const [notification] = await db
      .select()
      .from(schema.issueNotifications)
      .where(
        and(
          eq(schema.issueNotifications.issueId, fixture.issueId),
          eq(schema.issueNotifications.recipientUserId, fixture.member.localUserId),
          eq(schema.issueNotifications.type, "mentioned"),
        ),
      );

    expect(notification).toBeDefined();
    if (!notification) {
      throw new Error("Expected a mention notification for the edited comment");
    }
    expect(notification.recipientUserId).toBe(fixture.member.localUserId);
  }, 120_000);
});
