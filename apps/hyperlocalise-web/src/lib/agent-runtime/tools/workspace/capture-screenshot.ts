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
import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { assertRepositoryWriteAllowed } from "@/lib/agent-runtime/tools/policy";
import { schema } from "@/lib/database";
import { createStoredFile, getStoredFileContent } from "@/lib/file-storage/records";
import {
  installChromiumSystemDependenciesFunction,
  sandboxPlaywrightVersion,
} from "@/lib/vercel-sandbox-config";

import { normalizeWorkspacePath } from "./path";
import { DEFAULT_MAX_OUTPUT_BYTES, redact, truncate } from "./redact";
import type { RepoToolContext } from "./types";

const DEFAULT_VIEWPORT = { width: 1440, height: 1000 };
const MIN_VIEWPORT_SIZE = 320;
const MAX_VIEWPORT_SIZE = 3840;
/** Extra settle time after Storybook reports the story is ready. */
const DEFAULT_WAIT_FOR_MS = 250;
const MAX_WAIT_FOR_MS = 15_000;
const MAX_WAIT_FOR_TEXT_ITEMS = 12;
const MAX_WAIT_FOR_TEXT_LENGTH = 200;
const STORYBOOK_PORT = 6006;
/** Bound for Playwright navigation / story-render / waitForText. */
const STORYBOOK_READY_TIMEOUT_MS = 30_000;
/** Server cold-start (deps + bundling) is slower than story render; keep a longer poll. */
const STORYBOOK_SERVER_READY_SECONDS = 120;
/** One automatic re-run for transient Storybook/Playwright readiness flakes. */
const MAX_TRANSIENT_CAPTURE_ATTEMPTS = 2;
/** Keep failure excerpts short enough for the model to act on. */
const FAILURE_ERROR_EXCERPT_BYTES = 8_000;
const MANAGED_PLAYWRIGHT_VERSION = sandboxPlaywrightVersion;
const MANAGED_BROWSER_RUNTIME_DIR = "/tmp/hyperlocalise-browser-runtime";
const MANAGED_PLAYWRIGHT_MODULE = `${MANAGED_BROWSER_RUNTIME_DIR}/node_modules/playwright`;
const ERROR_CODE_PREFIX = "HYPERLOCALISE_SCREENSHOT_ERROR_CODE=";

const viewportSchema = z.object({
  width: z.number().int().min(MIN_VIEWPORT_SIZE).max(MAX_VIEWPORT_SIZE),
  height: z.number().int().min(MIN_VIEWPORT_SIZE).max(MAX_VIEWPORT_SIZE),
});

const captureScreenshotInputSchema = z.object({
  target: z.object({
    type: z.literal("storybook"),
    storyId: z.string().min(1).describe("Storybook story id, e.g. components-button--primary."),
  }),
  viewport: viewportSchema.optional(),
  waitForMs: z.number().int().min(0).max(MAX_WAIT_FOR_MS).optional(),
  waitForText: z
    .array(z.string().trim().min(1).max(MAX_WAIT_FOR_TEXT_LENGTH))
    .min(1)
    .max(MAX_WAIT_FOR_TEXT_ITEMS)
    .optional()
    .describe(
      "Visible UI strings that must appear in the story before capture (e.g. the source/target copy under review). Prefer exact substrings from the rendered mock.",
    ),
});

type PackageJson = {
  packageManager?: unknown;
  scripts?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  optionalDependencies?: unknown;
};

type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

export type StorybookScreenshotCommand = {
  packageManager: PackageManager;
  scriptName: string;
  command: string;
  args: string[];
  /** Workspace-relative directory that contains the Storybook package.json. Empty string = repo root. */
  packageDir: string;
};

export type StorybookPackageResolution =
  | {
      packageDir: string;
      packageJsonPath: string;
      packageJson: PackageJson;
      lockfiles: string[];
    }
  | {
      errorCode: "package_json_unavailable" | "storybook_script_not_found";
      error: string;
      checkedFiles: string[];
    };

const STORYBOOK_SCRIPT_NAMES = new Set(["storybook", "dev:storybook", "storybook:dev"]);
const LOCKFILE_NAMES = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "package-lock.json",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function packageManagerFromPackageJson(packageJson: PackageJson): PackageManager | null {
  if (typeof packageJson.packageManager !== "string") {
    return null;
  }

  if (packageJson.packageManager.startsWith("pnpm@")) {
    return "pnpm";
  }
  if (packageJson.packageManager.startsWith("yarn@")) {
    return "yarn";
  }
  if (packageJson.packageManager.startsWith("bun@")) {
    return "bun";
  }
  if (packageJson.packageManager.startsWith("npm@")) {
    return "npm";
  }

  return null;
}

function lockfileBasenames(lockfiles: readonly string[] | undefined): Set<string> {
  return new Set(
    (lockfiles ?? []).map((lockfile) => {
      const segments = lockfile.replace(/\\/g, "/").split("/");
      return segments[segments.length - 1] ?? lockfile;
    }),
  );
}

