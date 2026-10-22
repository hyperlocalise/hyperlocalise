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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const envMock = vi.hoisted(() => ({
  SANDBOX_HYPERLOCALISE_CLI_VERSION: undefined as string | undefined,
}));

vi.mock("@/lib/env", () => ({
  env: envMock,
}));

import {
  defaultSandboxHyperlocaliseReleaseVersion,
  normalizeSandboxCliReleaseVersion,
  resolveSandboxHyperlocaliseReleaseVersion,
  sandboxCliParsesPdf,
} from "./sandbox-cli-version";

describe("resolveSandboxHyperlocaliseReleaseVersion", () => {
  afterEach(() => {
    envMock.SANDBOX_HYPERLOCALISE_CLI_VERSION = undefined;
  });

  it("defaults to the production pin when env is unset", () => {
    expect(resolveSandboxHyperlocaliseReleaseVersion()).toBe(
      defaultSandboxHyperlocaliseReleaseVersion,
    );
    expect(defaultSandboxHyperlocaliseReleaseVersion).toBe("1.13.6");
  });

  it("uses SANDBOX_HYPERLOCALISE_CLI_VERSION when set", () => {
    envMock.SANDBOX_HYPERLOCALISE_CLI_VERSION = "1.13.5";
    expect(resolveSandboxHyperlocaliseReleaseVersion()).toBe("1.13.5");
  });

  it("strips a leading v from overrides", () => {
    envMock.SANDBOX_HYPERLOCALISE_CLI_VERSION = "v1.13.5";
    expect(resolveSandboxHyperlocaliseReleaseVersion()).toBe("1.13.5");
  });
});

describe("normalizeSandboxCliReleaseVersion", () => {
  it("falls back to the production pin for invalid values", () => {
    expect(normalizeSandboxCliReleaseVersion("not-a-version")).toBe(
      defaultSandboxHyperlocaliseReleaseVersion,
    );
  });
});

describe("sandboxCliParsesPdf with resolved pin", () => {
  afterEach(() => {
    envMock.SANDBOX_HYPERLOCALISE_CLI_VERSION = undefined;
  });

  it("is false when override is below the PDF release", () => {
    envMock.SANDBOX_HYPERLOCALISE_CLI_VERSION = "1.13.5";
    expect(sandboxCliParsesPdf()).toBe(false);
  });

  it("is true at the production default", () => {
    expect(sandboxCliParsesPdf()).toBe(true);
  });
});
