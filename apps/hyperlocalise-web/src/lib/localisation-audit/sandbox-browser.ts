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

import { createLogger } from "@/lib/log";
import { createConfiguredVercelSandbox } from "@/lib/vercel-sandbox-config";

import { filterAllowedBrowserUrls, isAllowedBrowserUrl } from "./audit-browser-url-guard";
import { redactAuditErrorText } from "./audit-log";
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
const logger = createLogger("localisation-audit-sandbox");

export const AUDIT_BROWSER_SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;
const AUDIT_BROWSER_DIR = SANDBOX_AUDIT_BROWSER_PATHS.outputDir;
const AUDIT_BROWSER_SCRIPT_PATH = SANDBOX_AUDIT_BROWSER_PATHS.scriptPath;
const AUDIT_BROWSER_INPUT_PATH = SANDBOX_AUDIT_BROWSER_PATHS.inputPath;
const AUDIT_BROWSER_MANIFEST_PATH = SANDBOX_AUDIT_BROWSER_PATHS.manifestPath;
const ERROR_CODE_PREFIX = "HYPERLOCALISE_AUDIT_BROWSER_ERROR_CODE=";

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
    kind: "sandbox",
    async render(urls: string[]): Promise<RenderedHtmlPage[]> {
      const allowed = await filterAllowedBrowserUrls(urls);
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
        logger.warn("sandbox audit browser script failed", {
          exitCode: result.exitCode,
          urlCount: allowed.length,
        });
        return [];
      }

      const manifestText = await readSandboxText(sandbox, AUDIT_BROWSER_MANIFEST_PATH);
      if (!manifestText) {
        logger.warn("sandbox audit browser wrote no manifest", { urlCount: allowed.length });
        return [];
      }

      let manifest: { pages?: AuditBrowserManifestPage[] };
      try {
        manifest = JSON.parse(manifestText) as { pages?: AuditBrowserManifestPage[] };
      } catch {
        logger.warn("sandbox audit browser manifest is not valid json", {
          urlCount: allowed.length,
        });
        return [];
      }

      const rendered: RenderedHtmlPage[] = [];
      const pageErrors: Record<string, number> = {};
      for (const page of manifest.pages ?? []) {
        if (!page.htmlPath || page.error) {
          const key = page.error ? redactAuditErrorText(page.error).slice(0, 120) : "no_html";
          pageErrors[key] = (pageErrors[key] ?? 0) + 1;
          continue;
        }
        if (!(await isAllowedBrowserUrl(page.url))) {
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
      if (Object.keys(pageErrors).length > 0) {
        logger.warn("sandbox audit browser skipped pages", {
          urlCount: allowed.length,
          renderedCount: rendered.length,
          pageErrors,
        });
      }
      return rendered;
    },
    async close() {
      await sandbox.stop();
    },
  };
}