export function detectPackageManager(input: {
  packageJson: PackageJson;
  lockfiles?: readonly string[];
}): PackageManager {
  const declared = packageManagerFromPackageJson(input.packageJson);
  if (declared) {
    return declared;
  }

  const lockfiles = lockfileBasenames(input.lockfiles);
  if (lockfiles.has("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (lockfiles.has("yarn.lock")) {
    return "yarn";
  }
  if (lockfiles.has("bun.lockb") || lockfiles.has("bun.lock")) {
    return "bun";
  }

  return "npm";
}

/** Storybook 10+ uses a strict CLI that rejects unexpected positional args after `--`. */
const STORYBOOK_STRICT_CLI_MAJOR = 10;

function storybookArgs(port: number) {
  return ["--port", String(port), "--host", "127.0.0.1", "--ci"];
}

/**
 * Parse a major version from a package.json dependency range.
 * Matches a semver-like major (`digits` + `.`), with an optional `~^>=` prefix —
 * e.g. `10.4.6`, `^10.4.6`, `~8.0.0`, `>=9.1.0`, `catalog:storybook@10.0.0`.
 * Returns null when no such major is present (`workspace:*`, `latest`, `file:../storybook-v10`, …).
 */
export function parseDependencyMajorVersion(version: unknown): number | null {
  if (typeof version !== "string") {
    return null;
  }

  const match = version.trim().match(/[~^>=]*(\d+)\./);
  if (!match) {
    return null;
  }

  const major = Number.parseInt(match[1]!, 10);
  return Number.isFinite(major) ? major : null;
}

export function detectStorybookMajorVersion(packageJson: PackageJson): number | null {
  const dependencyBlocks = [
    asRecord(packageJson.dependencies),
    asRecord(packageJson.devDependencies),
    asRecord(packageJson.optionalDependencies),
  ];

  for (const block of dependencyBlocks) {
    const direct = parseDependencyMajorVersion(block.storybook);
    if (direct !== null) {
      return direct;
    }
  }

  for (const block of dependencyBlocks) {
    for (const [name, version] of Object.entries(block)) {
      if (!name.startsWith("@storybook/")) {
        continue;
      }
      const major = parseDependencyMajorVersion(version);
      if (major !== null) {
        return major;
      }
    }
  }

  return null;
}

/**
 * pnpm forwards a literal `--` into the script argv. Storybook 10+ treats those
 * tokens as unexpected positional args for `dev` and exits.
 * When the major version is unknown, prefer the modern (no-separator) form.
 */
export function shouldOmitPackageScriptArgSeparator(input: {
  packageManager: PackageManager;
  storybookMajor: number | null;
}): boolean {
  if (input.packageManager !== "pnpm") {
    return false;
  }

  return input.storybookMajor === null || input.storybookMajor >= STORYBOOK_STRICT_CLI_MAJOR;
}

function buildRunArgs(input: {
  packageManager: PackageManager;
  scriptName: string;
  port: number;
  storybookMajor: number | null;
}) {
  const args = storybookArgs(input.port);

  switch (input.packageManager) {
    case "pnpm":
      if (shouldOmitPackageScriptArgSeparator(input)) {
        return ["run", input.scriptName, ...args];
      }
      return ["run", input.scriptName, "--", ...args];
    case "npm":
      // npm requires `--` so flags like `--port` are not consumed by npm itself.
      return ["run", input.scriptName, "--", ...args];
    case "bun":
      return ["run", input.scriptName, "--", ...args];
    case "yarn":
      return [input.scriptName, ...args];
  }
}

export function hasStorybookScript(packageJson: PackageJson): string | null {
  const scripts = asRecord(packageJson.scripts);
  return Object.keys(scripts).find((name) => STORYBOOK_SCRIPT_NAMES.has(name)) ?? null;
}

export function detectStorybookScreenshotCommand(input: {
  packageJson: PackageJson;
  lockfiles?: readonly string[];
  port?: number;
  packageDir?: string;
}): StorybookScreenshotCommand | { errorCode: "storybook_script_not_found" } {
  const scriptName = hasStorybookScript(input.packageJson);
  if (!scriptName) {
    return { errorCode: "storybook_script_not_found" };
  }

  const packageManager = detectPackageManager(input);
  const storybookMajor = detectStorybookMajorVersion(input.packageJson);
  return {
    packageManager,
    scriptName,
    command: packageManager,
    args: buildRunArgs({
      packageManager,
      scriptName,
      port: input.port ?? STORYBOOK_PORT,
      storybookMajor,
    }),
    packageDir: input.packageDir ?? "",
  };
}

function sortPackageJsonCandidates(paths: readonly string[]) {
  return [...paths].sort((left, right) => {
    const leftDepth = left === "package.json" ? 0 : left.split("/").length;
    const rightDepth = right === "package.json" ? 0 : right.split("/").length;
    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }
    return left.localeCompare(right);
  });
}

