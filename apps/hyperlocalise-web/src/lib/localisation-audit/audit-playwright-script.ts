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
import { MAX_PUBLIC_HTTP_RESPONSE_BYTES } from "@/lib/security/public-http-fetch";

import { LOCALISATION_AUDIT_USER_AGENT } from "./user-agent";

export const AUDIT_BROWSER_USER_AGENT = LOCALISATION_AUDIT_USER_AGENT;
export const AUDIT_BROWSER_NAV_TIMEOUT_MS = 20_000;
export const AUDIT_BROWSER_NETWORKIDLE_TIMEOUT_MS = 4_000;
export const AUDIT_BROWSER_SETTLE_MS = 400;
export const AUDIT_BROWSER_VIEWPORT = { width: 1440, height: 1000 } as const;
export const AUDIT_BROWSER_MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
export const AUDIT_BROWSER_LAYOUT_LIMITS = {
  maxElements: 12,
  maxTextChars: 120,
  tolerancePx: 2,
} as const;

/**
 * Playwright + Chromium baked into the hyperlocalise-sandbox VCR image.
 * Same path the agent screenshot tool uses. Do not install at crawl time.
 */
export const SANDBOX_BROWSER_RUNTIME_DIR = "/tmp/hyperlocalise-browser-runtime";
export const SANDBOX_PLAYWRIGHT_MODULE = `${SANDBOX_BROWSER_RUNTIME_DIR}/node_modules/playwright`;
export const SANDBOX_PLAYWRIGHT_BROWSERS_DIR = `${SANDBOX_BROWSER_RUNTIME_DIR}/ms-playwright`;
const AUDIT_BROWSER_DIR = "/tmp/hl-audit-browser";

export function auditBrowserPaths(outputDir: string) {
  return {
    outputDir,
    scriptPath: `${outputDir}/render.cjs`,
    inputPath: `${outputDir}/urls.json`,
    manifestPath: `${outputDir}/manifest.json`,
  };
}

export const SANDBOX_AUDIT_BROWSER_PATHS = auditBrowserPaths(AUDIT_BROWSER_DIR);

/**
 * CJS script that renders audit pages. Defaults to the sandbox Playwright
 * install and directory; local runs pass their own. It launches one Chromium, visits
 * each vetted URL, waits for JS to settle, writes rendered HTML to disk, and
 * records layout measurements at desktop and mobile widths.
 */
