import { describe, expect, it, vi } from "vite-plus/test";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { createStoredFile } from "@/lib/file-storage/records";

import {
  classifyScreenshotCaptureFailure,
  createCaptureScreenshotTool,
  detectPackageManager,
  detectStorybookScreenshotCommand,
  parsePackageJsonCandidatePaths,
  resolveStorybookPackage,
} from "./capture-screenshot";
import type { RepoToolContext } from "./types";

vi.mock("@/lib/file-storage/records", () => ({
  createStoredFile: vi.fn(),
}));

const toolCallInfo = { toolCallId: "test-tool-call", messages: [] };

function createToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conv_1",
    organizationId: "org_1",
    localUserId: "user_1",
    membershipRole: "admin",
    projectId: "project_1",
    db: {} as never,
    workMode: "write",
    repositorySource: "chat_ui",
    actor: { sourceUserId: "user_1", role: "admin" },
    sandboxId: "sbx_1",
    ...overrides,
  };
}

function createRepoContext(input: {
  packageJsonByPath?: Record<string, Record<string, unknown>>;
  packageJson?: Record<string, unknown>;
  lockfiles?: readonly string[];
  findStdout?: string;
  execResult?: { exitCode: number; stdout: string; stderr: string };
}) {
  const packageJsonByPath: Record<string, Record<string, unknown>> = {
    ...(input.packageJson ? { "package.json": input.packageJson } : {}),
    ...input.packageJsonByPath,
  };
  const lockfiles = new Set(input.lockfiles ?? []);
  const writtenFiles = new Map<string, string | Buffer>();
  const exec = vi.fn(async (command: string) => {
    if (command === "find") {
      return {
        exitCode: 0,
        stdout: input.findStdout ?? Object.keys(packageJsonByPath).join("\n"),
        stderr: "",
        env: {},
      };
    }

    return {
      exitCode: input.execResult?.exitCode ?? 0,
      stdout: input.execResult?.stdout ?? Buffer.from("png-bytes").toString("base64"),
      stderr: input.execResult?.stderr ?? "",
      env: {},
    };
  });
  const readFile = vi.fn(async (path: string) => {
    if (path in packageJsonByPath) {
      return JSON.stringify(packageJsonByPath[path]);
    }
    if (lockfiles.has(path)) {
      return "";
    }
    throw new Error(`Failed to read ${path}`);
  });
  const writeWorkspaceFile = vi.fn(async (path: string, content: string | Buffer) => {
    writtenFiles.set(path, content);
  });
  const repo: RepoToolContext = {
    bash: {
      exec,
      readFile,
      writeWorkspaceFile,
    },
  };

  return { exec, readFile, repo, writeWorkspaceFile, writtenFiles };
}

describe("detectPackageManager", () => {
  it("prefers the packageManager field", () => {
    expect(
      detectPackageManager({
        packageJson: { packageManager: "pnpm@11.9.0" },
        lockfiles: ["package-lock.json"],
      }),
    ).toBe("pnpm");
  });

  it("falls back to lockfiles, including nested lockfile paths", () => {
    expect(detectPackageManager({ packageJson: {}, lockfiles: ["yarn.lock"] })).toBe("yarn");
    expect(
      detectPackageManager({
        packageJson: {},
        lockfiles: ["apps/hyperlocalise-web/pnpm-lock.yaml"],
      }),
    ).toBe("pnpm");
  });
});

describe("detectStorybookScreenshotCommand", () => {
  it("builds a generic Storybook command from package metadata", () => {
    expect(
      detectStorybookScreenshotCommand({
        packageJson: {
          packageManager: "pnpm@11.9.0",
          scripts: { storybook: "storybook dev" },
        },
        port: 6123,
        packageDir: "apps/web",
      }),
    ).toMatchObject({
      packageManager: "pnpm",
      scriptName: "storybook",
      command: "pnpm",
      args: ["run", "storybook", "--", "--port", "6123", "--host", "127.0.0.1", "--ci"],
      packageDir: "apps/web",
    });
  });

  it("reports when no supported Storybook script exists", () => {
    expect(detectStorybookScreenshotCommand({ packageJson: { scripts: { dev: "vite" } } })).toEqual(
      { errorCode: "storybook_script_not_found" },
    );
  });
});

