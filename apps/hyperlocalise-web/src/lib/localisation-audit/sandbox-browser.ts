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
import type { Sandbox } from "@vercel/sandbox";

import { isErr } from "@/lib/primitives/result/results";
import {
  assertResolvablePublicHttpUrl,
  MAX_PUBLIC_HTTP_RESPONSE_BYTES,
} from "@/lib/security/public-http-fetch";
import { isBlockedHost, isPublicHttpUrl } from "@/lib/security/ssrf-guard";
import { createConfiguredVercelSandbox } from "@/lib/vercel-sandbox-config";

import type { HtmlPageRenderer, RenderedHtmlPage } from "./crawl-renderer";
import { AuditBrowserSetupError } from "./sandbox-browser-error";

export { AuditBrowserSetupError } from "./sandbox-browser-error";

export const AUDIT_BROWSER_SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;
export const AUDIT_BROWSER_USER_AGENT =
  "HyperlocaliseLocalisationAudit/1.0 (+https://hyperlocalise.com)";
export const AUDIT_BROWSER_NAV_TIMEOUT_MS = 20_000;
export const AUDIT_BROWSER_NETWORKIDLE_TIMEOUT_MS = 4_000;
export const AUDIT_BROWSER_SETTLE_MS = 400;
export const AUDIT_BROWSER_VIEWPORT = { width: 1440, height: 1000 } as const;

/**
 * Playwright + Chromium baked into the hyperlocalise-sandbox VCR image.
 * Same path the agent screenshot tool uses. Do not install at crawl time.
 */
const SANDBOX_BROWSER_RUNTIME_DIR = "/tmp/hyperlocalise-browser-runtime";
const SANDBOX_PLAYWRIGHT_MODULE = `${SANDBOX_BROWSER_RUNTIME_DIR}/node_modules/playwright`;
const SANDBOX_PLAYWRIGHT_BROWSERS_DIR = `${SANDBOX_BROWSER_RUNTIME_DIR}/ms-playwright`;
const AUDIT_BROWSER_DIR = "/tmp/hl-audit-browser";
const AUDIT_BROWSER_SCRIPT_PATH = `${AUDIT_BROWSER_DIR}/render.cjs`;
const AUDIT_BROWSER_INPUT_PATH = `${AUDIT_BROWSER_DIR}/urls.json`;
const AUDIT_BROWSER_MANIFEST_PATH = `${AUDIT_BROWSER_DIR}/manifest.json`;
const ERROR_CODE_PREFIX = "HYPERLOCALISE_AUDIT_BROWSER_ERROR_CODE=";

export function isBlockedBrowserNavigationUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }
    return isBlockedHost(parsed.hostname);
  } catch {
    return true;
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function prepareAuditBrowserRuntimeCommand() {
  const playwrightModule = shellQuote(SANDBOX_PLAYWRIGHT_MODULE);
  const browsersPath = shellQuote(SANDBOX_PLAYWRIGHT_BROWSERS_DIR);
  const auditDir = shellQuote(AUDIT_BROWSER_DIR);

  return [
    "set -euo pipefail",
    `mkdir -p ${auditDir}`,
    `if [ ! -d ${playwrightModule} ] || [ ! -d ${browsersPath} ]; then`,
    `  echo "${ERROR_CODE_PREFIX}browser_runtime_missing" >&2`,
    "  exit 87",
    "fi",
  ].join("\n");
}

/**
 * CJS script that runs inside the sandbox. It launches one Chromium, visits
 * each vetted URL, waits for JS to settle, and writes rendered HTML to disk.
 */
export function buildAuditPlaywrightScript() {
  return `
const { chromium } = require(${JSON.stringify(SANDBOX_PLAYWRIGHT_MODULE)});
const fs = require("node:fs");
const path = require("node:path");

const input = JSON.parse(fs.readFileSync(${JSON.stringify(AUDIT_BROWSER_INPUT_PATH)}, "utf8"));
const outputDir = ${JSON.stringify(AUDIT_BROWSER_DIR)};
const maxHtmlBytes = ${MAX_PUBLIC_HTTP_RESPONSE_BYTES};
const navTimeoutMs = ${AUDIT_BROWSER_NAV_TIMEOUT_MS};
const networkIdleTimeoutMs = ${AUDIT_BROWSER_NETWORKIDLE_TIMEOUT_MS};
const settleMs = ${AUDIT_BROWSER_SETTLE_MS};

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
      pages.push({ requestedUrl: url, url: finalUrl, status, htmlPath });
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
  fs.writeFileSync(${JSON.stringify(AUDIT_BROWSER_MANIFEST_PATH)}, JSON.stringify({ pages }));
  await browser.close();
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
`.trimStart();
}

type AuditBrowserManifestPage = {
  requestedUrl: string;
  url: string;
  status: number;
  htmlPath?: string;
  error?: string;
};

async function readSandboxText(sandbox: Sandbox, filePath: string): Promise<string | null> {
  try {
    const buffer = await sandbox.readFileToBuffer({ path: filePath });
    return buffer?.toString("utf8") ?? null;
  } catch {
    return null;
  }
}

async function filterPublicUrls(urls: string[]): Promise<string[]> {
  const allowed: string[] = [];
  for (const url of urls) {
    if (!isPublicHttpUrl(url) || isBlockedBrowserNavigationUrl(url)) {
      continue;
    }
    const resolved = await assertResolvablePublicHttpUrl(url);
    if (isErr(resolved)) {
      continue;
    }
    allowed.push(url);
  }
  return allowed;
}

export async function createAuditBrowserSession(): Promise<HtmlPageRenderer> {
  const sandbox = await createConfiguredVercelSandbox({
    timeout: AUDIT_BROWSER_SANDBOX_TIMEOUT_MS,
  });

  const prepare = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", prepareAuditBrowserRuntimeCommand()],
  });
  if (prepare.exitCode !== 0) {
    const output = await prepare.output("both");
    await sandbox.stop().catch(() => undefined);
    throw new AuditBrowserSetupError(
      `sandbox image is missing Playwright at ${SANDBOX_BROWSER_RUNTIME_DIR}: ${output}`,
    );
  }

  await sandbox.writeFiles([
    { path: AUDIT_BROWSER_SCRIPT_PATH, content: Buffer.from(buildAuditPlaywrightScript(), "utf8") },
  ]);

  const browsersPath = shellQuote(SANDBOX_PLAYWRIGHT_BROWSERS_DIR);

  return {
    async render(urls: string[]): Promise<RenderedHtmlPage[]> {
      const allowed = await filterPublicUrls(urls);
      if (allowed.length === 0) {
        return [];
      }

      await sandbox.writeFiles([
        {
          path: AUDIT_BROWSER_INPUT_PATH,
          content: Buffer.from(JSON.stringify({ urls: allowed }), "utf8"),
        },
      ]);

      const result = await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-lc",
          [
            "set -euo pipefail",
            `export PLAYWRIGHT_BROWSERS_PATH=${browsersPath}`,
            `node ${shellQuote(AUDIT_BROWSER_SCRIPT_PATH)}`,
          ].join("\n"),
        ],
      });
      if (result.exitCode !== 0) {
        return [];
      }

      const manifestText = await readSandboxText(sandbox, AUDIT_BROWSER_MANIFEST_PATH);
      if (!manifestText) {
        return [];
      }

      let manifest: { pages?: AuditBrowserManifestPage[] };
      try {
        manifest = JSON.parse(manifestText) as { pages?: AuditBrowserManifestPage[] };
      } catch {
        return [];
      }

      const rendered: RenderedHtmlPage[] = [];
      for (const page of manifest.pages ?? []) {
        if (!page.htmlPath || page.error) {
          continue;
        }
        if (!isPublicHttpUrl(page.url) || isBlockedBrowserNavigationUrl(page.url)) {
          continue;
        }
        const finalResolved = await assertResolvablePublicHttpUrl(page.url);
        if (isErr(finalResolved)) {
          continue;
        }
        const html = await readSandboxText(sandbox, page.htmlPath);
        if (html == null) {
          continue;
        }
        rendered.push({
          requestedUrl: page.requestedUrl,
          url: page.url,
          status: page.status,
          html,
        });
      }
      return rendered;
    },
    async close() {
      await sandbox.stop();
    },
  };
}
