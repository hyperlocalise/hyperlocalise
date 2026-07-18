import { tool } from "ai";
import { z } from "zod";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { assertRepositoryWriteAllowed } from "@/lib/agent-runtime/tools/policy";
import { createStoredFile } from "@/lib/file-storage/records";

import { normalizeWorkspacePath } from "./path";
import { DEFAULT_MAX_OUTPUT_BYTES, redact, truncate } from "./redact";
import type { RepoToolContext } from "./types";

const DEFAULT_VIEWPORT = { width: 1440, height: 1000 };
const MIN_VIEWPORT_SIZE = 320;
const MAX_VIEWPORT_SIZE = 3840;
const DEFAULT_WAIT_FOR_MS = 500;
const MAX_WAIT_FOR_MS = 5000;
const STORYBOOK_PORT = 6006;
/** Keep in sync with `sandboxPlaywrightVersion` in vercel-sandbox-config.ts. */
const MANAGED_PLAYWRIGHT_VERSION = "1.61.1";
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

function buildPlaywrightScript(input: {
  playwrightModulePath: string;
  url: string;
  outputPath: string;
  viewport: { width: number; height: number };
  waitForMs: number;
}) {
  return `
const { chromium } = require(${JSON.stringify(input.playwrightModulePath)});

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: ${JSON.stringify(input.viewport)}
  });
  // Storybook keeps HMR/WebSocket traffic open, so "networkidle" often never settles.
  await page.goto(${JSON.stringify(input.url)}, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector("#storybook-root, #root", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(${input.waitForMs});
  await page.screenshot({ path: ${JSON.stringify(input.outputPath)}, fullPage: true });
  await browser.close();
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
`.trimStart();
}

export function classifyScreenshotCaptureFailure(output: string) {
  const match = output.match(
    /HYPERLOCALISE_SCREENSHOT_ERROR_CODE=(package_manager_unavailable|browser_runtime_install_failed|browser_binary_unavailable|browser_system_deps_unavailable)\b/,
  );
  if (match?.[1]) {
    return match[1];
  }
  // Chromium linked against libnspr4/libnss3; surface a structured code when the OS libs are missing.
  if (
    /libnspr4\.so|libnss3\.so|error while loading shared libraries/i.test(output) ||
    /Host system is missing dependencies/i.test(output)
  ) {
    return "browser_system_deps_unavailable";
  }
  return "screenshot_capture_failed";
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
    "if command -v ldconfig >/dev/null 2>&1 && ! ldconfig -p 2>/dev/null | grep -q 'libnspr4\\.so'; then",
    "  DEPS_RC=1",
    "  if command -v sudo >/dev/null 2>&1; then",
    `    sudo PLAYWRIGHT_BROWSERS_PATH=${browsersPath} ${playwrightBin} install-deps chromium >/tmp/hyperlocalise-chromium-deps.log 2>&1 && DEPS_RC=0`,
    "  fi",
    '  if [ "$DEPS_RC" -ne 0 ]; then',
    `    PLAYWRIGHT_BROWSERS_PATH=${browsersPath} ${playwrightBin} install-deps chromium >/tmp/hyperlocalise-chromium-deps.log 2>&1 && DEPS_RC=0`,
    "  fi",
    '  if [ "$DEPS_RC" -ne 0 ]; then',
    "    cat /tmp/hyperlocalise-chromium-deps.log >&2 || true",
    `    echo "${ERROR_CODE_PREFIX}browser_system_deps_unavailable" >&2`,
    "    exit 89",
    "  fi",
    "fi",
    `if ! PLAYWRIGHT_BROWSERS_PATH=${browsersPath} ${playwrightBin} install --with-deps chromium >/tmp/hyperlocalise-chromium-install.log 2>&1; then`,
    // `--with-deps` may fail without root even when the browser binary itself installs; retry binary-only.
    `  if ! PLAYWRIGHT_BROWSERS_PATH=${browsersPath} ${playwrightBin} install chromium >/tmp/hyperlocalise-chromium-install.log 2>&1; then`,
    `    cat /tmp/hyperlocalise-chromium-install.log >&2 || true`,
    `    echo "${ERROR_CODE_PREFIX}browser_binary_unavailable" >&2`,
    "    exit 88",
    "  fi",
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
    `for i in $(seq 1 60); do if curl -fsS ${shellQuote(
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
    `SCREENSHOT_B64=$(base64 -w 0 ${shellQuote(input.screenshotPath)})`,
    `rm -rf ${shellQuote(input.baseDir)}`,
    'printf "%s" "$SCREENSHOT_B64"',
  ].join("\n");
}

export function createCaptureScreenshotTool(ctx: ToolContext, repo: RepoToolContext) {
  return tool({
    description: `Capture a screenshot from the connected repository workspace.

Currently supported target:
- Storybook stories by story id

The tool finds package.json at the repository root or in nested app packages, detects the package manager and Storybook script, runs Storybook from that package directory, uses a Hyperlocalise-managed Playwright/Chromium runtime in the sandbox, captures a PNG, and stores it as a Hyperlocalise file artifact.

It does not commit, push, open pull requests, or publish repository changes.`,
    inputSchema: captureScreenshotInputSchema,
    execute: async ({ target, viewport = DEFAULT_VIEWPORT, waitForMs = DEFAULT_WAIT_FOR_MS }) => {
      const gate = assertRepositoryWriteAllowed(ctx, "apply_fixes");
      if (!gate.allowed) {
        return {
          success: false as const,
          errorCode: "write_not_allowed" as const,
          error: gate.reason,
        };
      }
      if (!repo.bash.writeWorkspaceFile) {
        return {
          success: false as const,
          errorCode: "workspace_write_unavailable" as const,
          error: "Workspace write support is required to create screenshot scripts.",
        };
      }

      const resolvedPackage = await resolveStorybookPackage(repo);
      if ("errorCode" in resolvedPackage) {
        return {
          success: false as const,
          errorCode: resolvedPackage.errorCode,
          error: resolvedPackage.error,
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
        }),
      );

      const captureResult = await repo.bash.exec("bash", {
        args: [
          "-lc",
          buildCaptureCommand({
            storybookCommand,
            baseDir,
            scriptPath,
            screenshotPath,
            port: STORYBOOK_PORT,
          }),
        ],
      });

      if (captureResult.exitCode !== 0) {
        const output = truncate(
          redact([captureResult.stdout, captureResult.stderr].join("\n")),
          DEFAULT_MAX_OUTPUT_BYTES,
        );
        const errorCode = classifyScreenshotCaptureFailure(output.text);
        return {
          success: false as const,
          errorCode,
          error: output.text || "Screenshot capture failed.",
          truncated: output.truncated,
        };
      }

      const content = Buffer.from(captureResult.stdout.trim(), "base64");
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
          packageManager: storybookCommand.packageManager,
          scriptName: storybookCommand.scriptName,
          packageDir: storybookCommand.packageDir || ".",
          packageJsonPath: resolvedPackage.packageJsonPath,
        },
        db: ctx.db,
      });

      return {
        success: true as const,
        fileId: storedFile.id,
        url: storedFile.downloadUrl ?? storedFile.storageUrl,
        filename: storedFile.filename,
        contentType: storedFile.contentType,
        byteSize: storedFile.byteSize,
        target,
        viewport,
        storybookUrl: storyUrl,
      };
    },
  });
}
