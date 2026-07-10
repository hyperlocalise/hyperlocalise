import { tool } from "ai";
import { z } from "zod";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { assertRepositoryWriteAllowed } from "@/lib/agent-runtime/tools/policy";
import { createStoredFile } from "@/lib/file-storage/records";

import { normalizeWorkspacePath } from "./path";
import { DEFAULT_MAX_OUTPUT_BYTES, redact, truncate } from "./redact";
import type { RepoToolContext } from "./types";

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
const MIN_VIEWPORT_SIZE = 320;
const MAX_VIEWPORT_SIZE = 3840;
const DEFAULT_WAIT_FOR_MS = 500;
const MAX_WAIT_FOR_MS = 5000;
const STORYBOOK_PORT = 6006;
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
};

type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

export type StorybookScreenshotCommand = {
  packageManager: PackageManager;
  scriptName: string;
  command: string;
  args: string[];
};

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

export function detectPackageManager(input: {
  packageJson: PackageJson;
  lockfiles?: readonly string[];
}): PackageManager {
  const declared = packageManagerFromPackageJson(input.packageJson);
  if (declared) {
    return declared;
  }

  const lockfiles = new Set(input.lockfiles ?? []);
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

function storybookArgs(port: number) {
  return ["--port", String(port), "--host", "127.0.0.1", "--ci"];
}

function buildRunArgs(packageManager: PackageManager, scriptName: string, port: number) {
  const args = storybookArgs(port);

  switch (packageManager) {
    case "pnpm":
    case "npm":
    case "bun":
      return ["run", scriptName, "--", ...args];
    case "yarn":
      return [scriptName, ...args];
  }
}

export function detectStorybookScreenshotCommand(input: {
  packageJson: PackageJson;
  lockfiles?: readonly string[];
  port?: number;
}): StorybookScreenshotCommand | { errorCode: "storybook_script_not_found" } {
  const scripts = asRecord(input.packageJson.scripts);
  const scriptName = Object.keys(scripts).find(
    (name) => name === "storybook" || name === "dev:storybook" || name === "storybook:dev",
  );

  if (!scriptName) {
    return { errorCode: "storybook_script_not_found" };
  }

  const packageManager = detectPackageManager(input);
  return {
    packageManager,
    scriptName,
    command: packageManager,
    args: buildRunArgs(packageManager, scriptName, input.port ?? STORYBOOK_PORT),
  };
}

async function readPackageJson(repo: RepoToolContext) {
  const raw = await repo.bash.readFile("package.json");
  return JSON.parse(raw) as PackageJson;
}

async function detectLockfiles(repo: RepoToolContext) {
  const lockfiles = ["pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock", "package-lock.json"];
  const existing: string[] = [];

  for (const lockfile of lockfiles) {
    try {
      await repo.bash.readFile(lockfile);
      existing.push(lockfile);
    } catch {
      // Missing lockfiles are expected in generic repositories.
    }
  }

  return existing;
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
  await page.goto(${JSON.stringify(input.url)}, { waitUntil: "networkidle", timeout: 60000 });
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
    /HYPERLOCALISE_SCREENSHOT_ERROR_CODE=(package_manager_unavailable|browser_runtime_install_failed|browser_binary_unavailable)\b/,
  );
  return match?.[1] ?? "screenshot_capture_failed";
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

  return [
    "set -euo pipefail",
    managedBrowserRuntimeCommand(),
    `${storybookCommand} >/tmp/hyperlocalise-storybook.log 2>&1 &`,
    "SERVER_PID=$!",
    'cleanup() { kill "$SERVER_PID" >/dev/null 2>&1 || true; }',
    "trap cleanup EXIT",
    `for i in $(seq 1 60); do if curl -fsS ${shellQuote(
      `http://127.0.0.1:${input.port}/iframe.html`,
    )} >/dev/null 2>&1; then break; fi; sleep 1; done`,
    `curl -fsS ${shellQuote(`http://127.0.0.1:${input.port}/iframe.html`)} >/dev/null`,
    `node ${shellQuote(input.scriptPath)}`,
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

The tool detects the repository package manager and Storybook script, uses a Hyperlocalise-managed Playwright/Chromium runtime in the sandbox, captures a PNG, and stores it as a Hyperlocalise file artifact.

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

      let packageJson: PackageJson;
      try {
        packageJson = await readPackageJson(repo);
      } catch (error) {
        return {
          success: false as const,
          errorCode: "package_json_unavailable" as const,
          error: redact(error instanceof Error ? error.message : String(error)),
        };
      }

      const lockfiles = await detectLockfiles(repo);
      const storybookCommand = detectStorybookScreenshotCommand({
        packageJson,
        lockfiles,
        port: STORYBOOK_PORT,
      });

      if ("errorCode" in storybookCommand) {
        return {
          success: false as const,
          errorCode: storybookCommand.errorCode,
          error: "No supported Storybook script was found in package.json.",
          checkedFiles: ["package.json", ...lockfiles],
        };
      }

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
