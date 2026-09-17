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
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  applyDatadogInitEnv,
  COMPLETE_QUERY_STRING_REDACTION_REGEXP,
} from "../../../datadog-init-env.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "../../..");

describe("applyDatadogInitEnv", () => {
  it("derives DD_ENV and DD_VERSION from Vercel when unset", () => {
    const env = applyDatadogInitEnv({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_SHA: "abc123",
    });

    expect(env.DD_ENV).toBe("preview");
    expect(env.DD_VERSION).toBe("abc123");
  });

  it("keeps explicit DD_ENV and DD_VERSION", () => {
    const env = applyDatadogInitEnv({
      DD_ENV: "staging",
      DD_VERSION: "operator-set",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_SHA: "abc123",
    });

    expect(env.DD_ENV).toBe("staging");
    expect(env.DD_VERSION).toBe("operator-set");
  });

  it("redacts the entire query string even when an operator set a weaker regex", () => {
    const env = applyDatadogInitEnv({
      DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP: "password=.*",
    });

    // dd-trace treats `.*` as a full redact and strips `?search=...` from http.url.
    expect(COMPLETE_QUERY_STRING_REDACTION_REGEXP).toBe(".*");
    expect(env.DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP).toBe(".*");
  });
});

describe("datadog-init.mjs", () => {
  it("applies query-string redaction before importing the tracer", () => {
    const source = readFileSync(path.join(APP_ROOT, "datadog-init.mjs"), "utf8");
    const applyIndex = source.indexOf("applyDatadogInitEnv(process.env)");
    const importIndex = source.indexOf('await import("dd-trace/initialize.mjs")');

    expect(applyIndex).toBeGreaterThan(-1);
    expect(importIndex).toBeGreaterThan(applyIndex);
  });
});
