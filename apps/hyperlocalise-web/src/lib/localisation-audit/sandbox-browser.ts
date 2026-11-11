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
import { assertResolvablePublicHttpUrl } from "@/lib/security/public-http-fetch";
import { isBlockedHost, isPublicHttpUrl } from "@/lib/security/ssrf-guard";
import { createConfiguredVercelSandbox } from "@/lib/vercel-sandbox-config";

import {
  buildAuditPlaywrightScript,
  SANDBOX_AUDIT_BROWSER_PATHS,
  SANDBOX_BROWSER_RUNTIME_DIR,
  SANDBOX_PLAYWRIGHT_BROWSERS_DIR,
  SANDBOX_PLAYWRIGHT_MODULE,
} from "./audit-playwright-script";
import type { HtmlPageRenderer, RenderedHtmlPage } from "./crawl-renderer";
import { parseAuditPageLayout } from "./layout";
import { AuditBrowserSetupError } from "./sandbox-browser-error";

export { AuditBrowserSetupError } from "./sandbox-browser-error";

export const AUDIT_BROWSER_SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;
const AUDIT_BROWSER_DIR = SANDBOX_AUDIT_BROWSER_PATHS.outputDir;
const AUDIT_BROWSER_SCRIPT_PATH = SANDBOX_AUDIT_BROWSER_PATHS.scriptPath;
const AUDIT_BROWSER_INPUT_PATH = SANDBOX_AUDIT_BROWSER_PATHS.inputPath;
const AUDIT_BROWSER_MANIFEST_PATH = SANDBOX_AUDIT_BROWSER_PATHS.manifestPath;
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

type AuditBrowserManifestPage = {
  requestedUrl: string;
  url: string;
  status: number;
  htmlPath?: string;
  error?: string;
  layout?: unknown;
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
          layout: parseAuditPageLayout(page.layout),
        });
      }
      return rendered;
    },
    async close() {
      await sandbox.stop();
    },
  };
}
