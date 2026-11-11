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
import { randomUUID } from "node:crypto";

import type { Browser, BrowserContext } from "playwright-core";

import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { MAX_PUBLIC_HTTP_RESPONSE_BYTES } from "@/lib/security/public-http-fetch";

import { filterAllowedBrowserUrls, isAllowedBrowserUrl } from "./audit-browser-url-guard";
import {
  AUDIT_BROWSER_LAYOUT_LIMITS,
  AUDIT_BROWSER_MOBILE_VIEWPORT,
  AUDIT_BROWSER_NAV_TIMEOUT_MS,
  AUDIT_BROWSER_NETWORKIDLE_TIMEOUT_MS,
  AUDIT_BROWSER_SETTLE_MS,
  AUDIT_BROWSER_USER_AGENT,
  AUDIT_BROWSER_VIEWPORT,
  AUDIT_LAYOUT_MEASURE_SOURCE,
} from "./audit-playwright-script";
import type { HtmlPageRenderer, RenderedHtmlPage } from "./crawl-renderer";
import { parseAuditPageLayout } from "./layout";

export const TILION_API_BASE_URL = "https://back.tilion.dev";
const TILION_SESSION_TTL_SECONDS = 10 * 60;
const TILION_SESSION_IDLE_TIMEOUT_SECONDS = 2 * 60;
const TILION_CREATE_TIMEOUT_MS = 120_000;
const TILION_DELETE_TIMEOUT_MS = 30_000;
const TILION_CONNECT_TIMEOUT_MS = 60_000;
const TILION_RENDER_CONCURRENCY = 3;

export type TilionAuditBrowserError =
  | { code: "tilion_session_create_failed"; status: number | null }
  | { code: "tilion_cdp_unavailable" }
  | { code: "tilion_connect_failed" };

type TilionSessionResponse = {
  session_id?: string;
  connect_url?: string | null;
};

const measureLayoutExpression = `(${AUDIT_LAYOUT_MEASURE_SOURCE})(${JSON.stringify(AUDIT_BROWSER_LAYOUT_LIMITS)})`;

function authorization(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}` };
}

async function createTilionSession(
  apiKey: string,
): Promise<Result<{ sessionId: string; connectUrl: string }, TilionAuditBrowserError>> {
  let response: Response;
  try {
    response = await fetch(`${TILION_API_BASE_URL}/v1/session`, {
      method: "POST",
      headers: {
        ...authorization(apiKey),
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        ttl: TILION_SESSION_TTL_SECONDS,
        idle_timeout: TILION_SESSION_IDLE_TIMEOUT_SECONDS,
      }),
      signal: AbortSignal.timeout(TILION_CREATE_TIMEOUT_MS),
    });
  } catch {
    return err({ code: "tilion_session_create_failed", status: null });
  }
  if (!response.ok) {
    return err({ code: "tilion_session_create_failed", status: response.status });
  }

  const session = (await response.json().catch(() => null)) as TilionSessionResponse | null;
  if (!session?.session_id) {
    return err({ code: "tilion_session_create_failed", status: response.status });
  }
  if (!session.connect_url) {
    await deleteTilionSession(apiKey, session.session_id);
    return err({ code: "tilion_cdp_unavailable" });
  }
  return ok({ sessionId: session.session_id, connectUrl: session.connect_url });
}

async function deleteTilionSession(apiKey: string, sessionId: string) {
  await fetch(`${TILION_API_BASE_URL}/v1/session/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: authorization(apiKey),
    signal: AbortSignal.timeout(TILION_DELETE_TIMEOUT_MS),
  }).catch(() => undefined);
}

function truncateHtml(html: string) {
  const bytes = Buffer.from(html, "utf8");
  return bytes.byteLength <= MAX_PUBLIC_HTTP_RESPONSE_BYTES
    ? html
    : bytes.subarray(0, MAX_PUBLIC_HTTP_RESPONSE_BYTES).toString("utf8");
}

async function renderTilionPage(
  context: BrowserContext,
  url: string,
): Promise<RenderedHtmlPage | null> {
  const page = await context.newPage();
  try {
    const response = await page.goto(url, {
      waitUntil: "load",
      timeout: AUDIT_BROWSER_NAV_TIMEOUT_MS,
    });
    await page
      .waitForLoadState("networkidle", { timeout: AUDIT_BROWSER_NETWORKIDLE_TIMEOUT_MS })
      .catch(() => undefined);
    await page.waitForTimeout(AUDIT_BROWSER_SETTLE_MS);

    const finalUrl = page.url();
    if (!(await isAllowedBrowserUrl(finalUrl))) {
      return null;
    }
    const html = truncateHtml(await page.content());

    const viewports: unknown[] = [];
    try {
      viewports.push(await page.evaluate(measureLayoutExpression));
      await page.setViewportSize(AUDIT_BROWSER_MOBILE_VIEWPORT);
      await page.waitForTimeout(AUDIT_BROWSER_SETTLE_MS);
      viewports.push(await page.evaluate(measureLayoutExpression));
    } catch {
      // Layout data is optional; visual checks fall back to not applicable.
    }

    return {
      requestedUrl: url,
      url: finalUrl,
      status: response?.status() ?? 0,
      html,
      layout: parseAuditPageLayout(viewports.length > 0 ? { viewports } : null),
    };
  } catch {
    return null;
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * Renders audit pages in one Tilion cloud browser session, driven over CDP.
 * Uses an isolated context so the audit keeps its own user agent and viewport.
 * Tilion's browser runs on Tilion's network and refuses private navigations,
 * so subresource requests are not intercepted the way the sandbox script does.
 */
export async function createTilionAuditBrowserSession(input: {
  apiKey: string;
}): Promise<Result<HtmlPageRenderer, TilionAuditBrowserError>> {
  const session = await createTilionSession(input.apiKey);
  if (isErr(session)) {
    return err(session.error);
  }
  const { sessionId, connectUrl } = session.value;

  let browser: Browser;
  let context: BrowserContext;
  try {
    const { chromium } = await import("playwright-core");
    browser = await chromium.connectOverCDP(connectUrl, { timeout: TILION_CONNECT_TIMEOUT_MS });
    context = await browser.newContext({
      userAgent: AUDIT_BROWSER_USER_AGENT,
      viewport: AUDIT_BROWSER_VIEWPORT,
      locale: "en-US",
    });
  } catch {
    await deleteTilionSession(input.apiKey, sessionId);
    return err({ code: "tilion_connect_failed" });
  }

  return ok({
    async render(urls: string[]): Promise<RenderedHtmlPage[]> {
      const allowed = await filterAllowedBrowserUrls(urls);
      const rendered = await mapWithConcurrency(allowed, TILION_RENDER_CONCURRENCY, (url) =>
        renderTilionPage(context, url),
      );
      return rendered.filter((page): page is RenderedHtmlPage => page != null);
    },
    async close() {
      try {
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      } finally {
        await deleteTilionSession(input.apiKey, sessionId);
      }
    },
  });
}