export function buildAuditPlaywrightScript(
  options: { playwrightModule?: string; outputDir?: string } = {},
) {
  const playwrightModule = options.playwrightModule ?? SANDBOX_PLAYWRIGHT_MODULE;
  const paths = options.outputDir
    ? auditBrowserPaths(options.outputDir)
    : SANDBOX_AUDIT_BROWSER_PATHS;
  return `
const { chromium } = require(${JSON.stringify(playwrightModule)});
const fs = require("node:fs");
const path = require("node:path");

const input = JSON.parse(fs.readFileSync(${JSON.stringify(paths.inputPath)}, "utf8"));
const outputDir = ${JSON.stringify(paths.outputDir)};
const maxHtmlBytes = ${MAX_PUBLIC_HTTP_RESPONSE_BYTES};
const navTimeoutMs = ${AUDIT_BROWSER_NAV_TIMEOUT_MS};
const networkIdleTimeoutMs = ${AUDIT_BROWSER_NETWORKIDLE_TIMEOUT_MS};
const settleMs = ${AUDIT_BROWSER_SETTLE_MS};
const mobileViewport = ${JSON.stringify(AUDIT_BROWSER_MOBILE_VIEWPORT)};
const layoutLimits = ${JSON.stringify(AUDIT_BROWSER_LAYOUT_LIMITS)};

// Runs in the page. Reports horizontal page overflow, text clipped by its own
// box, and elements cut off by the right viewport edge. Elements inside
// horizontally scrollable or clipped containers (carousels, off-canvas menus)
// are skipped because overflow there is usually intentional.
function measureAuditLayout(limits) {
  const viewportWidth = window.innerWidth;
  const textOf = (element) =>
    (element.innerText || element.textContent || "")
      .trim()
      .replace(/\\s+/g, " ")
      .slice(0, limits.maxTextChars);
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const insideHorizontalClip = (element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).overflowX !== "visible") return true;
    }
    return false;
  };

  const clippedText = [];
  for (const element of document.querySelectorAll("button, a, label, h1, h2, h3, [role=button], [role=tab]")) {
    if (clippedText.length >= limits.maxElements) break;
    if (!isVisible(element)) continue;
    const style = getComputedStyle(element);
    if (style.display === "inline" || element.clientWidth === 0) continue;
    const text = textOf(element);
    if (!text) continue;
    const clipsX =
      element.scrollWidth > element.clientWidth + 1 &&
      (style.overflowX === "hidden" || style.overflowX === "clip" || style.textOverflow === "ellipsis");
    const clipsY =
      element.scrollHeight > element.clientHeight + 1 &&
      (style.overflowY === "hidden" || style.overflowY === "clip");
    if (clipsX || clipsY) clippedText.push({ tag: element.tagName.toLowerCase(), text });
  }

  const offscreen = [];
  for (const element of document.querySelectorAll("button, a, h1, h2, h3, p, label, input")) {
    if (offscreen.length >= limits.maxElements) break;
    if (!isVisible(element)) continue;
    const rect = element.getBoundingClientRect();
    const straddlesRightEdge = rect.left < viewportWidth && rect.right > viewportWidth + limits.tolerancePx;
    if (!straddlesRightEdge || insideHorizontalClip(element)) continue;
    offscreen.push({ tag: element.tagName.toLowerCase(), text: textOf(element) });
  }

  return {
    width: viewportWidth,
    horizontalOverflowPx: Math.max(0, Math.round(document.documentElement.scrollWidth - viewportWidth)),
    clippedText,
    offscreen,
  };
}

async function measureLayout(page) {
  const viewports = [];
  try {
    viewports.push(await page.evaluate(measureAuditLayout, layoutLimits));
    await page.setViewportSize(mobileViewport);
    await page.waitForTimeout(settleMs);
    viewports.push(await page.evaluate(measureAuditLayout, layoutLimits));
  } catch {
    // Layout data is optional; visual checks fall back to not applicable.
  }
  return viewports.length > 0 ? { viewports } : null;
}

function parseIpv4Octets(hostname) {
  const octets = hostname.split(".");
  if (octets.length !== 4) return null;
  const bytes = octets.map((octet) => Number(octet));
  if (bytes.some((byte, index) => !Number.isInteger(byte) || byte < 0 || byte > 255 || octets[index] === "")) {
    return null;
  }
  return bytes;
}

function isBlockedIpv4Address(hostname) {
  const bytes = parseIpv4Octets(hostname);
  if (!bytes) return false;
  const [first, second, third] = bytes;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && third === 113)
  );
}

function ipv4FromIpv4MappedIpv6(hostname) {
  if (!/^::ffff:/i.test(hostname)) return null;
  const rest = hostname.slice(7);
  if (rest.includes(".")) return rest;
  const [highPart, lowPart] = rest.split(":");
  if (!highPart || !lowPart) return null;
  const high = Number.parseInt(highPart, 16);
  const low = Number.parseInt(lowPart, 16);
  if (Number.isNaN(high) || Number.isNaN(low)) return null;
  return ((high >> 8) & 0xff) + "." + (high & 0xff) + "." + ((low >> 8) & 0xff) + "." + (low & 0xff);
}

function isBlockedIpv6Address(hostname) {
  if (!hostname.includes(":")) return false;
  if (
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("::ffff:") ||
    hostname.startsWith("64:ff9b:") ||
    hostname.startsWith("100:") ||
    hostname.startsWith("2001:2:") ||
    hostname.startsWith("2001:db8:") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80:") ||
    hostname.startsWith("fe8") ||
    hostname.startsWith("fe9") ||
    hostname.startsWith("fea") ||
    hostname.startsWith("feb")
  ) {
    return true;
  }
  const mappedIpv4 = ipv4FromIpv4MappedIpv6(hostname);
  if (mappedIpv4 && isBlockedIpv4Address(mappedIpv4)) return true;
  return false;
}

function isBlockedHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\\[|\\]$/g, "").replace(/\\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;
  if (parseIpv4Octets(host)) return isBlockedIpv4Address(host);
  if (host.includes(":")) return isBlockedIpv6Address(host);
  return false;
}

function isBlockedNavigationUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
    return isBlockedHost(parsed.hostname);
  } catch {
    return true;
  }
}

function truncateHtml(html) {
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes <= maxHtmlBytes) return html;
  return Buffer.from(html, "utf8").subarray(0, maxHtmlBytes).toString("utf8");
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: ${JSON.stringify(AUDIT_BROWSER_USER_AGENT)},
    viewport: ${JSON.stringify(AUDIT_BROWSER_VIEWPORT)},
    locale: "en-US",
  });
  const pages = [];
  for (const url of input.urls || []) {
    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const requestUrl = route.request().url();
      if (isBlockedNavigationUrl(requestUrl)) {
        return route.abort();
      }
      return route.continue();
    });
    let status = 0;
    try {
      const response = await page.goto(url, { waitUntil: "load", timeout: navTimeoutMs });
      status = response ? response.status() : 0;
      await page.waitForLoadState("networkidle", { timeout: networkIdleTimeoutMs }).catch(() => undefined);
      if (settleMs > 0) {
        await page.waitForTimeout(settleMs);
      }
      const finalUrl = page.url();
      if (isBlockedNavigationUrl(finalUrl)) {
        pages.push({ requestedUrl: url, url: finalUrl, status: 0, error: "blocked_final_url" });
        continue;
      }
      const htmlPath = path.join(outputDir, pages.length + ".html");
      fs.writeFileSync(htmlPath, truncateHtml(await page.content()));
      const layout = await measureLayout(page);
      pages.push({ requestedUrl: url, url: finalUrl, status, htmlPath, layout });
    } catch (error) {
      pages.push({
        requestedUrl: url,
        url,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await page.close();
    }
  }
  fs.writeFileSync(${JSON.stringify(paths.manifestPath)}, JSON.stringify({ pages }));
  await browser.close();
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
`.trimStart();
}