describe("parsePackageJsonCandidatePaths", () => {
  it("normalizes and prefers shallower package manifests", () => {
    expect(
      parsePackageJsonCandidatePaths(`
./apps/hyperlocalise-web/package.json
./package.json
./docs/package.json
`),
    ).toEqual(["package.json", "docs/package.json", "apps/hyperlocalise-web/package.json"]);
  });
});

describe("resolveStorybookPackage", () => {
  it("uses a nested package when the repository root has no package.json", async () => {
    const { repo } = createRepoContext({
      packageJsonByPath: {
        "apps/hyperlocalise-web/package.json": {
          packageManager: "pnpm@11.12.0",
          scripts: { storybook: "storybook dev -p 6006" },
        },
      },
      lockfiles: ["apps/hyperlocalise-web/pnpm-lock.yaml"],
      findStdout: "apps/hyperlocalise-web/package.json\n",
    });

    await expect(resolveStorybookPackage(repo)).resolves.toMatchObject({
      packageDir: "apps/hyperlocalise-web",
      packageJsonPath: "apps/hyperlocalise-web/package.json",
      lockfiles: ["apps/hyperlocalise-web/pnpm-lock.yaml"],
    });
  });

  it("skips nested packages without Storybook scripts", async () => {
    const { repo } = createRepoContext({
      packageJsonByPath: {
        "docs/package.json": { scripts: { build: "vitepress build" } },
        "apps/hyperlocalise-web/package.json": {
          scripts: { storybook: "storybook dev" },
        },
      },
      findStdout: "docs/package.json\napps/hyperlocalise-web/package.json\n",
    });

    await expect(resolveStorybookPackage(repo)).resolves.toMatchObject({
      packageDir: "apps/hyperlocalise-web",
      packageJsonPath: "apps/hyperlocalise-web/package.json",
    });
  });

  it("returns package_json_unavailable when no manifests exist", async () => {
    const { repo } = createRepoContext({
      findStdout: "",
    });

    await expect(resolveStorybookPackage(repo)).resolves.toMatchObject({
      errorCode: "package_json_unavailable",
    });
  });
});

describe("classifyScreenshotCaptureFailure", () => {
  it("maps managed browser runtime sentinels to structured error codes", () => {
    expect(
      classifyScreenshotCaptureFailure(
        "npm failed\nHYPERLOCALISE_SCREENSHOT_ERROR_CODE=browser_runtime_install_failed",
      ),
    ).toBe("browser_runtime_install_failed");
    expect(
      classifyScreenshotCaptureFailure(
        "chromium failed\nHYPERLOCALISE_SCREENSHOT_ERROR_CODE=browser_binary_unavailable",
      ),
    ).toBe("browser_binary_unavailable");
    expect(classifyScreenshotCaptureFailure("storybook failed")).toBe("screenshot_capture_failed");
  });
});

