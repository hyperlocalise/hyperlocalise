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
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";

import { e2eUrl, organizationPath } from "../constants";
import { getE2ePage, loginWithRole, useE2eBrowser, waitForSettledPage } from "../fixtures/browser";
import { provisionVendorTaskFixture } from "../helpers/vendor-task-fixture";

/** Retries a check until it passes, for a save that lands a moment after the click. */
async function waitFor(check: () => Promise<void>, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await check();
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

// Pages a vendor must never see: every section of a workspace but My jobs. Each sends them
// back to My jobs.
const CLOSED_PAGES = [
  "/dashboard",
  "/projects",
  "/jobs",
  "/members",
  "/teams",
  "/glossaries",
  "/translation-memories",
  "/dictionaries",
  "/knowledge",
  "/reports",
  "/issues",
  "/inbox",
  "/chat",
  "/automations",
  "/integrations",
  "/ai-engine",
  "/qa",
  "/domains",
  "/settings",
  "/settings/account",
  "/settings/api-keys",
  "/settings/billing",
  "/settings/project-templates",
];

describe("the Vendor role", () => {
  useE2eBrowser();

  it("lands on My jobs, has nothing else in the navigation, and is sent back from closed pages", async () => {
    const page = getE2ePage();
    const identity = await loginWithRole(page, "vendor");
    const isMyJobs = (url: URL) =>
      url.pathname.endsWith(`/org/${identity.organizationSlug}/my-jobs`);

    await page.waitForURL(isMyJobs, { timeout: 30_000 });
    await page.getByText("Assigned to me").first().waitFor({ state: "visible", timeout: 30_000 });
    await waitForSettledPage(page);

    // Only the Assigned list, and only one place to go.
    expect(await page.getByText("Created by me").count()).toBe(0);
    const links = await page
      .locator('[data-slot="sidebar"] a[href]')
      .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href).toContain("/my-jobs");
    }
    for (const label of ["Projects", "Dashboard", "Glossaries", "Reports", "Settings", "Inbox"]) {
      expect(await page.getByRole("link", { name: label, exact: true }).count(), label).toBe(0);
    }

    for (const suffix of CLOSED_PAGES) {
      const url = e2eUrl(organizationPath(identity.organizationSlug, suffix));

      // The server itself refuses, before any script runs: its answer is a redirect, either as
      // the response or, once the page has begun streaming, as the redirect tag Next.js writes.
      // The frame's own guard in the browser would hide a page the server still sent.
      const response = await page.request.get(url, { maxRedirects: 0 });
      const redirected =
        response.status() >= 300 && response.status() < 400
          ? (response.headers().location ?? "")
          : (/id="__next-page-redirect"[^>]*url=([^"]+)"/.exec(await response.text())?.[1] ?? "");
      expect(redirected, suffix).toContain(`/org/${identity.organizationSlug}/my-jobs`);

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForURL(isMyJobs, { timeout: 30_000 });
    }
  }, 240_000);

  it("works an open task: its page, the editor for its file only, and Mark done ends the access", async () => {
    const page = getE2ePage();
    const identity = await loginWithRole(page, "vendor");
    const isMyJobs = (url: URL) =>
      url.pathname.endsWith(`/org/${identity.organizationSlug}/my-jobs`);
    await page.waitForURL(isMyJobs, { timeout: 30_000 });
    const task = await provisionVendorTaskFixture(identity);
    const taskUrl = e2eUrl(
      organizationPath(
        identity.organizationSlug,
        `/projects/${task.projectId}/jobs/${task.taskId}`,
      ),
    );

    // My jobs lists the task; its page has the editor and Mark done, and no team controls.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(task.taskTitle).first().click();
    await page.waitForURL((url) => url.pathname.endsWith(`/jobs/${task.taskId}`), {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Mark done" }).waitFor({ state: "visible" });
    for (const name of ["Cancel job", "Mark as failed"]) {
      expect(await page.getByRole("button", { name }).count(), name).toBe(0);
    }

    // The editor shows the task's file and not the project's other file.
    await page.getByText("Open Editor").first().click();
    await page.waitForURL((url) => url.pathname.endsWith(`/jobs/${task.taskId}/strings`), {
      timeout: 30_000,
    });
    await page
      .getByText(task.sourceTexts[0])
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    expect(await page.getByText(`Not for the vendor`).count()).toBe(0);
    // Approve is not offered on a post-edit task.
    expect(await page.getByRole("button", { name: "Approve", exact: true }).count()).toBe(0);

    // Type a translation for the first string and save it as a draft.
    const translation = `Bon retour ${task.taskId.slice(-6)}`;
    await page.getByText(task.sourceTexts[0]).first().click();
    const target = page.locator('textarea, [contenteditable="true"]').first();
    await target.click();
    await page.keyboard.type(translation);
    await page.getByRole("button", { name: "Save draft" }).first().click();
    await waitFor(async () => {
      const saved = await db
        .select({ text: schema.projectTranslations.text })
        .from(schema.projectTranslations)
        .where(eq(schema.projectTranslations.projectId, task.projectId));
      expect(saved.map((row) => row.text)).toContain(translation);
    });

    // Another file named in the address is not opened: the editor stays on the task's file.
    await page.goto(
      `${taskUrl}/strings?sourcePath=${encodeURIComponent(task.otherSourcePath)}&targetLocale=de-DE`,
      { waitUntil: "domcontentloaded" },
    );
    await page
      .getByText(task.sourceTexts[0])
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    expect(await page.getByText(`Not for the vendor`).count()).toBe(0);

    // Mark done takes them back to My jobs, and the task is no longer theirs to open.
    await page.goto(taskUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Mark done" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Mark done" }).click();
    await page.waitForURL(isMyJobs, { timeout: 30_000 });
    await page.goto(taskUrl, { waitUntil: "domcontentloaded" });
    await page.waitForURL(isMyJobs, { timeout: 30_000 });
    await page.goto(`${taskUrl}/strings`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(isMyJobs, { timeout: 30_000 });
  }, 240_000);
});
