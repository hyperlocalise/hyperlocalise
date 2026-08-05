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

import {
  assertWorkosApiHostnameSafe,
  resolveWorkosApiHostnameOptions,
  WORKOS_PRODUCTION_API_HOSTNAME,
} from "./api-hostname";

describe("assertWorkosApiHostnameSafe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows an unset hostname in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => assertWorkosApiHostnameSafe()).not.toThrow();
  });

  it("allows the production WorkOS hostname in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WORKOS_API_HOSTNAME", WORKOS_PRODUCTION_API_HOSTNAME);
    expect(() => assertWorkosApiHostnameSafe()).not.toThrow();
  });

  it("rejects a non-production hostname when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WORKOS_API_HOSTNAME", "localhost");
    expect(() => assertWorkosApiHostnameSafe()).toThrow(/not allowed/);
  });

  it("rejects a non-production hostname when VERCEL_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("WORKOS_API_HOSTNAME", "localhost");
    expect(() => assertWorkosApiHostnameSafe()).toThrow(/not allowed/);
  });

  it("allows the emulator hostname outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("WORKOS_API_HOSTNAME", "localhost");
    expect(() => assertWorkosApiHostnameSafe()).not.toThrow();
  });
});

describe("resolveWorkosApiHostnameOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined fields when the emulator env is unset", () => {
    expect(resolveWorkosApiHostnameOptions()).toEqual({
      apiHostname: undefined,
      https: undefined,
      port: undefined,
    });
  });

  it("parses emulator host options", () => {
    vi.stubEnv("WORKOS_API_HOSTNAME", "localhost");
    vi.stubEnv("WORKOS_API_HTTPS", "false");
    vi.stubEnv("WORKOS_API_PORT", "4100");

    expect(resolveWorkosApiHostnameOptions()).toEqual({
      apiHostname: "localhost",
      https: false,
      port: 4100,
    });
  });
});