describe("createCaptureScreenshotTool", () => {
  it("captures a Storybook screenshot using a managed browser runtime", async () => {
    vi.mocked(createStoredFile).mockResolvedValueOnce({
      id: "file_1",
      organizationId: "org_1",
      projectId: "project_1",
      createdByUserId: "user_1",
      role: "reference",
      sourceKind: "repository_file",
      sourceInteractionId: "conv_1",
      sourceJobId: null,
      storageProvider: "vercel_blob",
      storageKey: "organizations/org_1/files/file_1/storybook.png",
      storageUrl: "https://blob.example/storybook.png",
      downloadUrl: "https://download.example/storybook.png",
      filename: "storybook-components-button--primary.png",
      contentType: "image/png",
      byteSize: 9,
      sha256: "hash",
      etag: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { exec, repo, writeWorkspaceFile } = createRepoContext({
      packageJson: {
        packageManager: "pnpm@11.9.0",
        scripts: { storybook: "storybook dev" },
      },
      lockfiles: ["pnpm-lock.yaml"],
    });
    const captureScreenshot = createCaptureScreenshotTool(createToolContext(), repo);

    const result = await captureScreenshot.execute!(
      {
        target: { type: "storybook", storyId: "components-button--primary" },
        viewport: { width: 1280, height: 720 },
      },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: true,
      fileId: "file_1",
      url: "https://download.example/storybook.png",
      target: { type: "storybook", storyId: "components-button--primary" },
      viewport: { width: 1280, height: 720 },
    });
    expect(writeWorkspaceFile).toHaveBeenCalledWith(
      expect.stringMatching(/^\.hyperlocalise-agent\/screenshots\/.+\/capture\.cjs$/),
      expect.stringContaining(
        'require("/tmp/hyperlocalise-browser-runtime/node_modules/playwright")',
      ),
    );
    expect(exec).toHaveBeenCalledWith("bash", {
      args: [
        "-lc",
        expect.stringContaining("npm --prefix '/tmp/hyperlocalise-browser-runtime' install"),
      ],
    });
    expect(exec).toHaveBeenCalledWith("bash", {
      args: ["-lc", expect.stringContaining("'pnpm' 'run' 'storybook'")],
    });
    expect(createStoredFile).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        projectId: "project_1",
        createdByUserId: "user_1",
        role: "reference",
        sourceKind: "repository_file",
        sourceInteractionId: "conv_1",
        filename: "storybook-components-button--primary.png",
        contentType: "image/png",
        content: Buffer.from("png-bytes"),
        metadata: expect.objectContaining({
          kind: "visual-mock",
          targetType: "storybook",
          storyId: "components-button--primary",
          packageDir: ".",
          packageJsonPath: "package.json",
        }),
      }),
    );
  });

  it("captures from a nested Storybook package when root package.json is missing", async () => {
    vi.mocked(createStoredFile).mockResolvedValueOnce({
      id: "file_nested",
      organizationId: "org_1",
      projectId: "project_1",
      createdByUserId: "user_1",
      role: "reference",
      sourceKind: "repository_file",
      sourceInteractionId: "conv_1",
      sourceJobId: null,
      storageProvider: "vercel_blob",
      storageKey: "organizations/org_1/files/file_nested/storybook.png",
      storageUrl: "https://blob.example/storybook-nested.png",
      downloadUrl: "https://download.example/storybook-nested.png",
      filename: "storybook-app-project-overview-page--default.png",
      contentType: "image/png",
      byteSize: 9,
      sha256: "hash",
      etag: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { exec, repo } = createRepoContext({
      packageJsonByPath: {
        "apps/hyperlocalise-web/package.json": {
          packageManager: "pnpm@11.12.0",
          scripts: { storybook: "storybook dev -p 6006" },
        },
      },
      lockfiles: ["apps/hyperlocalise-web/pnpm-lock.yaml"],
      findStdout: "apps/hyperlocalise-web/package.json\n",
    });
    const captureScreenshot = createCaptureScreenshotTool(createToolContext(), repo);

    const result = await captureScreenshot.execute!(
      { target: { type: "storybook", storyId: "app-project-overview-page--default" } },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: true,
      fileId: "file_nested",
    });
    expect(exec).toHaveBeenCalledWith("bash", {
      args: [
        "-lc",
        expect.stringContaining(
          "(cd 'apps/hyperlocalise-web' && 'pnpm' 'run' 'storybook' '--' '--port' '6006' '--host' '127.0.0.1' '--ci')",
        ),
      ],
    });
    expect(createStoredFile).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          packageDir: "apps/hyperlocalise-web",
          packageJsonPath: "apps/hyperlocalise-web/package.json",
        }),
      }),
    );
  });

  it("returns a structured failure when managed Chromium install fails", async () => {
    const { repo } = createRepoContext({
      packageJson: {
        scripts: { storybook: "storybook dev" },
      },
      execResult: {
        exitCode: 88,
        stdout: "",
        stderr: "HYPERLOCALISE_SCREENSHOT_ERROR_CODE=browser_binary_unavailable",
      },
    });
    const captureScreenshot = createCaptureScreenshotTool(createToolContext(), repo);

    const result = await captureScreenshot.execute!(
      { target: { type: "storybook", storyId: "components-button--primary" } },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: false,
      errorCode: "browser_binary_unavailable",
    });
  });

  it("denies capture when the repository write gate rejects the actor", async () => {
    vi.mocked(createStoredFile).mockClear();
    const { exec, repo, writeWorkspaceFile } = createRepoContext({
      packageJson: {
        scripts: { storybook: "storybook dev" },
      },
    });
    const captureScreenshot = createCaptureScreenshotTool(
      createToolContext({
        repositorySource: "slack",
        actor: { sourceUserId: "U1", role: "member" },
      }),
      repo,
    );

    const result = await captureScreenshot.execute!(
      { target: { type: "storybook", storyId: "components-button--primary" } },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: false,
      errorCode: "write_not_allowed",
      error:
        "Slack-triggered write actions require admin privileges. Regular members run in read-only mode.",
    });
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    expect(createStoredFile).not.toHaveBeenCalled();
  });
});
