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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const sandboxMocks = vi.hoisted(() => ({
  create: vi.fn(),
  runCommand: vi.fn(),
  writeFiles: vi.fn(),
  readFileToBuffer: vi.fn(),
  stop: vi.fn(),
  output: vi.fn(),
}));

const assertResolvablePublicHttpUrlMock = vi.hoisted(() => vi.fn());

const envMock = vi.hoisted(() => ({
  VERCEL_SANDBOX_IMAGE: undefined as string | undefined,
}));

vi.mock("@/lib/env", () => ({
  env: envMock,
}));

vi.mock("@/lib/flags/release-flags", () => ({
  isReleaseSandboxVcrImageEnabled: vi.fn(async () => false),
}));

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: sandboxMocks.create,
  },
}));

vi.mock("@/lib/vercel-sandbox-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vercel-sandbox-config")>();
  return {
    ...actual,
    createConfiguredVercelSandbox: sandboxMocks.create,
  };
});

vi.mock("@/lib/security/public-http-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/public-http-fetch")>();
  return {
    ...actual,
    assertResolvablePublicHttpUrl: assertResolvablePublicHttpUrlMock,
  };
});

import { ok } from "@/lib/primitives/result/results";

import {
  buildAuditPlaywrightScript,
  createAuditBrowserSession,
  isBlockedBrowserNavigationUrl,
  managedAuditBrowserRuntimeCommand,
} from "./sandbox-browser";
import { AuditBrowserSetupError } from "./sandbox-browser-error";

describe("audit browser navigation guard", () => {
  it("blocks private and non-http targets before Playwright sees them", () => {
    expect(isBlockedBrowserNavigationUrl("http://127.0.0.1/secret")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("http://localhost/admin")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("http://169.254.169.254/latest/meta-data")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("file:///etc/passwd")).toBe(true);
    expect(isBlockedBrowserNavigationUrl("https://example.com/fr")).toBe(false);
  });
});

describe("audit Playwright script", () => {
  it("renders with Chromium, waits for JavaScript, and aborts private navigations", () => {
    const script = buildAuditPlaywrightScript();
    expect(script).toContain(
      'require("/tmp/hyperlocalise-browser-runtime/node_modules/playwright")',
    );
    expect(script).toContain('waitUntil: "load"');
    expect(script).toContain('waitForLoadState("networkidle"');
    expect(script).toContain("page.route");
    expect(script).toContain("isBlockedNavigationUrl");
    expect(script).toContain("HyperlocaliseLocalisationAudit/1.0");
    expect(managedAuditBrowserRuntimeCommand()).toContain("install chromium");
  });
});

describe("createAuditBrowserSession", () => {
  beforeEach(() => {
    sandboxMocks.create.mockReset();
    sandboxMocks.runCommand.mockReset();
    sandboxMocks.writeFiles.mockReset();
    sandboxMocks.readFileToBuffer.mockReset();
    sandboxMocks.stop.mockReset();
    sandboxMocks.output.mockReset();
    assertResolvablePublicHttpUrlMock.mockReset();

    sandboxMocks.output.mockResolvedValue("ok");
    sandboxMocks.runCommand.mockResolvedValue({
      exitCode: 0,
      output: sandboxMocks.output,
    });
    sandboxMocks.writeFiles.mockResolvedValue(undefined);
    sandboxMocks.stop.mockResolvedValue(undefined);
    sandboxMocks.create.mockResolvedValue({
      runCommand: sandboxMocks.runCommand,
      writeFiles: sandboxMocks.writeFiles,
      readFileToBuffer: sandboxMocks.readFileToBuffer,
      stop: sandboxMocks.stop,
    });
    assertResolvablePublicHttpUrlMock.mockImplementation(async (url: string) => ok(new URL(url)));
  });

  it("installs Playwright once, then renders vetted URLs from the sandbox", async () => {
    sandboxMocks.readFileToBuffer.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith("manifest.json")) {
        return Buffer.from(
          JSON.stringify({
            pages: [
              {
                requestedUrl: "https://example.com/",
                url: "https://example.com/en",
                status: 200,
                htmlPath: "/tmp/hl-audit-browser/0.html",
              },
            ],
          }),
        );
      }
      if (path.endsWith("0.html")) {
        return Buffer.from("<html lang='en'><title>EN</title><body>Hello</body></html>");
      }
      throw new Error(`unexpected read: ${path}`);
    });

    const session = await createAuditBrowserSession();
    const pages = await session.render(["https://example.com/", "http://127.0.0.1/secret"]);
    await session.close();

    expect(pages).toEqual([
      {
        requestedUrl: "https://example.com/",
        url: "https://example.com/en",
        status: 200,
        html: "<html lang='en'><title>EN</title><body>Hello</body></html>",
      },
    ]);
    expect(assertResolvablePublicHttpUrlMock).toHaveBeenCalledWith("https://example.com/");
    expect(assertResolvablePublicHttpUrlMock).not.toHaveBeenCalledWith("http://127.0.0.1/secret");
    expect(sandboxMocks.writeFiles).toHaveBeenCalledWith([
      expect.objectContaining({
        path: "/tmp/hl-audit-browser/urls.json",
        content: Buffer.from(JSON.stringify({ urls: ["https://example.com/"] }), "utf8"),
      }),
    ]);
    expect(sandboxMocks.stop).toHaveBeenCalled();
  });

  it("throws a setup error when Playwright cannot be installed", async () => {
    sandboxMocks.runCommand.mockResolvedValueOnce({
      exitCode: 87,
      output: sandboxMocks.output,
    });
    sandboxMocks.output.mockResolvedValueOnce("browser_runtime_install_failed");

    await expect(createAuditBrowserSession()).rejects.toThrow(AuditBrowserSetupError);
    expect(sandboxMocks.stop).toHaveBeenCalled();
  });

  it("drops rendered pages whose final URL is private", async () => {
    sandboxMocks.readFileToBuffer.mockResolvedValue(
      Buffer.from(
        JSON.stringify({
          pages: [
            {
              requestedUrl: "https://example.com/",
              url: "http://127.0.0.1/secret",
              status: 200,
              htmlPath: "/tmp/hl-audit-browser/0.html",
            },
          ],
        }),
      ),
    );

    const session = await createAuditBrowserSession();
    const pages = await session.render(["https://example.com/"]);

    expect(pages).toEqual([]);
    expect(sandboxMocks.readFileToBuffer).toHaveBeenCalledTimes(1);
  });
});