export function parsePackageJsonCandidatePaths(stdout: string): string[] {
  const candidates = stdout
    .split("\n")
    .map((line) => line.trim().replace(/^\.\//, ""))
    .filter((line) => line.endsWith("package.json"))
    .map((line) => normalizeWorkspacePath(line))
    .filter((line): line is string => Boolean(line));

  return sortPackageJsonCandidates([...new Set(candidates)]);
}

async function readPackageJsonAt(repo: RepoToolContext, packageJsonPath: string) {
  const raw = await repo.bash.readFile(packageJsonPath);
  return JSON.parse(raw) as PackageJson;
}

async function fileExists(repo: RepoToolContext, path: string) {
  try {
    await repo.bash.readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function detectLockfiles(repo: RepoToolContext, packageDir: string) {
  const dirsToSearch = new Set<string>();
  dirsToSearch.add(packageDir);

  if (packageDir) {
    const segments = packageDir.split("/");
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      dirsToSearch.add(segments.slice(0, index).join("/"));
    }
  }

  const existing: string[] = [];
  for (const dir of dirsToSearch) {
    for (const lockfile of LOCKFILE_NAMES) {
      const path = dir ? `${dir}/${lockfile}` : lockfile;
      if (await fileExists(repo, path)) {
        existing.push(path);
      }
    }
  }

  return existing;
}

async function listPackageJsonCandidates(repo: RepoToolContext): Promise<string[]> {
  const result = await repo.bash.exec("find", {
    args: [
      ".",
      "-name",
      "package.json",
      "-not",
      "-path",
      "*/node_modules/*",
      "-not",
      "-path",
      "*/.git/*",
      "-not",
      "-path",
      "*/.hyperlocalise-agent/*",
      "-not",
      "-path",
      "*/dist/*",
      "-not",
      "-path",
      "*/build/*",
      "-not",
      "-path",
      "*/.next/*",
      "-not",
      "-path",
      "*/coverage/*",
    ],
  });

  if (result.exitCode !== 0) {
    return [];
  }

  return parsePackageJsonCandidatePaths(result.stdout);
}

export async function resolveStorybookPackage(
  repo: RepoToolContext,
): Promise<StorybookPackageResolution> {
  const checkedFiles: string[] = [];
  const candidatePaths = new Set<string>(["package.json"]);

  for (const path of await listPackageJsonCandidates(repo)) {
    candidatePaths.add(path);
  }

  const orderedCandidates = sortPackageJsonCandidates([...candidatePaths]);
  let sawAnyPackageJson = false;

  for (const packageJsonPath of orderedCandidates) {
    checkedFiles.push(packageJsonPath);
    let packageJson: PackageJson;
    try {
      packageJson = await readPackageJsonAt(repo, packageJsonPath);
      sawAnyPackageJson = true;
    } catch {
      continue;
    }

    if (!hasStorybookScript(packageJson)) {
      continue;
    }

    const packageDir =
      packageJsonPath === "package.json" ? "" : packageJsonPath.slice(0, -"/package.json".length);
    const lockfiles = await detectLockfiles(repo, packageDir);

    return {
      packageDir,
      packageJsonPath,
      packageJson,
      lockfiles,
    };
  }

  if (!sawAnyPackageJson) {
    return {
      errorCode: "package_json_unavailable",
      error: "No package.json was found at the repository root or in nested application packages.",
      checkedFiles,
    };
  }

  return {
    errorCode: "storybook_script_not_found",
    error:
      "No supported Storybook script (storybook, dev:storybook, or storybook:dev) was found in package.json.",
    checkedFiles,
  };
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildScreenshotServeUrl(input: {
  organizationSlug: string | null | undefined;
  projectId: string | null | undefined;
  fileId: string;
  fallbackUrl: string;
}) {
  const organizationSlug = input.organizationSlug?.trim();
  if (!organizationSlug) {
    return input.fallbackUrl;
  }

  if (input.projectId) {
    return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(input.projectId)}/assets/${encodeURIComponent(input.fileId)}`;
  }

  return `/api/orgs/${encodeURIComponent(organizationSlug)}/files/${encodeURIComponent(input.fileId)}`;
}

async function resolveOrganizationSlug(input: { organizationId: string; db: ToolContext["db"] }) {
  const [organization] = await input.db
    .select({ slug: schema.organizations.slug })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, input.organizationId))
    .limit(1);

  return organization?.slug ?? null;
}

function buildPlaywrightScript(input: {
  playwrightModulePath: string;
  url: string;
  outputPath: string;
  viewport: { width: number; height: number };
  waitForMs: number;
  waitForText: string[];
}) {
  return `
const { chromium } = require(${JSON.stringify(input.playwrightModulePath)});
const waitForText = ${JSON.stringify(input.waitForText)};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: ${JSON.stringify(input.viewport)}
  });

  // Install Storybook channel hooks before navigation so we do not miss storyRendered.
  await page.addInitScript(() => {
    window.__HYPERLOCALISE_STORY_READY__ = false;
    window.__HYPERLOCALISE_STORY_ERROR__ = null;

    const markReady = () => {
      window.__HYPERLOCALISE_STORY_READY__ = true;
    };
    const markError = (error) => {
      window.__HYPERLOCALISE_STORY_ERROR__ =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : String(error ?? "Storybook story failed");
    };

    const hookChannel = (channel) => {
      if (!channel || channel.__hyperlocaliseHooked) {
        return Boolean(channel);
      }
      channel.__hyperlocaliseHooked = true;
      channel.on("storyRendered", markReady);
      channel.on("storyMissing", markError);
      channel.on("storyErrored", markError);
      channel.on("storyThrewException", markError);
      return true;
    };

    const tryHook = () => {
      if (hookChannel(window.__STORYBOOK_ADDONS_CHANNEL__)) {
        return;
      }
      const preview = window.__STORYBOOK_PREVIEW__;
      const channelFromPreview =
        preview && typeof preview.channel === "object" ? preview.channel : null;
      hookChannel(channelFromPreview);
    };

    tryHook();
    const intervalId = setInterval(() => {
      tryHook();
      if (
        window.__STORYBOOK_ADDONS_CHANNEL__?.__hyperlocaliseHooked ||
        window.__HYPERLOCALISE_STORY_READY__ ||
        window.__HYPERLOCALISE_STORY_ERROR__
      ) {
        clearInterval(intervalId);
      }
    }, 50);
    setTimeout(() => clearInterval(intervalId), ${STORYBOOK_READY_TIMEOUT_MS});
  });

  // Storybook keeps HMR/WebSocket traffic open, so "networkidle" often never settles.
  await page.goto(${JSON.stringify(input.url)}, { waitUntil: "load", timeout: ${STORYBOOK_READY_TIMEOUT_MS} });
  await page.waitForSelector("#storybook-root, #root", { state: "attached", timeout: ${STORYBOOK_READY_TIMEOUT_MS} });

  // Prefer Storybook channel events (storyRendered / storyMissing / errors).
  // Fall back to: preparing overlays gone + #storybook-root has painted content.
  await page.waitForFunction(() => {
    if (window.__HYPERLOCALISE_STORY_ERROR__ || window.__HYPERLOCALISE_STORY_READY__) {
      return true;
    }

    const preparing =
      document.body.classList.contains("sb-show-preparing-story") ||
      document.body.classList.contains("sb-show-preparing-docs") ||
      Boolean(document.querySelector(".sb-preparing-story, .sb-preparing-docs, .sb-nopreview"));
    if (preparing) {
      return false;
    }

    const root = document.querySelector("#storybook-root, #root");
    if (!root) {
      return false;
    }

    return root.childElementCount > 0 || Boolean((root.textContent || "").trim());
  }, { timeout: ${STORYBOOK_READY_TIMEOUT_MS} });

  const storyError = await page.evaluate(() => window.__HYPERLOCALISE_STORY_ERROR__);
  if (storyError) {
    throw new Error("Storybook story failed: " + storyError);
  }

  // Strongest readiness signal for localization mocks: expected copy is in the DOM.
  if (waitForText.length > 0) {
    await page.waitForFunction(
      (texts) => {
        const root = document.querySelector("#storybook-root, #root") || document.body;
        const haystack = root?.innerText || root?.textContent || "";
        return texts.every((text) => haystack.includes(text));
      },
      waitForText,
      { timeout: ${STORYBOOK_READY_TIMEOUT_MS} },
    );
  }

  if (${input.waitForMs} > 0) {
    await page.waitForTimeout(${input.waitForMs});
  }
  await page.screenshot({ path: ${JSON.stringify(input.outputPath)}, fullPage: true });
  await browser.close();
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
`.trimStart();
}

export type ScreenshotCaptureErrorCode =
  | "package_manager_unavailable"
  | "browser_runtime_install_failed"
  | "browser_binary_unavailable"
  | "browser_system_deps_unavailable"
  | "storybook_index_failed"
  | "screenshot_capture_failed";

export function classifyScreenshotCaptureFailure(output: string): ScreenshotCaptureErrorCode {
  const match = output.match(
    /HYPERLOCALISE_SCREENSHOT_ERROR_CODE=(package_manager_unavailable|browser_runtime_install_failed|browser_binary_unavailable|browser_system_deps_unavailable)\b/,
  );
  if (match?.[1]) {
    return match[1] as ScreenshotCaptureErrorCode;
  }
  // Chromium linked against libnspr4/libnss3; surface a structured code when the OS libs are missing.
  if (
    /libnspr4\.so|libnss3\.so|error while loading shared libraries/i.test(output) ||
    /Host system is missing dependencies/i.test(output)
  ) {
    return "browser_system_deps_unavailable";
  }
  if (
    /Unable to index|Broken build, fix the error above|SyntaxError:/i.test(output) &&
    /\.stories\.(tsx?|jsx?|mdx)/i.test(output)
  ) {
    return "storybook_index_failed";
  }
  return "screenshot_capture_failed";
}

const STORYBOOK_STORIES_SUFFIX_PATTERN = /\.stories\.(tsx?|jsx?|mdx)\b/i;
/** Conservative path charset, including Next.js `[param]` / `(group)` segments. */
const STORYBOOK_PATH_CHAR_PATTERN = /[\w@[\]()./-]/;

/**
 * Extract a `.stories.*` path from Storybook failure output.
 * Uses a linear scan (no nested quantifiers) to avoid ReDoS.
 */
export function extractStorybookStoryPathFromFailure(output: string): string | null {
  const suffixMatch = STORYBOOK_STORIES_SUFFIX_PATTERN.exec(output);
  if (!suffixMatch || suffixMatch.index === undefined) {
    return null;
  }

  const end = suffixMatch.index + suffixMatch[0].length;
  let start = suffixMatch.index;
  while (start > 0 && STORYBOOK_PATH_CHAR_PATTERN.test(output.charAt(start - 1))) {
    start -= 1;
  }

  const path = output.slice(start, end).replace(/^\.\//, "");
  return path.length > 0 ? path : null;
}

export function buildScreenshotCaptureRecoveryHint(input: {
  errorCode: string;
  error: string;
}): string | undefined {
  switch (input.errorCode) {
    case "storybook_index_failed": {
      const storyPath = extractStorybookStoryPathFromFailure(input.error);
      return storyPath
        ? `Fix the Storybook syntax/index error in ${storyPath}, then call captureScreenshot again with the same storyId.`
        : "Fix the Storybook story syntax/index error shown in the log, then call captureScreenshot again with the same storyId.";
    }
    case "screenshot_capture_failed":
      if (/story missing|storyErrored|Storybook story failed/i.test(input.error)) {
        return "Verify the storyId and that the temporary story renders without runtime errors, then call captureScreenshot again.";
      }
      if (/waitForText|Timeout/i.test(input.error)) {
        return "Confirm waitForText matches visible copy in the story, adjust mock props if needed, then call captureScreenshot again.";
      }
      return "Inspect the Storybook/Playwright error excerpt, fix the preview in the sandbox if possible, then call captureScreenshot once more.";
    case "browser_runtime_install_failed":
    case "browser_binary_unavailable":
    case "browser_system_deps_unavailable":
    case "package_manager_unavailable":
      return "This is an environment failure. Explain it to the user; do not keep retrying captureScreenshot.";
    case "write_not_allowed":
    case "workspace_write_unavailable":
      return "Screenshot capture requires write access to the sandbox. Explain the limitation to the user.";
    default:
      return undefined;
  }
}

/**
 * Transient readiness flakes can clear on a second launch. Fatal Storybook index /
 * syntax / dependency failures should not be retried by the tool itself.
 */
export function isTransientScreenshotCaptureFailure(input: {
  errorCode: string;
  error: string;
}): boolean {
  if (input.errorCode !== "screenshot_capture_failed") {
    return false;
  }

  if (
    /Unable to index|Broken build|SyntaxError:|ELIFECYCLE|story missing|Storybook story failed/i.test(
      input.error,
    )
  ) {
    return false;
  }

  return (
    /Could not connect to server|Connection refused|ECONNREFUSED|Storybook did not become ready/i.test(
      input.error,
    ) ||
    /Playwright screenshot capture failed[\s\S]*(Timeout|net::ERR_|Target closed)/i.test(
      input.error,
    )
  );
}

export function summarizeScreenshotCaptureFailure(input: {
  errorCode: string;
  error: string;
  truncated?: boolean;
}): {
  errorCode: string;
  summary: string;
  recoveryHint?: string;
  errorExcerpt: string;
  truncated?: boolean;
} {
  const recoveryHint = buildScreenshotCaptureRecoveryHint(input);
  const excerpt = truncate(input.error, FAILURE_ERROR_EXCERPT_BYTES);
  const storyPath = extractStorybookStoryPathFromFailure(input.error);
  const summary =
    input.errorCode === "storybook_index_failed"
      ? storyPath
        ? `Storybook failed to index ${storyPath}.`
        : "Storybook failed to index a stories file."
      : input.errorCode === "screenshot_capture_failed"
        ? "Storybook screenshot capture failed."
        : `Screenshot capture failed (${input.errorCode}).`;

  return {
    errorCode: input.errorCode,
    summary,
    recoveryHint,
    errorExcerpt: excerpt.text,
    truncated: input.truncated || excerpt.truncated || undefined,
  };
}

function managedBrowserRuntimeCommand() {
  const runtimeDir = shellQuote(MANAGED_BROWSER_RUNTIME_DIR);
  const playwrightVersion = shellQuote(`playwright@${MANAGED_PLAYWRIGHT_VERSION}`);
  const browsersPath = shellQuote(`${MANAGED_BROWSER_RUNTIME_DIR}/ms-playwright`);
  const playwrightBin = shellQuote(`${MANAGED_BROWSER_RUNTIME_DIR}/node_modules/.bin/playwright`);

  return [
    "if ! command -v npm >/dev/null 2>&1; then",
    `  echo "${ERROR_CODE_PREFIX}package_manager_unavailable" >&2`,
    "  exit 86",
    "fi",
    `mkdir -p ${runtimeDir}`,
    `if [ ! -d ${shellQuote(MANAGED_PLAYWRIGHT_MODULE)} ]; then`,
    `  npm --prefix ${runtimeDir} init -y >/dev/null 2>&1 || true`,
    `  if ! npm --prefix ${runtimeDir} install --no-audit --no-fund ${playwrightVersion} >/tmp/hyperlocalise-playwright-install.log 2>&1; then`,
    `    cat /tmp/hyperlocalise-playwright-install.log >&2 || true`,
    `    echo "${ERROR_CODE_PREFIX}browser_runtime_install_failed" >&2`,
    "    exit 87",
    "  fi",
    "fi",
    // Prefer OS deps from sandbox bootstrap; retry here when Linux libs are missing.
    // On Amazon Linux (Vercel Sandbox), Playwright install-deps cannot use apt-get.
    installChromiumSystemDependenciesFunction,
    "if command -v ldconfig >/dev/null 2>&1 && ! ldconfig -p 2>/dev/null | grep -q 'libnspr4\\.so'; then",
    "  if ! install_chromium_system_dependencies >/tmp/hyperlocalise-chromium-deps.log 2>&1; then",
    "    cat /tmp/hyperlocalise-chromium-deps.log >&2 || true",
    `    echo "${ERROR_CODE_PREFIX}browser_system_deps_unavailable" >&2`,
    "    exit 89",
    "  fi",
    "fi",
    // Install the browser binary only. System libs are handled above (dnf/apt);
    // `--with-deps` fails on Amazon Linux because Playwright shells out to apt-get.
    `if ! PLAYWRIGHT_BROWSERS_PATH=${browsersPath} ${playwrightBin} install chromium >/tmp/hyperlocalise-chromium-install.log 2>&1; then`,
    `  cat /tmp/hyperlocalise-chromium-install.log >&2 || true`,
    `  echo "${ERROR_CODE_PREFIX}browser_binary_unavailable" >&2`,
    "  exit 88",
    "fi",
  ].join("\n");
}

function buildCaptureCommand(input: {
  storybookCommand: StorybookScreenshotCommand;
  baseDir: string;
  scriptPath: string;
  screenshotPath: string;
  port: number;
}) {
  const storybookCommand = [input.storybookCommand.command, ...input.storybookCommand.args]
    .map(shellQuote)
    .join(" ");
  const packageDir = input.storybookCommand.packageDir;
  const storybookLaunch = packageDir
    ? `(cd ${shellQuote(packageDir)} && ${storybookCommand})`
    : storybookCommand;
  const browsersPath = shellQuote(`${MANAGED_BROWSER_RUNTIME_DIR}/ms-playwright`);

  return [
    "set -euo pipefail",
    managedBrowserRuntimeCommand(),
    // Must match the install path above; otherwise chromium.launch looks in the default cache.
    `export PLAYWRIGHT_BROWSERS_PATH=${browsersPath}`,
    `${storybookLaunch} >/tmp/hyperlocalise-storybook.log 2>&1 &`,
    "SERVER_PID=$!",
    'cleanup() { kill "$SERVER_PID" >/dev/null 2>&1 || true; }',
    "trap cleanup EXIT",
    `for i in $(seq 1 ${STORYBOOK_SERVER_READY_SECONDS}); do if curl -fsS ${shellQuote(
      `http://127.0.0.1:${input.port}/iframe.html`,
    )} >/dev/null 2>&1; then break; fi; sleep 1; done`,
    `if ! curl -fsS ${shellQuote(`http://127.0.0.1:${input.port}/iframe.html`)} >/dev/null; then`,
    '  echo "Storybook did not become ready on the expected port." >&2',
    "  tail -n 80 /tmp/hyperlocalise-storybook.log >&2 || true",
    "  exit 1",
    "fi",
    `if ! node ${shellQuote(input.scriptPath)}; then`,
    '  echo "Playwright screenshot capture failed." >&2',
    "  tail -n 40 /tmp/hyperlocalise-storybook.log >&2 || true",
    "  exit 1",
    "fi",
    // Keep the workspace screenshot directory for sandbox debugging. The durable
    // artifact is stored via createStoredFile; this folder is disposable scaffolding.
    `SCREENSHOT_B64=$(base64 -w 0 ${shellQuote(input.screenshotPath)})`,
    'printf "%s" "$SCREENSHOT_B64"',
  ].join("\n");
}

export type CaptureScreenshotSuccess = {
  success: true;
  fileId: string;
  url: string;
  filename: string;
  contentType: string;
  byteSize: number;
  workspacePath: string;
  screenshotPath: string;
  target: { type: "storybook"; storyId: string };
  viewport: { width: number; height: number };
  storybookUrl: string;
};

type CaptureScreenshotFailure = {
  success: false;
  errorCode: string;
  error: string;
  summary?: string;
  recoveryHint?: string;
  checkedFiles?: string[];
  truncated?: boolean;
  attempts?: number;
};

export type CaptureScreenshotResult = CaptureScreenshotSuccess | CaptureScreenshotFailure;

export function isCaptureScreenshotSuccess(output: unknown): output is CaptureScreenshotSuccess {
  return (
    Boolean(output) &&
    typeof output === "object" &&
    (output as CaptureScreenshotSuccess).success === true &&
    typeof (output as CaptureScreenshotSuccess).fileId === "string"
  );
}

/** Process-local cache so multi-turn toModelOutput replays avoid re-fetching storage. */
const screenshotBase64Cache = new Map<string, string>();
const SCREENSHOT_BASE64_CACHE_LIMIT = 32;

async function loadScreenshotBase64ForModel(input: {
  fileId: string;
  organizationId: string;
  projectId: string | null;
  db: ToolContext["db"];
}) {
  const cached = screenshotBase64Cache.get(input.fileId);
  if (cached) {
    return cached;
  }

  const { content } = await getStoredFileContent({
    fileId: input.fileId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    db: input.db,
  });
  const base64 = content.toString("base64");

  if (screenshotBase64Cache.size >= SCREENSHOT_BASE64_CACHE_LIMIT) {
    const oldestKey = screenshotBase64Cache.keys().next().value;
    if (oldestKey) {
      screenshotBase64Cache.delete(oldestKey);
    }
  }
  screenshotBase64Cache.set(input.fileId, base64);
  return base64;
}

/** Test helper: clear the in-process screenshot base64 cache. */
export function clearScreenshotBase64CacheForTests() {
  screenshotBase64Cache.clear();
}

export function createCaptureScreenshotTool(ctx: ToolContext, repo: RepoToolContext) {
  return tool({
    description: `Capture a screenshot from the connected repository workspace.

Currently supported target:
- Storybook stories by story id

The tool finds package.json at the repository root or in nested app packages, detects the package manager and Storybook script, runs Storybook from that package directory, uses a Hyperlocalise-managed Playwright/Chromium runtime in the sandbox, captures a PNG, and stores it as a Hyperlocalise file artifact.

Pass waitForText with the visible strings that must appear before capture (source/target copy under review). The tool waits for those substrings in the story DOM after Storybook reports ready.

It does not commit, push, open pull requests, or publish repository changes.`,
    inputSchema: captureScreenshotInputSchema,
    toModelOutput: async ({ output }) => {
      if (!isCaptureScreenshotSuccess(output)) {
        const failure = output as CaptureScreenshotFailure;
        const summarized = summarizeScreenshotCaptureFailure({
          errorCode: failure.errorCode,
          error: failure.error,
          truncated: failure.truncated,
        });
        const recoveryHint = failure.recoveryHint ?? summarized.recoveryHint;
        return {
          type: "content",
          value: [
            {
              type: "text",
              text: [
                "Screenshot capture failed.",
                `errorCode: ${summarized.errorCode}`,
                `summary: ${failure.summary ?? summarized.summary}`,
                recoveryHint ? `recoveryHint: ${recoveryHint}` : null,
                failure.attempts && failure.attempts > 1 ? `attempts: ${failure.attempts}` : null,
                failure.checkedFiles?.length
                  ? `checkedFiles: ${failure.checkedFiles.join(", ")}`
                  : null,
                "errorExcerpt:",
                summarized.errorExcerpt,
              ]
                .filter((line): line is string => Boolean(line))
                .join("\n"),
            },
          ],
        };
      }

      try {
        const base64 = await loadScreenshotBase64ForModel({
          fileId: output.fileId,
          organizationId: ctx.organizationId,
          projectId: ctx.projectId,
          db: ctx.db,
        });

        return {
          type: "content",
          value: [
            {
              type: "text",
              text: [
                `Screenshot captured for Storybook story ${output.target.storyId}.`,
                `Stored file: ${output.filename} (${output.fileId}).`,
                `URL: ${output.url}`,
                `Workspace path (sandbox debug): ${output.screenshotPath}`,
                `Viewport: ${output.viewport.width}×${output.viewport.height}`,
              ].join("\n"),
            },
            {
              type: "image-data",
              data: base64,
              mediaType: output.contentType || "image/png",
            },
          ],
        };
      } catch (error) {
        return {
          type: "content",
          value: [
            {
              type: "text",
              text: [
                `Screenshot metadata for ${output.target.storyId}: file ${output.fileId} at ${output.url}.`,
                `Failed to load image bytes for the model: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              ].join("\n"),
            },
          ],
        };
      }
    },
    execute: async (
      { target, viewport = DEFAULT_VIEWPORT, waitForMs = DEFAULT_WAIT_FOR_MS, waitForText = [] },
      { toolCallId },
    ): Promise<CaptureScreenshotResult> => {
      const gate = assertRepositoryWriteAllowed(ctx, "apply_fixes");
      if (!gate.allowed) {
        return {
          success: false as const,
          errorCode: "write_not_allowed" as const,
          error: gate.reason,
          summary: "Screenshot capture is not allowed for this actor.",
          recoveryHint: buildScreenshotCaptureRecoveryHint({
            errorCode: "write_not_allowed",
            error: gate.reason,
          }),
        };
      }
      if (!repo.bash.writeWorkspaceFile) {
        const error = "Workspace write support is required to create screenshot scripts.";
        return {
          success: false as const,
          errorCode: "workspace_write_unavailable" as const,
          error,
          summary: "Workspace write support is unavailable.",
          recoveryHint: buildScreenshotCaptureRecoveryHint({
            errorCode: "workspace_write_unavailable",
            error,
          }),
        };
      }

      ctx.reportToolProgress?.({
        toolCallId,
        message: "Resolving Storybook…",
      });
      const resolvedPackage = await resolveStorybookPackage(repo);
      if ("errorCode" in resolvedPackage) {
        return {
          success: false as const,
          errorCode: resolvedPackage.errorCode,
          error: resolvedPackage.error,
          summary: resolvedPackage.error,
          checkedFiles: resolvedPackage.checkedFiles,
        };
      }

      const detectedCommand = detectStorybookScreenshotCommand({
        packageJson: resolvedPackage.packageJson,
        lockfiles: resolvedPackage.lockfiles,
        port: STORYBOOK_PORT,
        packageDir: resolvedPackage.packageDir,
      });
      // Invariant: resolveStorybookPackage only returns packages with a Storybook script.
      if ("errorCode" in detectedCommand) {
        throw new Error("Invariant violated: Storybook script missing after package resolution");
      }
      const storybookCommand = detectedCommand;

      const captureId = crypto.randomUUID();
      const baseDir = normalizeWorkspacePath(`.hyperlocalise-agent/screenshots/${captureId}`);
      if (!baseDir) {
        return {
          success: false as const,
          errorCode: "invalid_workspace_path" as const,
          error: "Failed to allocate a workspace path for screenshot capture.",
        };
      }

      const storyUrl = `http://127.0.0.1:${STORYBOOK_PORT}/iframe.html?id=${encodeURIComponent(
        target.storyId,
      )}`;
      const scriptPath = `${baseDir}/capture.cjs`;
      const screenshotPath = `${baseDir}/screenshot.png`;

      await repo.bash.writeWorkspaceFile(
        scriptPath,
        buildPlaywrightScript({
          playwrightModulePath: MANAGED_PLAYWRIGHT_MODULE,
          url: storyUrl,
          outputPath: screenshotPath,
          viewport,
          waitForMs,
          waitForText,
        }),
      );

      const captureCommand = buildCaptureCommand({
        storybookCommand,
        baseDir,
        scriptPath,
        screenshotPath,
        port: STORYBOOK_PORT,
      });

      let captureResult: Awaited<ReturnType<RepoToolContext["bash"]["exec"]>> | null = null;
      let attempts = 0;

      for (let attempt = 1; attempt <= MAX_TRANSIENT_CAPTURE_ATTEMPTS; attempt += 1) {
        attempts = attempt;
        ctx.reportToolProgress?.({
          toolCallId,
          message:
            attempt === 1 ? "Preparing browser and loading story…" : "Retrying screenshot capture…",
        });
        captureResult = await repo.bash.exec("bash", {
          args: ["-lc", captureCommand],
        });

        if (captureResult.exitCode === 0) {
          break;
        }

        const failedOutput = truncate(
          redact([captureResult.stdout, captureResult.stderr].join("\n")),
          DEFAULT_MAX_OUTPUT_BYTES,
        );
        const errorCode = classifyScreenshotCaptureFailure(failedOutput.text);
        const canRetry =
          attempt < MAX_TRANSIENT_CAPTURE_ATTEMPTS &&
          isTransientScreenshotCaptureFailure({
            errorCode,
            error: failedOutput.text,
          });
        if (!canRetry) {
          const summarized = summarizeScreenshotCaptureFailure({
            errorCode,
            error: failedOutput.text || "Screenshot capture failed.",
            truncated: failedOutput.truncated,
          });
          return {
            success: false as const,
            errorCode,
            error: summarized.errorExcerpt || "Screenshot capture failed.",
            summary: summarized.summary,
            recoveryHint: summarized.recoveryHint,
            truncated: summarized.truncated,
            attempts,
          };
        }
      }

      if (!captureResult || captureResult.exitCode !== 0) {
        const output = truncate(
          redact([captureResult?.stdout ?? "", captureResult?.stderr ?? ""].join("\n")),
          DEFAULT_MAX_OUTPUT_BYTES,
        );
        const errorCode = classifyScreenshotCaptureFailure(output.text);
        const summarized = summarizeScreenshotCaptureFailure({
          errorCode,
          error: output.text || "Screenshot capture failed.",
          truncated: output.truncated,
        });
        return {
          success: false as const,
          errorCode,
          error: summarized.errorExcerpt || "Screenshot capture failed.",
          summary: summarized.summary,
          recoveryHint: summarized.recoveryHint,
          truncated: summarized.truncated,
          attempts,
        };
      }

      const content = Buffer.from(captureResult.stdout.trim(), "base64");
      ctx.reportToolProgress?.({
        toolCallId,
        message: "Uploading screenshot…",
      });
      const storedFile = await createStoredFile({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        createdByUserId: ctx.localUserId,
        role: "reference",
        sourceKind: "repository_file",
        sourceInteractionId: ctx.conversationId,
        filename: `storybook-${target.storyId}.png`,
        contentType: "image/png",
        content,
        metadata: {
          kind: "visual-mock",
          targetType: target.type,
          storyId: target.storyId,
          viewport,
          waitForMs,
          waitForText,
          packageManager: storybookCommand.packageManager,
          scriptName: storybookCommand.scriptName,
          packageDir: storybookCommand.packageDir || ".",
          packageJsonPath: resolvedPackage.packageJsonPath,
        },
        db: ctx.db,
      });

      // Private Vercel Blob URLs are not browser-readable. Serve via the auth'd
      // app proxy (project assets prefer inline disposition for <img>).
      const organizationSlug = await resolveOrganizationSlug({
        organizationId: ctx.organizationId,
        db: ctx.db,
      });
      const serveUrl = buildScreenshotServeUrl({
        organizationSlug,
        projectId: ctx.projectId,
        fileId: storedFile.id,
        fallbackUrl: storedFile.downloadUrl ?? storedFile.storageUrl,
      });

      return {
        success: true as const,
        fileId: storedFile.id,
        url: serveUrl,
        filename: storedFile.filename,
        contentType: storedFile.contentType,
        byteSize: storedFile.byteSize,
        workspacePath: baseDir,
        screenshotPath,
        target,
        viewport,
        storybookUrl: storyUrl,
      };
    },
  });
}
